import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { blobPath, inspectOci, mergeOci } from '../src/oci.js';
import { digest } from '../src/plan.js';
import { ociFixture, temp } from './helpers.js';

// CI installs the pinned Skopeo; developers can run unit tests without it.
const available = spawnSync('skopeo', ['--version']).status === 0;
it.skipIf(!available && !process.env.CI).each([true, 'artifact'] as const)(
  'copies the complete release index with %s attestations using Skopeo',
  (attestation) => {
    const inputs = ['amd64', 'arm64'].map((arch) => {
      const dir = temp();
      ociFixture(dir, arch, attestation);
      return { dir, arch };
    });
    const release = temp();
    const destination = temp();
    const hash = mergeOci(inputs, release);
    const raw = execFileSync('skopeo', ['inspect', '--raw', `oci:${release}`]);
    expect(digest(raw)).toBe(hash);
    const index = JSON.parse(raw.toString());
    expect(index.manifests).toHaveLength(4);
    expect(
      index.manifests.map((m: { platform: unknown }) => m.platform),
    ).toEqual([
      { os: 'linux', architecture: 'amd64' },
      { os: 'unknown', architecture: 'unknown' },
      { os: 'linux', architecture: 'arm64' },
      { os: 'unknown', architecture: 'unknown' },
    ]);
    execFileSync('skopeo', [
      '--insecure-policy',
      'copy',
      '--all',
      '--preserve-digests',
      `oci:${release}`,
      `oci:${destination}`,
    ]);
    expect(
      execFileSync('skopeo', ['inspect', '--raw', `oci:${destination}`]),
    ).toEqual(raw);
    for (const { dir, arch } of inputs)
      for (const blob of inspectOci(dir, arch).blobs)
        expect(readFileSync(blobPath(destination, blob))).toEqual(
          readFileSync(blobPath(dir, blob)),
        );
    expect(readFileSync(join(destination, 'oci-layout'), 'utf8')).toContain(
      '1.0.0',
    );
  },
);
