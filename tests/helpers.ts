import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import catalog from './fixtures/catalog.json' with { type: 'json' };
import type { Catalog, Plan, Platform } from '../src/types.js';
import { createPlan, digest, planDigest } from '../src/plan.js';
import { blobPath, inspectOci, type Descriptor } from '../src/oci.js';
import { evidenceDigests } from '../src/test-images.js';

export const fixture = (): Catalog => structuredClone(catalog) as Catalog;
export const temp = (): string =>
  mkdtempSync(join(tmpdir(), 'paperclip-images-'));
export const source = 'a'.repeat(40);
export const planFor = (data = fixture()): Plan =>
  createPlan(data, data.images, source, '123-1', 'ghcr.io/example');

export function ociFixture(
  dir: string,
  arch = 'amd64',
  attestation = false,
): void {
  mkdirSync(join(dir, 'blobs', 'sha256'), { recursive: true });
  function blob(data: unknown, mediaType: string): Descriptor {
    const bytes = Buffer.from(JSON.stringify(data));
    const hash = digest(bytes);
    writeFileSync(blobPath(dir, hash), bytes);
    return { mediaType, digest: hash, size: bytes.length };
  }
  const mediaType = 'application/vnd.oci.image.manifest.v1+json';
  const config = blob(
    {
      architecture: arch,
      os: 'linux',
      config: { User: '1000:1000', WorkingDir: '/workspace' },
    },
    'application/vnd.oci.image.config.v1+json',
  );
  const image = blob(
    { schemaVersion: 2, mediaType, config, layers: [] },
    mediaType,
  );
  const manifests = [
    { ...image, platform: { os: 'linux', architecture: arch } },
  ];
  if (attestation) {
    const config = blob(
      { architecture: 'unknown', os: 'unknown', config: {} },
      'application/vnd.oci.image.config.v1+json',
    );
    manifests.push({
      ...blob({ schemaVersion: 2, mediaType, config, layers: [] }, mediaType),
      platform: { os: 'unknown', architecture: 'unknown' },
    });
  }
  writeFileSync(join(dir, 'oci-layout'), '{"imageLayoutVersion":"1.0.0"}');
  writeFileSync(
    join(dir, 'index.json'),
    JSON.stringify({
      schemaVersion: 2,
      mediaType: 'application/vnd.oci.image.index.v1+json',
      manifests,
    }),
  );
}

export function testedFixture(plan: Plan, out: string): void {
  for (const image of plan.images)
    for (const arch of ['amd64', 'arm64']) {
      const dir = join(out, arch, image.id);
      ociFixture(dir, arch, true);
      const oci = inspectOci(dir, arch);
      mkdirSync(join(out, arch, `${image.id}-reports`));
      writeFileSync(
        join(out, arch, `${image.id}-reports`, 'sbom.cdx.json'),
        '{"bomFormat":"CycloneDX"}',
      );
      writeFileSync(
        join(out, arch, `${image.id}-reports`, 'vulnerabilities.json'),
        '{}',
      );
      writeFileSync(
        join(out, arch, `${image.id}-reports`, 'secrets.json'),
        '{}',
      );
      writeFileSync(
        join(out, arch, `${image.id}.tested.json`),
        JSON.stringify({
          passed: true,
          planDigest: planDigest(plan),
          rootDigest: oci.rootDigest,
          imageDigest: oci.imageDigest,
          platform: `linux/${arch}` as Platform,
          image: image.id,
          evidence: evidenceDigests(join(out, arch, `${image.id}-reports`)),
        }),
      );
    }
}
