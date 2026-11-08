import { Buffer } from 'node:buffer';
import process from 'node:process';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const [source, arch] = process.argv.slice(2);
const target = { amd64: 'linux-x64', arm64: 'linux-arm64' }[arch];
if (!target) throw new Error('Unsupported Runner target');
const lock = JSON.parse(readFileSync('runner-release.json'));
const release = JSON.parse(readFileSync('server-release-manifest.json'));
const vendor = join(source, 'server/dist/vendor/paperclip-runner');
const expected = lock.platforms[target];
const candidate = join(vendor, expected.daemonPath);
if (
  release.sourceRevision !== lock.sourceRevision ||
  release.platforms[target].sha256 !== expected.serverDaemonSha256
)
  throw new Error('Server fallback release metadata mismatch');
const sha256 = (bytes) =>
  'sha256:' + createHash('sha256').update(bytes).digest('hex');
mkdirSync('bin', { recursive: true });
let daemonSource;
let daemonSha256;
if (existsSync(candidate)) {
  // A present but mismatched image daemon is an error, never a silent fallback.
  const stamp = JSON.parse(
    readFileSync(join(source, 'server/dist/build-info.json')),
  );
  if (stamp.commit !== lock.sourceRevision)
    throw new Error('Image source revision mismatch');
  copyFileSync(candidate, 'bin/paperclip-runnerd');
  daemonSource = 'image:' + candidate.replace(source, '/app');
  daemonSha256 = expected.daemonSha256;
} else {
  console.log(
    `Image daemon absent: /app/server/dist/vendor/paperclip-runner/${expected.daemonPath}; using matching server release`,
  );
  const response = await globalThis.fetch(lock.serverArtifact.url);
  if (!response.ok)
    throw new Error(`Server artifact download failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (sha256(bytes) !== 'sha256:' + lock.serverArtifact.sha256)
    throw new Error('Server artifact checksum mismatch');
  writeFileSync('/tmp/server.tgz', bytes);
  const member = `package/dist/vendor/paperclip-runner/bin/${release.platforms[target].path}`;
  execFileSync('tar', ['-xzf', '/tmp/server.tgz', '-C', '/tmp', member]);
  copyFileSync(join('/tmp', member), 'bin/paperclip-runnerd');
  rmSync('/tmp/package', { recursive: true, force: true });
  rmSync('/tmp/server.tgz');
  daemonSource = lock.serverArtifact.url;
  daemonSha256 = expected.serverDaemonSha256;
}
if (sha256(readFileSync('bin/paperclip-runnerd')) !== daemonSha256)
  throw new Error('Daemon does not match controller release');
chmodSync('bin/paperclip-runnerd', 0o755);
writeFileSync(
  'asset-origin.json',
  JSON.stringify(
    {
      target,
      daemonSource,
      sourceImage: lock.sourceImage,
      sourceRevision: lock.sourceRevision,
    },
    null,
    2,
  ) + '\n',
);
