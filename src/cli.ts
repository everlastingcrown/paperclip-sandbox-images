import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { assertCatalog, loadCatalog } from './catalog.js';
import { run } from './command.js';
import { affected, createPlan, resolveParents } from './plan.js';
import { build } from './build.js';
import { testImages } from './test-images.js';
import { publish } from './publish.js';
import { platforms, type Catalog, type Plan, type Platform } from './types.js';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    catalog: { type: 'string', default: 'catalog/images.json' },
    previous: { type: 'string' },
    base: { type: 'string' },
    select: { type: 'string' },
    out: { type: 'string', default: 'out' },
    platform: { type: 'string' },
    plan: { type: 'string' },
    registry: {
      type: 'string',
      default: process.env.IMAGE_REGISTRY || 'ghcr.io/everlastingcrown',
    },
    resolve: { type: 'boolean', default: false },
    refresh: { type: 'boolean', default: false },
  },
});

const planPath = (): string => values.plan ?? resolve(values.out, 'plan.json');
function loadPlan(): Plan {
  const plan = JSON.parse(readFileSync(planPath(), 'utf8')) as Plan;
  if (plan.schemaVersion !== 1) throw new Error('Unsupported plan version');
  if (plan.source !== run('git', ['rev-parse', 'HEAD']))
    throw new Error('Plan source does not match checkout');
  return plan;
}
function platform(): Platform {
  if (!platforms.includes(values.platform as Platform))
    throw new Error('--platform must be linux/amd64 or linux/arm64');
  return values.platform as Platform;
}

try {
  switch (positionals[0]) {
    case 'validate': {
      const catalog = loadCatalog(values.catalog);
      console.log(
        `Catalog valid: ${catalog.images.length} active images. ${catalog.images.length ? '' : 'Runtime checks skipped: no image recipes.'}`,
      );
      break;
    }
    case 'plan': {
      const catalog = loadCatalog(values.catalog);
      let previous: Catalog = { schemaVersion: 1, images: [] };
      if (values.previous) previous = loadCatalog(values.previous, false);
      else if (values.base) {
        const names = run('git', [
          'ls-tree',
          '--name-only',
          values.base,
          values.catalog,
        ]);
        if (names) {
          const parsed: unknown = JSON.parse(
            run('git', ['show', `${values.base}:${values.catalog}`]),
          );
          assertCatalog(parsed);
          previous = parsed;
        }
      } else previous = catalog;
      const files = values.base
        ? run('git', ['diff', '--name-only', values.base, 'HEAD'])
            .split('\n')
            .filter(Boolean)
        : [];
      const selection = values.select
        ?.split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const images = affected(catalog, previous, files, selection);
      const source = run('git', ['rev-parse', 'HEAD']);
      const plan = createPlan(
        catalog,
        images,
        source,
        `${process.env.GITHUB_RUN_ID ?? '0'}-${process.env.GITHUB_RUN_ATTEMPT ?? '1'}`,
        values.registry,
      );
      if (values.resolve) resolveParents(plan, catalog, run);
      mkdirSync(dirname(planPath()), { recursive: true });
      writeFileSync(planPath(), JSON.stringify(plan, null, 2));
      if (process.env.GITHUB_OUTPUT)
        appendFileSync(
          process.env.GITHUB_OUTPUT,
          `has-images=${images.length > 0}\n`,
        );
      console.log(JSON.stringify(plan, null, 2));
      break;
    }
    case 'build':
      build(loadPlan(), platform(), values.out, run, values.refresh);
      break;
    case 'test':
      testImages(loadPlan(), platform(), values.out, run);
      break;
    case 'resolve-parents': {
      const plan = loadPlan();
      resolveParents(plan, loadCatalog(values.catalog), run);
      writeFileSync(planPath(), JSON.stringify(plan, null, 2));
      break;
    }
    case 'publish': {
      if (
        process.env.GITHUB_ACTIONS !== 'true' ||
        process.env.GITHUB_REF !== 'refs/heads/main' ||
        !['push', 'schedule', 'workflow_dispatch'].includes(
          process.env.GITHUB_EVENT_NAME ?? '',
        )
      )
        throw new Error(
          'Publishing requires a trusted main-branch Actions run',
        );
      const plan = loadPlan();
      const head = run('git', ['ls-remote', 'origin', 'refs/heads/main']).split(
        /\s/,
      )[0];
      if (head !== plan.source)
        throw new Error(
          'Refusing to publish a stale main-branch source; run the current main workflow',
        );
      publish(plan, values.out, run);
      break;
    }
    case 'lint-recipes': {
      for (const file of new Set(
        loadCatalog(values.catalog).images.map((i) => i.dockerfile),
      ))
        run('hadolint', [file]);
      for (const file of [
        'scripts/runtime-contract.sh',
        'scripts/install-skopeo.sh',
        'images/toolsets/expo/install-android.sh',
        'images/toolsets/expo/smoke.sh',
        'images/toolsets/expo/paperclip-expo',
      ])
        if (existsSync(file)) run('shellcheck', [file]);
      break;
    }
    default:
      throw new Error(
        'Usage: pnpm images <validate|plan|build|test|publish|lint-recipes> [options]',
      );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
