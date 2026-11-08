import process from 'node:process';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  treeDigest,
  verifyAssets,
} from '../images/base/runtime/verify-assets.mjs';

const digest = (bytes) =>
  'sha256:' + createHash('sha256').update(bytes).digest('hex');
const canonical = (v) =>
  v && typeof v === 'object'
    ? `{${Object.keys(v)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
        .join(',')}}`
    : JSON.stringify(v);
const directories = [];
afterEach(() =>
  directories
    .splice(0)
    .forEach((path) => rmSync(path, { recursive: true, force: true })),
);

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'runner-assets-'));
  directories.push(root);
  const pack = join(root, 'provider-pack');
  function file(path, bytes) {
    writeFileSync(join(root, path), bytes);
  }
  function json(path, value) {
    file(path, JSON.stringify(value));
  }
  for (const path of [
    'bin',
    'provider-pack/dist',
    'provider-pack/node_modules/.bin',
    'provider-pack/providers/demo',
  ])
    mkdirSync(join(root, path), { recursive: true });
  file('bin/paperclip-runnerd', 'release daemon');
  for (const name of ['node', 'codex', 'claude', 'opencode']) {
    file(
      `provider-pack/node_modules/.bin/${name}`,
      "#!/bin/sh\nprintf '1.2.3\\n'\n",
    );
    chmodSync(join(pack, 'node_modules/.bin', name), 0o755);
  }
  file('provider-pack/dist/bridge.cjs', 'release bridge');
  file('provider-pack/providers/demo/native', 'release provider');
  symlinkSync('native', join(pack, 'providers/demo/launcher'));
  const target = `linux-${process.arch}`;
  const sourceRevision = 'a'.repeat(40);
  const payload = {
    target: { platform: 'linux', architecture: process.arch },
    runnerSourceRevision: sourceRevision,
    artifacts: {
      nodeCommand: {
        path: 'node_modules/.bin/node',
        sha256: digest(readFileSync(join(pack, 'node_modules/.bin/node'))),
      },
    },
    distDigest: treeDigest(join(pack, 'dist')),
    providers: {
      demo: {
        path: 'providers/demo',
        sha256: treeDigest(join(pack, 'providers/demo')),
      },
    },
  };
  const manifest = { payload, digest: digest(canonical(payload)) };
  const daemonSha256 = digest('release daemon');
  json('provider-pack/provider-pack.json', manifest);
  json(`${target}-provider-pack.json`, manifest);
  const sourceImage = 'ghcr.io/example/controller@sha256:' + 'b'.repeat(64);
  const serverArtifact = { url: 'https://example.com/server.tgz' };
  json('asset-origin.json', {
    target,
    sourceImage,
    sourceRevision,
    daemonSource:
      'image:/app/server/dist/vendor/paperclip-runner/bin/paperclip-runnerd',
  });
  json('runner-release.json', {
    sourceRevision,
    sourceImage,
    serverArtifact,
    cliVersions: { codex: '1.2.3', claude: '1.2.3', opencode: '1.2.3' },
    platforms: {
      [target]: {
        daemonSha256,
        serverDaemonSha256: digest('package daemon'),
        daemonPath: 'bin/paperclip-runnerd',
        packDigest: manifest.digest,
      },
    },
  });
  json('server-release-manifest.json', {
    sourceRevision,
    platforms: { [target]: { sha256: digest('package daemon') } },
    remoteProviderPacks: { [target]: { digest: manifest.digest } },
  });
  return root;
}

