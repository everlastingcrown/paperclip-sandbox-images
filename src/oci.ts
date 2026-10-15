import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { digest } from './plan.js';

export interface Descriptor {
  mediaType: string;
  digest: string;
  size: number;
  platform?: { os: string; architecture: string; variant?: string };
  annotations?: Record<string, string>;
}
interface Manifest {
  schemaVersion: number;
  mediaType?: string;
  artifactType?: string;
  manifests?: Descriptor[];
  config?: Descriptor;
  layers?: Descriptor[];
}
export interface OciImage {
  rootDigest: string;
  imageDigest: string;
  config: {
    architecture: string;
    os: string;
    config: {
      User?: string;
      WorkingDir?: string;
      Env?: string[];
      Entrypoint?: string[];
      Cmd?: string[];
    };
  };
  manifests: Descriptor[];
  blobs: string[];
}

export function blobPath(dir: string, hash: string): string {
  if (!/^sha256:[a-f0-9]{64}$/.test(hash))
    throw new Error(`Invalid OCI digest: ${hash}`);
  return join(dir, 'blobs', 'sha256', hash.slice(7));
}

export function inspectOci(dir: string, arch: string): OciImage {
  const index = readFileSync(join(dir, 'index.json'));
  if (
    JSON.parse(readFileSync(join(dir, 'oci-layout'), 'utf8'))[
      'imageLayoutVersion'
    ] !== '1.0.0'
  )
    throw new Error('Invalid OCI layout');
  const blobs = new Set<string>();
  const manifests: Descriptor[] = [];
  const runnable: { hash: string; config: OciImage['config'] }[] = [];
  function read(descriptor: Descriptor): Buffer {
    const bytes = readFileSync(blobPath(dir, descriptor.digest));
    if (digest(bytes) !== descriptor.digest || descriptor.size !== bytes.length)
      throw new Error(`OCI blob integrity failure: ${descriptor.digest}`);
    blobs.add(descriptor.digest);
    return bytes;
  }
  function visit(descriptor: Descriptor): void {
    const manifest = JSON.parse(read(descriptor).toString()) as Manifest;
    if (manifest.manifests) {
      manifest.manifests.forEach(visit);
      return;
    }
    if (!manifest.config || !manifest.layers)
      throw new Error('Invalid OCI image manifest');
    const config = JSON.parse(
      read(manifest.config).toString(),
    ) as OciImage['config'];
    manifest.layers.forEach(read);
    manifests.push(descriptor);
    // BuildKit's OCI artifact attestations use an empty config instead of the
    // legacy unknown/unknown image config. They are evidence, not runnable images.
    const artifactAttestation =
      manifest.artifactType ===
        'application/vnd.docker.attestation.manifest.v1+json' &&
      manifest.config.mediaType === 'application/vnd.oci.empty.v1+json' &&
      descriptor.platform?.os === 'unknown' &&
      descriptor.platform.architecture === 'unknown' &&
      config.architecture === undefined &&
      config.os === undefined;
    if (!artifactAttestation && config.architecture !== 'unknown') {
      if (config.architecture !== arch || config.os !== 'linux')
        throw new Error('OCI platform mismatch');
      runnable.push({ hash: descriptor.digest, config });
    }
  }
  const root = JSON.parse(index.toString()) as Manifest;
  if (!root.manifests?.length) throw new Error('Empty OCI index');
  root.manifests.forEach(visit);
  if (runnable.length !== 1)
    throw new Error('Expected one runnable image per architecture');
  const image = runnable[0]!;
  return {
    rootDigest: digest(index),
    imageDigest: image.hash,
    config: image.config,
    manifests,
    blobs: [...blobs],
  };
}

export function mergeOci(
  inputs: { dir: string; arch: string }[],
  out: string,
): string {
  mkdirSync(join(out, 'blobs', 'sha256'), { recursive: true });
  const manifests: Descriptor[] = [];
  for (const { dir, arch } of inputs) {
    const image = inspectOci(dir, arch);
    for (const hash of image.blobs)
      copyFileSync(blobPath(dir, hash), blobPath(out, hash));
    for (const descriptor of image.manifests) {
      manifests.push(
        descriptor.digest === image.imageDigest
          ? { ...descriptor, platform: { os: 'linux', architecture: arch } }
          : descriptor,
      );
    }
  }
  const index = JSON.stringify({
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.index.v1+json',
    manifests,
  });
  writeFileSync(join(out, 'index.json'), index);
  writeFileSync(
    join(out, 'oci-layout'),
    JSON.stringify({ imageLayoutVersion: '1.0.0' }),
  );
  return digest(index);
}
