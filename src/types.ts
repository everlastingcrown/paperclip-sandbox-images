export const platforms = ['linux/amd64', 'linux/arm64'] as const;
export type Platform = (typeof platforms)[number];
export interface Image {
  id: string;
  layer: 'base' | 'harness' | 'toolset';
  repository: string;
  capability: string;
  version: string;
  parent?: string;
  dockerfile: string;
  context: string;
  args: Record<string, string>;
  watch: string[];
  platforms: Platform[];
  checks: { command: string; expected: string; smoke: string }[];
}
export interface Catalog {
  schemaVersion: 1;
  images: Image[];
}
export interface Plan {
  schemaVersion: 1;
  registry: string;
  source: string;
  build: string;
  images: Image[];
  latest: Record<string, string>;
  versionTags: Record<string, string>;
  externalParents: Record<string, string>;
}
