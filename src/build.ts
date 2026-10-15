import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plan, Platform } from './types.js';
import type { Runner } from './command.js';

export const architecture = (platform: Platform): string => platform.split('/')[1]!;

export function bakeDefinition(plan: Plan, platform: Platform, out: string): object {
  return {
    group: { default: { targets: plan.images.map(i => i.id) } },
    target: Object.fromEntries(plan.images.map(image => {
      const parent = image.parent && plan.images.find(i => i.id === image.parent);
      const external = image.parent && Object.hasOwn(plan.externalParents, image.parent) && plan.externalParents[image.parent];
      if (image.parent && !parent && !external) throw new Error(`Unresolved parent: ${image.parent}`);
      return [image.id, {
        context: image.context, dockerfile: resolve(image.dockerfile),
        platforms: [platform], args: image.args,
        ...(image.parent ? { contexts: { 'paperclip-parent': parent ? `target:${parent.id}` : `docker-image://${external}` } } : {}),
        labels: { 'org.opencontainers.image.revision': plan.source, 'org.opencontainers.image.version': image.version },
        attest: ['type=provenance,mode=max'],
        output: [`type=oci,tar=false,dest=${resolve(out, architecture(platform), image.id)}`],
      }];
    })),
  };
}

export function build(plan: Plan, platform: Platform, out: string, run: Runner, refresh = false): void {
  if (!plan.images.length) return;
  mkdirSync(out, { recursive: true });
  const file = resolve(out, `bake-${architecture(platform)}.json`);
  writeFileSync(file, JSON.stringify(bakeDefinition(plan, platform, out), null, 2));
  run('docker', ['buildx', 'bake', '-f', file, '--pull', ...(refresh ? ['--no-cache'] : [])]);
}
