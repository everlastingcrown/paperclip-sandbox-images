import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blobPath, inspectOci, mergeOci } from '../src/oci.js';
import { publish } from '../src/publish.js';
import { assertTested, runtimeArgs, testImages } from '../src/test-images.js';
import type { Runner } from '../src/command.js';
import { fixture, ociFixture, planFor, temp, testedFixture } from './helpers.js';

afterEach(() => vi.unstubAllEnvs());
beforeEach(() => vi.stubEnv('COSIGN_CERTIFICATE_IDENTITY', 'https://github.com/example/repo/.github/workflows/images.yml@refs/heads/main'));
const singlePlan = () => { const c = fixture(); c.images = [c.images[0]!]; return planFor(c); };

describe('OCI integrity', () => {
  it('inspects image bytes and preserves provenance manifests during merge', () => {
    const amd = temp(); const arm = temp(); const output = temp();
    ociFixture(amd, 'amd64', true); ociFixture(arm, 'arm64', true);
    const before = inspectOci(amd, 'amd64');
    const hash = mergeOci([{ dir: amd, arch: 'amd64' }, { dir: arm, arch: 'arm64' }], output);
    const index = JSON.parse(readFileSync(join(output, 'index.json'), 'utf8')) as { manifests: { digest: string }[] };
    expect(hash).toMatch(/^sha256:/); expect(index.manifests).toHaveLength(4);
    expect(index.manifests.some(m => m.digest === before.imageDigest)).toBe(true);
  });
  it('rejects corrupted blobs and incorrect architecture', () => {
    const dir = temp(); ociFixture(dir);
    expect(() => inspectOci(dir, 'arm64')).toThrow('platform');
    const data = inspectOci(dir, 'amd64'); writeFileSync(blobPath(dir, data.imageDigest), '{}');
    expect(() => inspectOci(dir, 'amd64')).toThrow('integrity');
  });
  it('requires both report identity and artifact integrity', () => {
    const plan = singlePlan(); const out = temp(); testedFixture(plan, out);
    expect(assertTested(plan, 'linux/arm64', plan.images[0]!, out).passed).toBe(true);
    plan.build = '124-1';
    expect(() => assertTested(plan, 'linux/arm64', plan.images[0]!, out)).toThrow('mismatch');
  });
  it('rejects changed SBOM evidence after testing', () => {
    const plan = singlePlan(); const out = temp(); testedFixture(plan, out);
    writeFileSync(join(out, 'arm64', 'base-1-reports', 'sbom.cdx.json'), '{"changed":true}');
    expect(() => assertTested(plan, 'linux/arm64', plan.images[0]!, out)).toThrow('mismatch');
  });
});

describe('runtime and scanner gates', () => {
  it.each([
    ['codex-cli 0.114.0', true],
    ['codex-cli v0.114.0', true],
    ['codex-cli 0.114.0-rc.1', false],
    ['codex-cli 0.114.01', false],
    ['codex-cli 0.114.0+modified', false],
  ])('checks exact installed version in %s', (version, passes) => {
    const plan = planFor(); plan.images = [plan.images[2]!];
    const out = temp(); testedFixture(plan, out);
    const run: Runner = (command, args) => {
      if (args.includes('command -v "$1" >/dev/null && "$1" --version')) return version;
      if (args[0] === 'logs') return 'signal-ready';
      if (args[0] === 'inspect') return '42';
      if (command === 'trivy' && args.includes('--output')) writeFileSync(args[args.indexOf('--output') + 1]!, '{}');
      return '';
    };
    if (passes) expect(() => testImages(plan, 'linux/amd64', out, run)).not.toThrow();
    else {
      expect(() => testImages(plan, 'linux/amd64', out, run)).toThrow('Version mismatch');
      expect(existsSync(join(out, 'amd64', 'codex-new.tested.json'))).toBe(false);
    }
  });
  it('uses a restricted profile with writable runtime mounts', () => {
    const args = runtimeArgs('test');
    expect(args).toContain('--read-only'); expect(args).toContain('--cap-drop=ALL');
    expect(args).toContain('--security-opt=no-new-privileges'); expect(args).toContain('--network=none');
    expect(args.join(' ')).toContain('/home/paperclip:rw');
  });
  it('does not leave a passing report when a scanner fails', () => {
    const plan = singlePlan(); const out = temp(); testedFixture(plan, out);
    const run: Runner = (command, args) => {
      if (command === 'trivy') throw new Error('scanner unavailable');
      if (args[0] === 'logs') return 'signal-ready';
      if (args[0] === 'inspect') return '42';
      return '';
    };
    expect(() => testImages(plan, 'linux/amd64', out, run)).toThrow('scanner unavailable');
    expect(existsSync(join(out, 'amd64', 'base-1.tested.json'))).toBe(false);
  });
  it('writes passing evidence only after independent vulnerability and secret gates', () => {
    const plan = singlePlan(); const out = temp(); testedFixture(plan, out);
    const run = vi.fn<Runner>((command, args) => {
      if (args[0] === 'logs') return 'signal-ready';
      if (args[0] === 'inspect') return '42';
      if (command === 'trivy' && args.includes('--output')) writeFileSync(args[args.indexOf('--output') + 1]!, '{}');
      return '';
    });
    testImages(plan, 'linux/amd64', out, run);
    const scans = run.mock.calls.filter(([command]) => command === 'trivy').map(([, args]) => args);
    expect(scans).toHaveLength(4);
    expect(scans.some(args => args.includes('secret') && !args.includes('--ignore-unfixed') && args.includes('--exit-code'))).toBe(true);
    expect(scans.some(args => args.includes('HIGH,CRITICAL') && args.includes('--ignore-unfixed'))).toBe(true);
    expect(assertTested(plan, 'linux/amd64', plan.images[0]!, out).passed).toBe(true);
  });
});

