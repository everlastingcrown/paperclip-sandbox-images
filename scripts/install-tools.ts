// Runs with Node's built-in TypeScript support, before installing any tool binaries.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  chmodSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { arch, platform } from 'node:os';

interface Asset {
  url: string;
  sha256: string;
  member?: string;
}
interface Tool {
  version: string;
  platforms: Record<string, Asset>;
}
const tools = JSON.parse(
  readFileSync(new URL('./tools.lock.json', import.meta.url), 'utf8'),
) as Record<string, Tool>;
const groups: Record<string, string[]> = {
  checks: ['actionlint', 'shellcheck', 'hadolint'],
  images: ['trivy'],
  publish: ['cosign'],
};
const names = groups[process.argv[2] ?? 'checks'];
if (!names) throw new Error('Choose checks, images, or publish');
if (platform() !== 'linux')
  throw new Error('Tool installer supports Linux only');
const architecture = arch() === 'x64' ? 'amd64' : arch();
const directory = resolve('out', 'tools');
mkdirSync(directory, { recursive: true });
for (const name of names) {
  const asset = tools[name]?.platforms[architecture];
  if (!asset)
    throw new Error(`Unsupported tool architecture: ${name}/${architecture}`);
  const response = await fetch(asset.url);
  if (!response.ok)
    throw new Error(`Tool download failed: ${name}: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256)
    throw new Error(`Tool checksum mismatch: ${name}`);
  const output = resolve(directory, name);
  if (asset.member) {
    const archive = resolve(directory, `${name}.tar.gz`);
    writeFileSync(archive, bytes);
    const binary = execFileSync('tar', ['-xOzf', archive, asset.member], {
      maxBuffer: 256 * 1024 * 1024,
    });
    writeFileSync(output, binary);
  } else writeFileSync(output, bytes);
  chmodSync(output, 0o755);
  console.log(`Installed ${name} ${tools[name]!.version}`);
}
if (process.env.GITHUB_PATH)
  appendFileSync(process.env.GITHUB_PATH, `${directory}\n`);
else console.log(`Add to PATH: ${directory}`);
