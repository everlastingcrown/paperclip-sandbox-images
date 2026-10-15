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
    expect(() => assertCatalog({ schemaVersion: 1, images: [] })).not.toThrow();
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
  it('anchors toolset tags to both exact versions', () => {
    const { images } = fixture();
    expect(versionTag(images[3]!, images)).toBe('3.13.2-codex-0.99.0');
  });
  it('uses semver ordering and the harness tie-breaker for latest', () => {
    expect(latestEntries(fixture().images)).toEqual({
      'sandbox-base': 'base-1',
      'sandbox-codex': 'codex-new',
      'sandbox-python-codex': 'python-new-codex',
    });
  });
  it('excludes prereleases of the primary capability and harness', () => {
    const catalog = fixture();
    catalog.images[2]!.version = '1.0.0-beta.1';
    expect(latestEntries(catalog.images)['sandbox-codex']).toBe('codex-old');
    expect(latestEntries(catalog.images)['sandbox-python-codex']).toBe(
      'python-old-codex',
    );
    catalog.images[0]!.version = '2.0.0-rc.1';
    expect(latestEntries(catalog.images)['sandbox-base']).toBeUndefined();
  });
  it('prefers primary toolset version over harness version', () => {
    const catalog = fixture();
    catalog.images[3]!.version = '3.14.0';
    expect(latestEntries(catalog.images)['sandbox-python-codex']).toBe(
      'python-old-codex',
    );
  });
});