describe('publication', () => {
  it('never invokes registry tools when any architecture lacks a passing report', () => {
    const plan = singlePlan(); const out = temp(); testedFixture(plan, out);
    rmSync(join(out, 'arm64', 'base-1.tested.json'));
    const run = vi.fn<Runner>(() => '');
    expect(() => publish(plan, out, run)).toThrow('Missing passing report');
    expect(run).not.toHaveBeenCalled();
  });
  it('copies exact artifacts, verifies signatures, then advances version and latest aliases', () => {
    vi.stubEnv('COSIGN_CERTIFICATE_IDENTITY', 'https://github.com/example/repo/.github/workflows/images.yml@refs/heads/main');
    const plan = singlePlan(); const out = temp(); testedFixture(plan, out);
    const run = vi.fn<Runner>((command, args) => command === 'skopeo' && args[0] === 'inspect'
      ? readFileSync(join(out, 'release', 'base-1', 'index.json'), 'utf8') : '');
    publish(plan, out, run);
    const calls = run.mock.calls;
    const aliases = calls.filter(([command, args]) => command === 'skopeo' && args.at(-1)?.match(/:(latest|1\.0\.0)$/));
    expect(aliases).toHaveLength(2);
    expect(aliases.every(([, args]) => args.includes('--preserve-digests'))).toBe(true);
    const verification = calls.findLastIndex(([command, args]) => command === 'cosign' && args[0] === 'verify-attestation');
    expect(calls.findIndex(([, args]) => args.at(-1)?.endsWith(':latest'))).toBeGreaterThan(verification);
    expect(calls.some(([command]) => command === 'docker')).toBe(false);
  });
  it('does not advance any aliases after a signing failure', () => {
    const plan = singlePlan(); const out = temp(); testedFixture(plan, out);
    const run = vi.fn<Runner>((command, args) => {
      if (command === 'cosign') throw new Error('signing failed');
      return args[0] === 'inspect' ? readFileSync(join(out, 'release', 'base-1', 'index.json'), 'utf8') : '';
    });
    expect(() => publish(plan, out, run)).toThrow('signing failed');
    expect(run.mock.calls.some(([, args]) => args.at(-1)?.endsWith(':latest'))).toBe(false);
  });
  it('never moves latest when only an older maintained version is rebuilt', () => {
    const plan = planFor(); plan.images = [plan.images[1]!];
    const out = temp(); testedFixture(plan, out);
    const run = vi.fn<Runner>((command, args) => command === 'skopeo' && args[0] === 'inspect'
      ? readFileSync(join(out, 'release', 'codex-old', 'index.json'), 'utf8') : '');
    publish(plan, out, run);
    expect(run.mock.calls.some(([, args]) => args.at(-1)?.endsWith(':0.99.0'))).toBe(true);
    expect(run.mock.calls.some(([, args]) => args.at(-1)?.endsWith(':latest'))).toBe(false);
  });
  it('does not publish a passing image when a later image failed an architecture', () => {
    const plan = planFor(); const out = temp(); testedFixture(plan, out);
    rmSync(join(out, 'arm64', 'python-new-codex.tested.json'));
    const run = vi.fn<Runner>(() => '');
    expect(() => publish(plan, out, run)).toThrow('Missing passing report');
    expect(run).not.toHaveBeenCalled();
  });
  it('rejects a registry that changes tested manifest bytes', () => {
    const plan = singlePlan(); const out = temp(); testedFixture(plan, out);
    expect(() => publish(plan, out, () => '{}')).toThrow('digest mismatch');
  });
  it('skips an empty catalog', () => {
    const run = vi.fn<Runner>(() => ''); publish(planFor({ schemaVersion: 1, images: [] }), temp(), run);
    expect(run).not.toHaveBeenCalled();
  });
});