describe('release-matched Runner assets', () => {
  it('accepts matching daemon, manifest, artifacts and provider trees', () => {
    expect(verifyAssets(fixture()).pack.payload.target.architecture).toBe(
      process.arch,
    );
  });
  it.each([
    ['bin/paperclip-runnerd', 'Runner assets'],
    ['provider-pack/provider-pack.json', 'Runner assets'],
    ['provider-pack/dist/bridge.cjs', 'Pack dist'],
    ['provider-pack/node_modules/.bin/node', 'Pack artifact'],
    ['provider-pack/providers/demo/native', 'Pack provider'],
  ])('rejects changed %s', (path, error) => {
    const root = fixture();
    if (path.endsWith('.json')) {
      const manifest = JSON.parse(readFileSync(join(root, path)));
      manifest.payload.runnerSourceRevision = 'b'.repeat(40);
      writeFileSync(join(root, path), JSON.stringify(manifest));
    } else writeFileSync(join(root, path), 'changed');
    expect(() => verifyAssets(root)).toThrow(error);
  });
  it('accepts only the recorded server daemon when fallback is used', () => {
    const root = fixture();
    const origin = JSON.parse(readFileSync(join(root, 'asset-origin.json')));
    origin.daemonSource = 'https://example.com/server.tgz';
    writeFileSync(join(root, 'asset-origin.json'), JSON.stringify(origin));
    expect(() => verifyAssets(root)).toThrow('Runner assets');
    writeFileSync(join(root, 'bin/paperclip-runnerd'), 'package daemon');
    expect(() => verifyAssets(root)).not.toThrow();
  });
  it('rejects unrecorded asset origins', () => {
    const root = fixture();
    const origin = JSON.parse(readFileSync(join(root, 'asset-origin.json')));
    origin.daemonSource = 'https://example.com/other-release.tgz';
    writeFileSync(join(root, 'asset-origin.json'), JSON.stringify(origin));
    expect(() => verifyAssets(root)).toThrow('Unknown Runner daemon source');
  });
  it('rejects a changed provider symlink', () => {
    const root = fixture();
    rmSync(join(root, 'provider-pack/providers/demo/launcher'));
    symlinkSync(
      '../../dist/bridge.cjs',
      join(root, 'provider-pack/providers/demo/launcher'),
    );
    expect(() => verifyAssets(root)).toThrow('Pack provider mismatch');
  });
  it('rejects an artifact symlink outside the pack even when its bytes match', () => {
    const root = fixture();
    const native = join(root, 'provider-pack/node_modules/.bin/node');
    writeFileSync(join(root, 'outside'), readFileSync(native));
    rmSync(native);
    symlinkSync(join(root, 'outside'), native);
    expect(() => verifyAssets(root)).toThrow('escapes root');
  });
  it('imports the image daemon and rejects changed image bytes without fallback', () => {
    const root = fixture();
    const source = join(root, 'image-source');
    const vendor = join(source, 'server/dist/vendor/paperclip-runner/bin');
    mkdirSync(vendor, { recursive: true });
    const lock = JSON.parse(readFileSync(join(root, 'runner-release.json')));
    writeFileSync(
      join(source, 'server/dist/build-info.json'),
      JSON.stringify({ commit: lock.sourceRevision }),
    );
    const daemon = join(vendor, 'paperclip-runnerd');
    writeFileSync(daemon, 'release daemon');
    const run = () =>
      execFileSync(
        process.execPath,
        [
          resolve('images/base/runtime/import-assets.mjs'),
          source,
          process.arch === 'x64' ? 'amd64' : process.arch,
        ],
        { cwd: root, stdio: 'pipe' },
      );
    expect(run).not.toThrow();
    expect(() => verifyAssets(root)).not.toThrow();
    writeFileSync(daemon, 'package daemon');
    expect(run).toThrow('Daemon does not match controller release');
  });
  it('records the selected asset source, daemon bytes, CLI versions and package licenses', () => {
    const root = fixture();
    const packageRoot = join(root, 'provider-pack/node_modules/demo');
    mkdirSync(packageRoot);
    writeFileSync(
      join(packageRoot, 'package.json'),
      JSON.stringify({ name: 'demo', version: '1.2.3', license: 'MIT' }),
    );
    execFileSync(
      process.execPath,
      [resolve('images/base/runtime/verify-assets.mjs'), root, '--record'],
      { stdio: 'pipe' },
    );
    const provenance = JSON.parse(readFileSync(join(root, 'provenance.json')));
    expect(provenance.daemonSha256).toBe(digest('release daemon'));
    expect(provenance.assetOrigin.daemonSource).toMatch(/^image:/);
    expect(provenance.cliVersions).toEqual({
      codex: '1.2.3',
      claude: '1.2.3',
      opencode: '1.2.3',
    });
    expect(provenance.licenses).toContainEqual({
      name: 'demo',
      version: '1.2.3',
      license: 'MIT',
      path: 'provider-pack/node_modules/demo/package.json',
    });
  });
  it('pins both source image manifests to their own architecture and revision', () => {
    const lock = JSON.parse(
      readFileSync('images/base/runtime/runner-release.json'),
    );
    for (const [target, expected] of Object.entries(lock.platforms)) {
      const pack = JSON.parse(
        readFileSync(`images/base/runtime/${target}-provider-pack.json`),
      );
      expect(pack.digest).toBe(expected.packDigest);
      expect(digest(canonical(pack.payload))).toBe(expected.packDigest);
      expect(pack.payload.target).toEqual({
        platform: 'linux',
        architecture: target.slice(6),
      });
      expect(pack.payload.runnerSourceRevision).toBe(lock.sourceRevision);
    }
  });
  it('keeps source image and CLI smoke versions tied to one release lock', () => {
    const lock = JSON.parse(
      readFileSync('images/base/runtime/runner-release.json'),
    );
    const catalog = JSON.parse(readFileSync('catalog/images.json'));
    const dockerfile = readFileSync('images/base/runtime/Dockerfile', 'utf8');
    expect(dockerfile).toContain(`FROM ${lock.sourceImage} AS runner-source`);
    for (const [command, version] of Object.entries(lock.cliVersions)) {
      expect(
        catalog.images[0].checks.find(
          (check) =>
            check.command === (command === 'claude' ? 'claude-code' : command),
        ).expected,
      ).toBe(version);
    }
  });
});
