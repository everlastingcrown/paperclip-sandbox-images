import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  affected,
  assertPlanVersion,
  createPlan,
  immutableTag,
  resolveParents,
} from '../src/plan.js';
import { releaseCatalog } from '../src/catalog.js';
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
  it('selects a toolset independently of other toolsets', () => {
    expect(ids([], ['codex-old'])).toEqual(['codex-old']);
  });
  it('tracks shared recipes, directories, and shared inputs', () => {
    expect(ids(['images/toolsets/codex/install.sh'])).toHaveLength(2);
    expect(ids(['shared/paperclip-shim/main.go'])).toHaveLength(5);
    expect(ids(['src/plan.ts'])).toHaveLength(5);
  });
  it('skips documentation-only changes and handles empty catalogs', () => {
    expect(ids(['README.md', 'docs/architecture.md'])).toEqual([]);
    expect(
      affected({ schemaVersion: 2, images: [] }, fixture(), [
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
    ).toEqual(['codex-old']);
  });
  it('builds the replacement latest after retirement', () => {
    const previous = fixture();
    const current = fixture();
    current.images = current.images.filter(
      (i) => !['codex-new', 'python-new'].includes(i.id),
    );
    expect(
      affected(current, previous, ['catalog/images.json']).map((i) => i.id),
    ).toEqual(['codex-old', 'python-old']);
  });
  it('rebuilds all images for a historical v1 baseline without validating its graph', () => {
    const previous = releaseCatalog({
      schemaVersion: 1,
      images: [{ layer: 'harness', parent: 'retired' }],
    });
    expect(affected(fixture(), previous, []).map((i) => i.id)).toEqual(
      fixture().images.map((i) => i.id),
    );
    expect(() => releaseCatalog({ schemaVersion: 3, images: [] })).toThrow(
      'Invalid catalog',
    );
  });
  it('rejects unknown manual selections', () =>
    expect(() => ids([], ['typo'])).toThrow('Unknown image'));
});

describe('build plans', () => {
  it('rejects v1 plans with a regeneration instruction', () => {
    expect(() => assertPlanVersion({ schemaVersion: 1 })).toThrow(
      'regenerate with pnpm images plan',
    );
    expect(() => assertPlanVersion(planFor())).not.toThrow();
  });
  it('rejects a v1 plan at the build CLI before invoking build tools', () => {
    const path = join(temp(), 'v1-plan.json');
    writeFileSync(path, JSON.stringify({ schemaVersion: 1 }));
    expect(() =>
      execFileSync(
        process.execPath,
        [
          '--import',
          'tsx',
          resolve('src/cli.ts'),
          'build',
          '--platform',
          'linux/amd64',
          '--plan',
          path,
        ],
        { stdio: 'pipe' },
      ),
    ).toThrow('regenerate with pnpm images plan');
  });
  it('emits unique build tags and inherits base checks for toolsets', () => {
    const plan = planFor();
    expect(immutableTag(plan.images[3]!, plan)).toBe(
      `3.13.2-sha-${source.slice(0, 12)}-123-1`,
    );
    expect(plan.images[3]!.checks.map((c) => c.command)).toEqual([
      'node',
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
    expect(plan.externalParents['base-1']).toMatch(/sandbox-base@sha256:/);
    expect(immutableTag(plan.images[0]!, plan)).toContain('3.13.2');
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
      planFor({ schemaVersion: 2, images: [] }),
      'linux/amd64',
      temp(),
      run,
    );
    expect(run).not.toHaveBeenCalled();
  });
});
