import { readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { Ajv } from 'ajv';
import semver from 'semver';
import type { Catalog, Image } from './types.js';

const schema = JSON.parse(readFileSync(new URL('../catalog/schema.json', import.meta.url), 'utf8')) as object;
const validate = new Ajv({ allErrors: true }).compile<Catalog>(schema);

export function loadCatalog(file = 'catalog/images.json', checkFiles = true): Catalog {
  const data: unknown = JSON.parse(readFileSync(file, 'utf8'));
  assertCatalog(data, checkFiles);
  return data;
}

export function safePath(path: string): string {
  const absolute = resolve(path);
  const rel = relative(process.cwd(), absolute);
  if (rel === '..' || rel.startsWith(`..${sep}`) || resolve(path) === sep) throw new Error(`Unsafe path: ${path}`);
  return absolute;
}

export function assertCatalog(data: unknown, checkFiles = false): asserts data is Catalog {
  if (!validate(data)) throw new Error(`Invalid catalog: ${JSON.stringify(validate.errors)}`);
  const byId = new Map<string, Image>();
  const tags = new Set<string>();
  const repositories = new Map<string, string>();
  for (const image of data.images) {
    if (byId.has(image.id)) throw new Error(`Duplicate ID: ${image.id}`);
    byId.set(image.id, image);
    if (!semver.valid(image.version) || semver.valid(image.version) !== image.version || image.version.includes('+')) {
      throw new Error(`Use canonical SemVer without build metadata: ${image.id}`);
    }
    const identity = `${image.layer}:${image.capability}`;
    if (repositories.has(image.repository) && repositories.get(image.repository) !== identity) {
      throw new Error(`Repository must identify one capability/layer: ${image.repository}`);
    }
    repositories.set(image.repository, identity);
    if (image.layer === 'base' ? image.parent !== undefined : !image.parent) throw new Error(`Invalid parent for ${image.id}`);
    if (image.layer !== 'base' && image.checks.length === 0) throw new Error(`Missing version/smoke checks: ${image.id}`);
    if (image.layer !== 'base' && !image.checks.some(c => c.expected === image.version)) throw new Error(`Missing primary version check: ${image.id}`);
    if ('PARENT_IMAGE' in image.args) throw new Error('PARENT_IMAGE is reserved for orchestration');
    for (const path of [image.dockerfile, image.context, ...image.watch]) safePath(path);
    if (checkFiles) {
      for (const path of [image.dockerfile, image.context, ...image.watch]) safePath(realpathSync(path));
      if (!statSync(image.dockerfile).isFile() || !statSync(image.context).isDirectory()) throw new Error(`Invalid recipe/context: ${image.id}`);
    }
  }
  for (const image of data.images) {
    if (image.parent) {
      const parent = byId.get(image.parent);
      if (!parent) throw new Error(`Missing parent ${image.parent} for ${image.id}`);
      const expected = image.layer === 'harness' ? 'base' : 'harness';
      if (parent.layer !== expected) throw new Error(`Invalid parent layer: ${image.id}`);
      if (image.platforms.some(p => !parent.platforms.includes(p))) throw new Error(`Incompatible platforms: ${image.id}`);
    }
    const tag = `${image.repository}:${versionTag(image, data.images)}`;
    // Leave room for the immutable build suffix.
    if (tag.split(':')[1]!.length > 80) throw new Error(`Version tag too long: ${image.id}`);
    if (tags.has(tag)) throw new Error(`Tag collision: ${tag}`);
    tags.add(tag);
  }
  for (const repository of repositories.keys()) {
    const harnesses = new Set(data.images.filter(i => i.repository === repository && i.layer === 'toolset')
      .map(i => byId.get(i.parent!)!.capability));
    if (harnesses.size > 1) throw new Error(`Toolset repository must identify one harness: ${repository}`);
  }
  topological(data.images);
}

export function topological(images: Image[]): Image[] {
  const byId = new Map(images.map(i => [i.id, i]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const sorted: Image[] = [];
  function visit(image: Image) {
    if (visiting.has(image.id)) throw new Error(`Dependency cycle: ${image.id}`);
    if (visited.has(image.id)) return;
    visiting.add(image.id);
    const parent = image.parent && byId.get(image.parent);
    if (parent) visit(parent);
    visiting.delete(image.id);
    visited.add(image.id);
    sorted.push(image);
  }
  images.forEach(visit);
  return sorted;
}

export function versionTag(image: Image, images: Image[]): string {
  if (image.layer !== 'toolset') return image.version;
  const harness = images.find(i => i.id === image.parent);
  if (!harness) throw new Error(`Missing harness for ${image.id}`);
  return `${image.version}-${harness.capability}-${harness.version}`;
}

export function latestEntries(images: Image[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const image of images) {
    const harness = image.layer === 'toolset' ? images.find(i => i.id === image.parent) : undefined;
    if (semver.prerelease(image.version) || (harness && semver.prerelease(harness.version))) continue;
    const current = images.find(i => i.id === result[image.repository]);
    const oldHarness = current?.layer === 'toolset' ? images.find(i => i.id === current.parent) : undefined;
    if (!current || semver.gt(image.version, current.version) ||
      (image.version === current.version && harness && oldHarness && semver.gt(harness.version, oldHarness.version))) {
      result[image.repository] = image.id;
    }
  }
  return result;
}
