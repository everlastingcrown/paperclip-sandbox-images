# Authoring images

`catalog/images.json` is the only active catalog. `tests/fixtures/catalog.json` illustrates maintained versions and a base → harness → Python dependency chain. Its paths intentionally do not exist and CI never builds it.

## Catalog contract

| Field                   | Meaning                                                                      |
| ----------------------- | ---------------------------------------------------------------------------- |
| `id`                    | Unique stable identifier; also a Bake target                                 |
| `layer`                 | `base`, `harness`, or `toolset`                                              |
| `repository`            | Registry repository name beginning with `sandbox-`                           |
| `capability`            | Primary capability name, e.g. `base`, `codex`, `python`                      |
| `version`               | Exact canonical SemVer without build metadata                                |
| `parent`                | Required for harness/toolset; absent for base                                |
| `dockerfile`, `context` | Repository-relative recipe file and build context directory                  |
| `args`                  | Pinned build arguments; never credentials                                    |
| `watch`                 | Additional files/directories that trigger rebuilds                           |
| `platforms`             | Both `linux/amd64` and `linux/arm64`                                         |
| `checks`                | Command, expected `--version` value, and credential-free shell smoke command |

Harnesses depend on a base; toolsets depend on a harness. A repository identifies one layer/capability and, for toolsets, one harness family. Multiple capability and parent versions can coexist; output tags must be unique.

Use narrow build contexts. Any changed file beneath a context triggers its image; `context: "."` treats every file as an input. `watch` accepts literal paths, not globs. Include shared installation scripts and vendored Paperclip sources. Declared paths must exist and resolve inside the repository.

Derived recipes must use `paperclip-parent` as their parent `FROM` reference. Bake maps this named context to an affected local parent target or an unchanged parent's resolved registry digest. If Hadolint flags this named context as untagged, place `# hadolint ignore=DL3006` immediately above that one `FROM` instruction; the context is pinned by orchestration. `PARENT_IMAGE` is reserved. Bootstrap by adding the base and descendants together, or publish the base first. Unchanged parents must already exist in the registry.

## Adding or updating a version

1. Add the recipe and inputs beneath its layer directory. Pin external base images by digest, tools by exact version, and Paperclip source by reviewed immutable revision.
2. Register its exact parent and installation arguments. Each non-base entry requires a version check matching its primary version and a meaningful smoke command. Toolsets inherit harness checks.
3. Supply a ready PATH. Ordinary launches must not need `nvm`, profile modification, or runtime installation.
4. Run repository checks, lint the recipe, and build/test both architectures before merge.

Add a separate ID for another maintained version. Shared recipes may use different pinned arguments; incompatible install procedures can use separate contexts. Multi-tool bundles receive a SemVer release and a bundle-version command, with additional checks for their component tools.

Smoke commands run inside restricted containers without network or API credentials. Choose functional checks beyond `--version`.

## Local use

Install Docker with Buildx, Skopeo, and the checksum-pinned Trivy binary. Use a native machine for each architecture:

```sh
node scripts/install-tools.ts images
export PATH="$PWD/out/tools:$PATH"
pnpm images plan --base <base-commit> --resolve
# Or explicitly choose IDs and their descendants:
pnpm images plan --select codex-new --resolve
pnpm images build --platform linux/amd64
pnpm images test --platform linux/amd64
```

`--select all` selects every entry. `--registry ghcr.io/owner` overrides the namespace; `--out` changes the output directory. Build/test also accept `--plan <file>`. The plan's source must match the checkout. `build --refresh` disables layer caching. `resolve-parents` pins external parents in an existing plan.

The JSON plan is written to `out/plan.json`; OCI layouts and evidence live beneath `out/<architecture>/`. Publishing is restricted to trusted main-branch Actions runs.

## Retirement and dependency maintenance

Remove retired entries and remove/reparent descendants together. Registry artifacts are retained. Removing the selected `latest` schedules the next highest stable entry for validation. With no stable entries, no new `latest` is created; historical alias removal remains a deliberate registry administration action.

Renovate updates npm dependencies, Actions, external Dockerfile digests, and BuildKit. Future Dockerfile version constants can be annotated:

```text
# renovate: datasource=npm depName=@openai/codex
ARG CODEX_VERSION=0.114.0
```

Update matching catalog versions, arguments, and checks together. Catalog entries remain deliberate support decisions; Renovate does not retire versions or generate combinations.

Update CI binary versions, asset URLs, and official release checksums together in `scripts/tools.lock.json`. Checksum mismatch is fatal. Skopeo's architecture-specific Ubuntu revisions are pinned in `scripts/install-skopeo.sh`; maintain these with the runner distribution.
