import { describe, expect, it, vi } from 'vitest';
import {
  affected,
  createPlan,
  immutableTag,
  resolveParents,
} from '../src/plan.js';
import { bakeDefinition, build } from '../src/build.js';
import type { Runner } from '../src/command.js';
import { fixture, planFor, source, temp } from './helpers.js';

describe('affected image planning', () => {
  const ids = (files: string[], selected?: string[]) => {
    const c = fixture();
    return affected(c, c, files, selected).map((i) => i.id);
  };
  it('propagates base changes through every maintained version', () => {
    expect(ids(['images/base/runtime/Dockerfile'])).toHaveLength(5);
  });
  it('selects only a changed harness and its descendants', () => {
    expect(ids([], ['codex-old'])).toEqual(['codex-old', 'python-old-codex']);
  });
  it('tracks shared recipes, directories, and shared inputs', () => {
    expect(ids(['images/harnesses/codex/install.sh'])).toHaveLength(4);
    expect(ids(['shared/paperclip-shim/main.go'])).toHaveLength(5);
    expect(ids(['src/plan.ts'])).toHaveLength(5);
  });
  it('skips documentation-only changes and handles empty catalogs', () => {
    expect(ids(['README.md', 'docs/architecture.md'])).toEqual([]);
    expect(
      affected({ schemaVersion: 1, images: [] }, fixture(), [
        'catalog/images.json',
      ]),
    ).toEqual([]);
  });
  it('rebuilds a changed catalog entry and its descendants', () => {
    const previous = fixture();
    const current = fixture();
    current.images[1]!.args.CODEX_VERSION = 'changed';
    expect(
      affected(current, previous, ['catalog/images.json']).map((i) => i.id),
    ).toEqual(['codex-old', 'python-old-codex']);
  });
  it('builds the replacement latest after retirement', () => {
    const previous = fixture();
    const current = fixture();
    current.images = current.images.filter(
      (i) => !['codex-new', 'python-new-codex'].includes(i.id),
    );
    expect(
      affected(current, previous, ['catalog/images.json']).map((i) => i.id),
    ).toEqual(['codex-old', 'python-old-codex']);
  });
  it('rejects unknown manual selections', () =>
    expect(() => ids([], ['typo'])).toThrow('Unknown image'));
});

describe('build plans', () => {
  it('emits unique build tags and inherits harness checks for toolsets', () => {
    const plan = planFor();
    expect(immutableTag(plan.images[3]!, plan)).toBe(
      `3.13.2-codex-0.99.0-sha-${source.slice(0, 12)}-123-1`,
    );
    expect(plan.images[3]!.checks.map((c) => c.command)).toEqual([
      'codex',
      'python',
    ]);
  });
  it('pins unaffected parents once by digest and retains toolset version tags', () => {
    const catalog = fixture();
    const plan = createPlan(
      catalog,
      [catalog.images[3]!],
      source,
      '123-1',
      'ghcr.io/example',
    );
    const run = vi.fn(() => `sha256:${'b'.repeat(64)}`);
    resolveParents(plan, catalog, run);
    resolveParents(plan, catalog, run);
    expect(run).toHaveBeenCalledTimes(1);
    expect(plan.externalParents['codex-old']).toMatch(/sandbox-codex@sha256:/);
    expect(immutableTag(plan.images[0]!, plan)).toContain(
      '3.13.2-codex-0.99.0',
    );
  });
  it('does not accept an unpinned parent resolution', () => {
    const catalog = fixture();
    const plan = createPlan(
      catalog,
      [catalog.images[1]!],
      source,
      '1-1',
      'ghcr.io/example',
    );
    expect(() => resolveParents(plan, catalog, () => 'latest')).toThrow(
      'Invalid parent digest',
    );
    expect(() => bakeDefinition(plan, 'linux/amd64', 'out')).toThrow(
      'Unresolved parent',
    );
  });
  it('connects local targets and exports OCI with provenance', () => {
    const definition = JSON.stringify(
      bakeDefinition(planFor(), 'linux/arm64', 'out'),
    );
    expect(definition).toContain('target:base-1');
    expect(definition).toContain('linux/arm64');
    expect(definition).toContain('type=oci,tar=false');
    expect(definition).toContain('type=provenance,mode=max');
  });
  it('refreshes builds when requested and skips an empty build', () => {
    const run = vi.fn<Runner>(() => '');
    build(planFor(), 'linux/amd64', temp(), run, true);
    expect(run.mock.calls[0]?.[1]).toContain('--no-cache');
    run.mockClear();
    build(
      planFor({ schemaVersion: 1, images: [] }),
      'linux/amd64',
      temp(),
      run,
    );
    expect(run).not.toHaveBeenCalled();
  });
});
