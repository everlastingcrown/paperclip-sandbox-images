import { createHash } from 'node:crypto';
import { latestEntries, topological, versionTag } from './catalog.js';
import type { Catalog, Image, Plan } from './types.js';
import type { Runner } from './command.js';

export const digest = (value: string | Buffer): string => `sha256:${createHash('sha256').update(value).digest('hex')}`;
export const planDigest = (plan: Plan): string => digest(JSON.stringify(plan));
export const watched = (file: string, path: string): boolean => path === '.' || file === path || file.startsWith(`${path}/`);

export function affected(catalog: Catalog, previous: Catalog, files: string[], selected?: string[]): Image[] {
  const ids = new Set<string>();
  const all = selected?.includes('all') || files.some(file =>
    ['src', 'scripts', 'tests', '.github', 'catalog/schema.json', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', '.dockerignore'].some(path => watched(file, path)));
  for (const id of selected ?? []) {
    if (id === 'all') continue;
    if (!catalog.images.some(i => i.id === id)) throw new Error(`Unknown image: ${id}`);
    ids.add(id);
  }
  const oldLatest = latestEntries(previous.images);
  const newLatest = latestEntries(catalog.images);
  for (const image of catalog.images) {
    const old = previous.images.find(i => i.id === image.id);
    // A context is deliberately treated as a directory-wide dependency.
    if (all || !old || JSON.stringify(old) !== JSON.stringify(image) ||
      files.some(file => [image.dockerfile, image.context, ...image.watch].some(path => watched(file, path))) ||
      (newLatest[image.repository] === image.id && oldLatest[image.repository] !== image.id)) ids.add(image.id);
  }
  let size = -1;
  while (size !== ids.size) {
    size = ids.size;
    for (const image of catalog.images) if (image.parent && ids.has(image.parent)) ids.add(image.id);
  }
  return topological(catalog.images).filter(i => ids.has(i.id));
}

export function createPlan(catalog: Catalog, images: Image[], source: string, build: string, registry: string): Plan {
  if (!/^[a-f0-9]{40}$/.test(source)) throw new Error('Source must be a full Git SHA');
  if (!/^[0-9]{1,20}-[0-9]{1,5}$/.test(build)) throw new Error('Build must be <run-id>-<attempt>');
  if (!/^[a-z0-9.-]+(?::[0-9]+)?\/[a-z0-9_/-]+$/.test(registry)) throw new Error('Invalid registry namespace');
  const inheritedChecks = (image: Image): Image['checks'] => [...(image.parent ? inheritedChecks(catalog.images.find(i => i.id === image.parent)!) : []), ...image.checks];
  return { schemaVersion: 1, registry, source, build, images: images.map(i => ({ ...i, checks: inheritedChecks(i) })), latest: latestEntries(catalog.images),
    versionTags: Object.fromEntries(catalog.images.map(i => [i.id, versionTag(i, catalog.images)])), externalParents: {} };
}

export function immutableTag(image: Image, plan: Plan): string {
  return `${plan.versionTags[image.id]}-sha-${plan.source.slice(0, 12)}-${plan.build}`;
}

export function resolveParents(plan: Plan, catalog: Catalog, run: Runner): void {
  for (const image of plan.images) {
    if (!image.parent || plan.images.some(i => i.id === image.parent) || Object.hasOwn(plan.externalParents, image.parent)) continue;
    const parent = catalog.images.find(i => i.id === image.parent)!;
    const name = `${plan.registry}/${parent.repository}`;
    const hash = run('skopeo', ['inspect', '--format', '{{.Digest}}', `docker://${name}:${versionTag(parent, catalog.images)}`]);
    if (!/^sha256:[a-f0-9]{64}$/.test(hash)) throw new Error(`Invalid parent digest: ${parent.id}`);
    plan.externalParents[parent.id] = `${name}@${hash}`;
  }
}
