import process from 'node:process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const [source, arch] = process.argv.slice(2);
const target = { amd64: 'linux-x64', arm64: 'linux-arm64' }[arch];
if (!target) throw new Error('Unsupported Runner target');
const lock = JSON.parse(readFileSync('runner-release.json'));
const vendor = join(source, 'server/dist/vendor/paperclip-runner');
const expected = lock.platforms[target];
const candidate = join(vendor, expected.daemonPath);
const sha256 = (bytes) =>
  'sha256:' + createHash('sha256').update(bytes).digest('hex');
mkdirSync('bin', { recursive: true });
if (!existsSync(candidate))
  throw new Error('Pinned image Runner daemon missing');
const stamp = JSON.parse(
  readFileSync(join(source, 'server/dist/build-info.json')),
);
if (stamp.commit !== lock.sourceRevision)
  throw new Error('Image source revision mismatch');
copyFileSync(candidate, 'bin/paperclip-runnerd');
const daemonSource = 'image:' + candidate.replace(source, '/app');
if (sha256(readFileSync('bin/paperclip-runnerd')) !== expected.daemonSha256)
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
