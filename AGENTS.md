# Repository guide

## Purpose and structure

Build and publish Docker images for Paperclip agent sandboxes: **base → harness → toolset**. The active catalog is intentionally empty; there are no Dockerfiles yet. Metadata fixtures are examples, not buildable images.

- `catalog/images.json`: sole active catalog; `schema.json` defines its format.
- `images/{base,harnesses,toolsets}/`: recipe families, supporting several maintained versions.
- `src/`: TypeScript orchestration. `catalog.ts` validates definitions/tags; `plan.ts` selects affected descendants; `build.ts` generates Bake targets; `oci.ts`, `test-images.ts`, and `publish.ts` validate and promote artifacts. `cli.ts` connects the commands.
- `tests/`: Vitest tests, synthetic OCI layouts, and illustrative catalog metadata.
- `scripts/`: runtime contract, checksum-pinned binary installer, and architecture-specific Skopeo package pins.
- `.github/workflows/images.yml`: PR checks, main-branch publication, manual selection, weekly rebuilds.
- `docs/`: image authoring, release recovery, and validation contracts.

## Development

Use **Node.js 24**, the exact pnpm version in `package.json`, strict TypeScript/ESM, ESLint, and Vitest. TypeScript imports use `.js` extensions; the CLI runs through `node --import tsx`.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm images plan --select all
```

For workflow and recipe checks on Linux:

```sh
node scripts/install-tools.ts checks
export PATH="$PWD/out/tools:$PATH"
actionlint
pnpm images lint-recipes
```

Future image work also requires Docker/Buildx, Skopeo, and Trivy. After planning with `--resolve`, run `pnpm images build --platform linux/amd64`, then `pnpm images test --platform linux/amd64`; repeat on native ARM64. See `docs/images.md` for selection and output options.

Keep catalog types, schema, validation, and fixtures consistent. Inject the `Runner` interface to test external-tool behavior; host commands use argument arrays, never shell interpolation. `out/` contains generated plans, Bake definitions, OCI layouts, evidence, and downloaded tools; do not commit it.

## Architecture and gotchas

- Parent links select exact catalog entries. Derived recipes use `FROM paperclip-parent`; Bake supplies a local target or a resolved registry digest. Unchanged parents must already be published.
- Changed inputs rebuild all descendants. Build contexts are directory-wide dependencies; `context: "."` makes every file relevant. `watch` accepts literal paths, not globs.
- Versions are canonical SemVer. Toolset tags include the harness version. `latest` selects the highest stable capability version, then highest stable harness version; rebuilding old versions must not move it.
- Both architectures must pass. Toolsets inherit harness checks; runtime smoke tests have no network or credentials. Scanner errors, detected secrets, and fixable high/critical vulnerabilities block publication.
- Promote tested OCI bytes without rebuilding. Verify blob/evidence hashes, preserve digests, and sign/verify all immutable images before advancing aliases. Cross-repository alias updates are not atomic.
- Publication requires a trusted current-`main` Actions run. Fork PRs need publicly readable parent packages. GHCR visibility/access and Renovate installation are external setup steps.
- Update binary URLs/checksums together; preserve pinned Actions and external-image digests. Empty-catalog success verifies infrastructure only. Provider isolation and Paperclip bridge enforcement remain outside the image.
