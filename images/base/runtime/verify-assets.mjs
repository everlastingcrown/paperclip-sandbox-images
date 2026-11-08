import { Buffer } from 'node:buffer';
import process from 'node:process';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  openSync,
  readSync,
  closeSync,
  accessSync,
  constants,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sha256 = (bytes) =>
  'sha256:' + createHash('sha256').update(bytes).digest('hex');
function fileDigest(path) {
  const hash = createHash('sha256');
  const fd = openSync(path, 'r');
  const buffer = Buffer.alloc(1024 * 1024);
  try {
    let length;
    while ((length = readSync(fd, buffer, 0, buffer.length, null)) > 0)
      hash.update(buffer.subarray(0, length));
  } finally {
    closeSync(fd);
  }
  return 'sha256:' + hash.digest('hex');
}
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const canonical = (value) =>
  Array.isArray(value)
    ? `[${value.map(canonical).join(',')}]`
    : value && typeof value === 'object'
      ? `{${Object.keys(value)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
          .join(',')}}`
      : JSON.stringify(value);

// Match the release producer's directory/file/symlink hashing contract.
export function treeDigest(root) {
  const hash = createHash('sha256');
  function visit(directory, prefix = '') {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      const path = join(directory, entry.name);
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        hash.update(`directory\0${name}\n`);
        visit(path, name);
      } else if (entry.isFile()) {
        hash.update(`file\0${name}\0${fileDigest(path)}\n`);
      } else if (entry.isSymbolicLink()) {
        hash.update(`symlink\0${name}\0${readlinkSync(path)}\n`);
      } else throw new Error(`Unsupported pack entry: ${name}`);
    }
  }
  visit(root);
  return 'sha256:' + hash.digest('hex');
}

export function verifyAssets(root) {
  const lock = readJson(join(root, 'runner-release.json'));
  const target = `linux-${process.arch}`;
  const expected = lock.platforms[target];
  if (process.platform !== 'linux' || !expected)
    throw new Error('Unsupported Runner platform');
  const origin = readJson(join(root, 'asset-origin.json'));
  if (
    origin.target !== target ||
    origin.sourceImage !== lock.sourceImage ||
    origin.sourceRevision !== lock.sourceRevision
  )
    throw new Error('Runner asset origin mismatch');
  const imageSource = `image:/app/server/dist/vendor/paperclip-runner/${expected.daemonPath}`;
  if (origin.daemonSource !== imageSource)
    throw new Error('Unknown Runner daemon source');
  const packRoot = join(root, 'provider-pack');
  const pack = readJson(join(packRoot, 'provider-pack.json'));
  const official = readFileSync(join(root, `${target}-provider-pack.json`));
  if (
    sha256(readFileSync(join(packRoot, 'provider-pack.json'))) !==
      sha256(official) ||
    pack.digest !== expected.packDigest ||
    sha256(canonical(pack.payload)) !== pack.digest ||
    pack.payload.runnerSourceRevision !== lock.sourceRevision ||
    pack.payload.target.platform !== 'linux' ||
    pack.payload.target.architecture !== process.arch ||
    fileDigest(join(root, 'bin/paperclip-runnerd')) !== expected.daemonSha256
  ) {
    throw new Error('Runner assets do not match the pinned controller release');
  }
  function contained(path) {
    const actual = realpathSync(join(packRoot, path));
    const rel = relative(realpathSync(packRoot), actual);
    if (rel.startsWith('../') || rel === '..')
      throw new Error(`Pack path escapes root: ${path}`);
    return actual;
  }
  for (const artifact of Object.values(pack.payload.artifacts)) {
    if (fileDigest(contained(artifact.path)) !== artifact.sha256)
      throw new Error(`Pack artifact mismatch: ${artifact.path}`);
  }
  if (treeDigest(join(packRoot, 'dist')) !== pack.payload.distDigest)
    throw new Error('Pack dist mismatch');
  for (const provider of Object.values(pack.payload.providers ?? {})) {
    if (treeDigest(contained(provider.path)) !== provider.sha256)
      throw new Error(`Pack provider mismatch: ${provider.path}`);
  }
  const executables = {};
  for (const name of ['codex', 'claude', 'opencode']) {
    const path = contained(`node_modules/.bin/${name}`);
    accessSync(path, constants.X_OK);
    executables[name] = path;
  }
  accessSync(
    contained(pack.payload.artifacts.nodeCommand.path),
    constants.X_OK,
  );
  return { lock, pack, executables };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = resolve(
    process.argv[2] ?? dirname(fileURLToPath(import.meta.url)),
  );
  const { lock, pack, executables } = verifyAssets(root);
  if (process.argv.includes('--record')) {
    const cliVersions = Object.fromEntries(
      Object.entries(executables).map(([name, path]) => {
        const output = execFileSync(path, ['--version'], {
          encoding: 'utf8',
          timeout: 30000,
        }).trim();
        if (!output.includes(lock.cliVersions[name]))
          throw new Error(`CLI release mismatch: ${name}: ${output}`);
        return [name, output];
      }),
    );
    // Preserve the package license files in the untouched pack. Record their
    // package metadata for provenance without copying or rewriting the graph.
    const licenses = [];
    function visit(directory) {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) visit(path);
        else if (entry.isFile() && entry.name === 'package.json') {
          const pkg = readJson(path);
          if (pkg.name && pkg.version)
            licenses.push({
              name: pkg.name,
              version: pkg.version,
              license: pkg.license ?? 'SEE PACKAGE LICENSE',
              path: relative(root, path),
            });
        }
      }
    }
    visit(join(root, 'provider-pack/node_modules'));
    writeFileSync(
      join(root, 'provenance.json'),
      JSON.stringify(
        {
          ...lock,
          packIdentity: pack.digest,
          daemonSha256: fileDigest(join(root, 'bin/paperclip-runnerd')),
          assetOrigin: readJson(join(root, 'asset-origin.json')),
          target: pack.payload.target,
          cliVersions,
          executables,
          licenses,
          paperclipLicense:
            '/usr/local/share/licenses/paperclip-agent-shim/LICENSE',
        },
        null,
        2,
      ) + '\n',
    );
  }
  console.log(
    `Verified Paperclip ${lock.release} ${process.arch}: ${pack.digest}`,
  );
}
