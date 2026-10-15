import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { Image, Plan, Platform } from './types.js';
import type { Runner } from './command.js';
import { architecture } from './build.js';
import { inspectOci } from './oci.js';
import { digest, planDigest } from './plan.js';

export interface TestReport {
  passed: true;
  planDigest: string;
  rootDigest: string;
  imageDigest: string;
  platform: Platform;
  image: string;
  evidence: Record<string, string>;
}

export function evidenceDigests(directory: string): Record<string, string> {
  return Object.fromEntries(['vulnerabilities.json', 'secrets.json', 'sbom.cdx.json'].map(name => {
    const bytes = readFileSync(join(directory, name));
    JSON.parse(bytes.toString());
    return [name, digest(bytes)];
  }));
}

export function runtimeArgs(name: string): string[] {
  return ['--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--network=none',
    '--pids-limit=128', '--memory=1g', '--cpus=2',
    ...['/workspace', '/home/paperclip', '/tmp'].flatMap(path => ['--tmpfs', `${path}:rw,nosuid,nodev,uid=1000,gid=1000,mode=0700`]),
    '-e', 'HOME=/home/paperclip', '-e', 'XDG_CACHE_HOME=/home/paperclip', '-e', 'TMPDIR=/tmp', '--name', name];
}

export function testRuntime(image: Image, reference: string, out: string, run: Runner): void {
  const prefix = `contract-${image.id}`;
  const container = (suffix: string, args: string[], command: string[]): string => {
    const name = `${prefix}-${suffix}`;
    try { return run('docker', ['run', ...runtimeArgs(name), ...args, reference, ...command]); }
    finally { run('docker', ['rm', '--force', name]); }
  };
  container('base', ['--mount', `type=bind,src=${resolve('scripts/runtime-contract.sh')},dst=/contract.sh,readonly`, '--entrypoint', '/bin/sh'], ['/contract.sh']);
  for (const [index, check] of image.checks.entries()) {
    const version = container(`version-${index}`, ['--entrypoint', '/bin/sh'],
      ['-c', 'command -v "$1" >/dev/null && "$1" --version', 'check', check.command]);
    const escaped = check.expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`(?:^|[^0-9A-Za-z.+-])v?${escaped}(?=$|[^0-9A-Za-z.+-])`).test(version)) throw new Error(`Version mismatch: ${image.id}/${check.command}: ${version}`);
    container(`smoke-${index}`, ['--entrypoint', '/bin/sh'], ['-c', check.smoke]);
  }
  const spec = resolve(out, `${image.id}-runtime-command.json`);
  writeFileSync(spec, JSON.stringify({ command: 'node', args: ['-e',
    'process.on("SIGTERM",()=>process.exit(42)); console.log("signal-ready"); setInterval(()=>{},1000)'] }));
  const name = `${prefix}-signal`;
  try {
    run('docker', ['run', '-d', ...runtimeArgs(name), '--mount', `type=bind,src=${spec},dst=/run/paperclip/runtime-command.json,readonly`, reference]);
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (run('docker', ['logs', name]).includes('signal-ready')) { ready = true; break; }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
    if (!ready) throw new Error(`Shim did not launch command: ${image.id}`);
    run('docker', ['stop', '--time', '5', name]);
    if (run('docker', ['inspect', '--format', '{{.State.ExitCode}}', name]) !== '42') throw new Error(`Signal/exit forwarding failed: ${image.id}`);
  } finally { run('docker', ['rm', '--force', name]); rmSync(spec, { force: true }); }
}

export function testImages(plan: Plan, platform: Platform, out: string, run: Runner): void {
  const arch = architecture(platform);
  for (const image of plan.images) {
    const dir = resolve(out, arch, image.id);
    const reportPath = join(out, arch, `${image.id}.tested.json`);
    rmSync(reportPath, { force: true });
    const oci = inspectOci(dir, arch);
    if (oci.config.config.User !== '1000:1000' || oci.config.config.WorkingDir !== '/workspace') throw new Error(`Unsafe image defaults: ${image.id}`);
    const local = `paperclip-test/${image.id}:candidate`;
    run('skopeo', ['copy', '--override-arch', arch, `oci:${dir}`, `docker-daemon:${local}`]);
    try {
      testRuntime(image, local, resolve(out, arch), run);
      // Separate secret scanning so CVE severity/status filtering never hides secrets.
      const reportDir = resolve(out, arch, `${image.id}-reports`);
      mkdirSync(reportDir, { recursive: true });
      run('trivy', ['image', '--input', dir, '--scanners', 'vuln', '--format', 'json', '--output', join(reportDir, 'vulnerabilities.json')]);
      run('trivy', ['image', '--input', dir, '--scanners', 'vuln', '--severity', 'HIGH,CRITICAL', '--ignore-unfixed', '--exit-code', '1']);
      run('trivy', ['image', '--input', dir, '--scanners', 'secret', '--exit-code', '1', '--format', 'json', '--output', join(reportDir, 'secrets.json')]);
      run('trivy', ['image', '--input', dir, '--format', 'cyclonedx', '--output', join(reportDir, 'sbom.cdx.json')]);
      const report: TestReport = { passed: true, planDigest: planDigest(plan), rootDigest: oci.rootDigest,
        imageDigest: oci.imageDigest, platform, image: image.id, evidence: evidenceDigests(reportDir) };
      writeFileSync(reportPath, JSON.stringify(report, null, 2));
    } finally { run('docker', ['image', 'rm', '--force', local]); }
  }
}

export function assertTested(plan: Plan, platform: Platform, image: Image, out: string): TestReport {
  const arch = architecture(platform);
  const file = join(out, arch, `${image.id}.tested.json`);
  if (!existsSync(file)) throw new Error(`Missing passing report: ${image.id}/${arch}`);
  const report = JSON.parse(readFileSync(file, 'utf8')) as TestReport;
  const oci = inspectOci(join(out, arch, image.id), arch);
  const evidence = evidenceDigests(join(out, arch, `${image.id}-reports`));
  if (report.passed !== true || report.planDigest !== planDigest(plan) || report.platform !== platform ||
    report.image !== image.id || report.rootDigest !== oci.rootDigest || report.imageDigest !== oci.imageDigest ||
    JSON.stringify(report.evidence) !== JSON.stringify(evidence)) {
    throw new Error(`Tested artifact mismatch: ${image.id}/${arch}`);
  }
  return report;
}
