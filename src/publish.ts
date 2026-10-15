import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { Plan } from './types.js';
import { platforms } from './types.js';
import type { Runner } from './command.js';
import { architecture } from './build.js';
import { digest, immutableTag, planDigest } from './plan.js';
import { mergeOci } from './oci.js';
import { assertTested } from './test-images.js';

export function publish(plan: Plan, out: string, run: Runner): void {
  if (!plan.images.length) return;
  const identity = process.env.COSIGN_CERTIFICATE_IDENTITY;
  if (!identity) throw new Error('COSIGN_CERTIFICATE_IDENTITY is required');
  // Complete all local validation before the first registry mutation.
  for (const image of plan.images) for (const platform of platforms) assertTested(plan, platform, image, out);
  const releases = plan.images.map(image => {
    const directory = resolve(out, 'release', image.id);
    const hash = mergeOci(platforms.map(p => ({ dir: resolve(out, architecture(p), image.id), arch: architecture(p) })), directory);
    return { image, directory, hash, name: `${plan.registry}/${image.repository}`, tag: immutableTag(image, plan) };
  });
  const parents = { ...plan.externalParents, ...Object.fromEntries(releases.map(r => [r.image.id, `${r.name}@${r.hash}`])) };
  mkdirSync(resolve(out, 'release'), { recursive: true });
  writeFileSync(join(out, 'release', 'release.json'), JSON.stringify({ source: plan.source, build: plan.build,
    planDigest: planDigest(plan), parents, images: releases.map(r => ({ id: r.image.id,
      parent: r.image.parent, version: plan.versionTags[r.image.id], reference: `${r.name}:${r.tag}`, digest: r.hash,
      platforms: platforms.map(p => assertTested(plan, p, r.image, out)) })) }, null, 2));
  for (const release of releases) {
    const { image, directory, hash, name, tag } = release;
    run('skopeo', ['copy', '--all', '--preserve-digests', `oci:${directory}`, `docker://${name}:${tag}`]);
    // Raw output is JSON. execFile wrapper trims surrounding whitespace; manifests are generated without it.
    const actual = digest(run('skopeo', ['inspect', '--raw', `docker://${name}:${tag}`]));
    if (actual !== hash) throw new Error(`Published digest mismatch: ${image.id}`);
    const reference = `${name}@${hash}`;
    run('cosign', ['sign', '--yes', reference]);
    for (const platform of platforms) {
      const arch = architecture(platform);
      const sbom = resolve(out, arch, `${image.id}-reports`, 'sbom.cdx.json');
      // Fail if the SBOM is absent or malformed before invoking the attester.
      JSON.parse(readFileSync(sbom, 'utf8'));
      run('cosign', ['attest', '--yes', '--type', 'cyclonedx', '--predicate', sbom, reference]);
    }
    const provenance = join(directory, 'provenance.json');
    writeFileSync(provenance, JSON.stringify({ buildDefinition: {
      buildType: 'https://github.com/everlastingcrown/paperclip-sandbox-images/build/v1',
      externalParameters: { source: plan.source, image: image.id, version: plan.versionTags[image.id] },
      internalParameters: { planDigest: planDigest(plan) },
      resolvedDependencies: image.parent ? [{ name: image.parent, uri: parents[image.parent] }] : [],
    }, runDetails: { builder: { id: process.env.GITHUB_WORKFLOW_REF ?? 'local' }, metadata: { invocationId: plan.build } } }));
    run('cosign', ['attest', '--yes', '--type', 'https://slsa.dev/provenance/v1', '--predicate', provenance, reference]);
    const verification = ['--certificate-identity', identity, '--certificate-oidc-issuer', 'https://token.actions.githubusercontent.com'];
    run('cosign', ['verify', ...verification, reference]);
    run('cosign', ['verify-attestation', ...verification, '--type', 'cyclonedx', reference]);
    run('cosign', ['verify-attestation', ...verification, '--type', 'https://slsa.dev/provenance/v1', reference]);
  }
  // No movable alias advances until every immutable image is signed and verified.
  for (const { image, hash, name } of releases) {
    const tags = [plan.versionTags[image.id]!];
    if (plan.latest[image.repository] === image.id) tags.push('latest');
    for (const tag of tags) run('skopeo', ['copy', '--all', '--preserve-digests', `docker://${name}@${hash}`, `docker://${name}:${tag}`]);
  }
}
