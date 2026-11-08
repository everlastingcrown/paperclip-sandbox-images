import { describe, expect, it } from 'vitest';
import {
  assertCatalog,
  latestEntries,
  topological,
  versionTag,
} from '../src/catalog.js';
import { fixture } from './helpers.js';

describe('catalog validation', () => {
  it('accepts an empty catalog and maintained fixture versions', () => {
    expect(() => assertCatalog({ schemaVersion: 2, images: [] })).not.toThrow();
    expect(() => assertCatalog(fixture())).not.toThrow();
  });
  it.each([
    [
      'duplicate IDs',
      (c: ReturnType<typeof fixture>) => c.images.push(c.images[0]!),
    ],
    [
      'missing parent',
      (c: ReturnType<typeof fixture>) => {
        c.images[1]!.parent = 'missing';
      },
    ],
    [
      'invalid layer',
      (c: ReturnType<typeof fixture>) => {
        c.images[1]!.parent = 'codex-new';
      },
    ],
    [
      'tag collision',
      (c: ReturnType<typeof fixture>) => {
        c.images[1]!.version = '0.114.0';
        c.images[1]!.checks[0]!.expected = '0.114.0';
      },
    ],
    [
      'missing architecture',
      (c: ReturnType<typeof fixture>) => {
        c.images[0]!.platforms = ['linux/amd64'];
      },
    ],
    [
      'unsafe path',
      (c: ReturnType<typeof fixture>) => {
        c.images[0]!.dockerfile = '../Dockerfile';
      },
    ],
    [
      'invalid semver',
      (c: ReturnType<typeof fixture>) => {
        c.images[0]!.version = 'latest';
      },
    ],
    [
      'metadata in tag',
      (c: ReturnType<typeof fixture>) => {
        c.images[0]!.version = '1.0.0+build';
      },
    ],
    [
      'missing version check',
      (c: ReturnType<typeof fixture>) => {
        c.images[1]!.checks = [];
      },
    ],
    [
      'reserved args',
      (c: ReturnType<typeof fixture>) => {
        c.images[0]!.args.PARENT_IMAGE = 'bad';
      },
    ],
  ])('rejects %s', (_name, change) => {
    const catalog = fixture();
    change(catalog);
    expect(() => assertCatalog(catalog)).toThrow();
  });
  it('rejects retired layers and active v1 catalogs', () => {
    const catalog = fixture();
    expect(() => assertCatalog({ ...catalog, schemaVersion: 1 })).toThrow(
      'Invalid catalog',
    );
    expect(() =>
      assertCatalog({
        ...catalog,
        images: [catalog.images[0], { ...catalog.images[1], layer: 'harness' }],
      }),
    ).toThrow('Invalid catalog');
  });
  it('rejects the same capability tag across different base versions', () => {
    const catalog = fixture();
    catalog.images.push({
      ...catalog.images[0]!,
      id: 'base-2',
      version: '2.0.0',
    });
    const newer = catalog.images[4]!;
    newer.parent = 'base-2';
    newer.version = catalog.images[3]!.version;
    newer.checks.at(-1)!.expected = newer.version;
    expect(() => assertCatalog(catalog)).toThrow('Tag collision');
  });
  it('detects cycles independently of layer checks', () => {
    const catalog = fixture();
    catalog.images[0]!.parent = 'codex-old';
    expect(() => topological(catalog.images)).toThrow('cycle');
  });
  it('checks that active recipes really exist', () => {
    expect(() => assertCatalog(fixture(), true)).toThrow();
  });
});

describe('tags', () => {
  it('uses plain capability versions for toolset tags', () => {
    const { images } = fixture();
    expect(versionTag(images[3]!)).toBe('3.13.2');
  });
  it('uses SemVer ordering for latest', () => {
    expect(latestEntries(fixture().images)).toEqual({
      'sandbox-base': 'base-1',
      'sandbox-codex': 'codex-new',
      'sandbox-python': 'python-new',
    });
  });
  it('excludes capability prereleases independently of parents', () => {
    const catalog = fixture();
    catalog.images[2]!.version = '1.0.0-beta.1';
    expect(latestEntries(catalog.images)['sandbox-codex']).toBe('codex-old');
    expect(latestEntries(catalog.images)['sandbox-python']).toBe('python-new');
    catalog.images[0]!.version = '2.0.0-rc.1';
    expect(latestEntries(catalog.images)['sandbox-base']).toBeUndefined();
  });
  it('selects the highest stable toolset version', () => {
    const catalog = fixture();
    catalog.images[3]!.version = '3.14.0';
    expect(latestEntries(catalog.images)['sandbox-python']).toBe('python-old');
  });
});
