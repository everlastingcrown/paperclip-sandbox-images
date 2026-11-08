# Authoring images

`catalog/images.json` is the only active catalog. `tests/fixtures/catalog.json` illustrates maintained versions and a base → toolset dependency chain. Its metadata is illustrative and CI never builds it.

## Catalog contract

| Field                   | Meaning                                                                      |
| ----------------------- | ---------------------------------------------------------------------------- |
| `id`                    | Unique stable identifier; also a Bake target                                 |
| `layer`                 | `base` or `toolset`                                                          |
| `repository`            | Registry repository name beginning with `sandbox-`                           |
| `capability`            | Primary capability name, e.g. `base`, `codex`, `python`                      |
| `version`               | Exact canonical SemVer without build metadata                                |
| `parent`                | Required for toolset; absent for base                                        |
| `dockerfile`, `context` | Repository-relative recipe file and build context directory                  |
| `args`                  | Pinned build arguments; never credentials                                    |
| `watch`                 | Additional files/directories that trigger rebuilds                           |
| `platforms`             | Both `linux/amd64` and `linux/arm64`                                         |
| `checks`                | Command, expected `--version` value, and credential-free shell smoke command |

Toolsets depend directly on a base. A repository identifies one layer/capability. Multiple capability and parent versions can coexist; output tags must be unique.

Use narrow build contexts. Any changed file beneath a context triggers its image; `context: "."` treats every file as an input. `watch` accepts literal paths, not globs. Include shared installation scripts and vendored Paperclip sources. Declared paths must exist and resolve inside the repository.

Derived recipes must use `paperclip-parent` as their parent `FROM` reference. Bake maps this named context to an affected local parent target or an unchanged parent's resolved registry digest. If Hadolint flags this named context as untagged, place `# hadolint ignore=DL3006` immediately above that one `FROM` instruction; the context is pinned by orchestration. `PARENT_IMAGE` is reserved. Bootstrap by adding the base and descendants together, or publish the base first. Unchanged parents must already exist in the registry.

## Adding or updating a version

1. Add the recipe and inputs beneath its layer directory. Pin external base images by digest, tools by exact version, and Paperclip source by reviewed immutable revision.
2. Register its exact parent and installation arguments. Each non-base entry requires a version check matching its primary version and a meaningful smoke command. Toolsets inherit base checks.
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
pnpm images plan --select expo-2 --resolve
pnpm images build --platform linux/amd64
pnpm images test --platform linux/amd64
```

`--select all` selects every entry. `--registry ghcr.io/owner` overrides the namespace; `--out` changes the output directory. Build/test also accept `--plan <file>`. The plan's source must match the checkout. `build --refresh` disables layer caching. `resolve-parents` pins external parents in an existing plan.

The JSON plan is written to `out/plan.json`; OCI layouts and evidence live beneath `out/<architecture>/`. Publishing is restricted to trusted main-branch Actions runs.

## Expo Java trust in OpenShell

The Expo image installs `/etc/profile.d/java-openshell-ca.sh`. When a login shell
(such as `bash -lc`) finds `/etc/openshell-tls/openshell-ca.pem`, it copies the JDK's
default truststore into a private directory under `/tmp`, imports the mounted CA,
and appends the truststore settings to `JAVA_TOOL_OPTIONS`. This reaches both the
Gradle wrapper and its daemon while preserving options such as
`-Djava.net.preferIPv4Stack=true`. An explicit truststore in `JAVA_TOOL_OPTIONS`
takes precedence. Without the mounted CA, the script leaves Java options alone.

Launch Java through a login shell or source the profile script before starting it.
The generated stores remain available to child processes until sandbox temporary
storage is cleared. Rebuild the image and recreate the sandbox to install this
hook; stop existing Gradle daemons before retrying with the new trust settings.
The policy must still allow Java to access distribution and dependency hosts.

## Native Godot windows with Xvfb

The Godot toolsets include Xvfb, Xauthority, XKB data/utilities, X11 diagnostics,
and Mesa software rendering. Run a native editor or project as the sandbox user:

```sh
xvfb-run -a -s '-screen 0 1152x648x24 -nolisten tcp' xdpyinfo >/dev/null
LIBGL_ALWAYS_SOFTWARE=1 xvfb-run -a -s '-screen 0 1152x648x24 -nolisten tcp' \
  godot --display-driver x11 --rendering-method gl_compatibility --editor --path /workspace/project
```

Xvfb provides an offscreen display. Capture the Godot viewport or use an X11
screenshot client on the same `DISPLAY`/`XAUTHORITY` to inspect the result.
`paperclip-godot check` verifies X11/XKB startup and captures a native fixture
viewport before continuing with export and browser checks. It prints the Xvfb
and client logs if native startup fails.

The image creates root-owned `/tmp/.X11-unix` with mode `1777`. If a provider
mounts a fresh `/tmp` over the image directory, it should recreate this directory
with the same ownership and permissions before switching to the runtime user.

The `Xvfb` launcher preloads a compatibility library for OpenShell, which blocks
the `setuid`/`setgid` calls Xserver makes before launching `xkbcomp`, even when
the requested IDs are unchanged. The library skips a reset only when the real,
effective, and saved IDs already match the requested ID. Actual identity changes
still go through libc and remain subject to sandbox restrictions. The preload is
scoped to Xvfb and its child processes.

Xvfb compiles keymaps at startup and falls back to writable `/tmp` when Debian's
`/var/lib/xkb` is not writable. No additional filesystem policy grants or
precompiled keymaps are required.

Rebuild the image and recreate existing sandboxes to install these dependencies.

## Retirement and dependency maintenance

Remove retired entries and remove/reparent descendants together. Registry artifacts are retained. Removing the selected `latest` schedules the next highest stable entry for validation. With no stable entries, no new `latest` is created; historical alias removal remains a deliberate registry administration action.

Renovate updates npm dependencies, Actions, external Dockerfile digests, and BuildKit.
Provider CLI versions are owned by the Paperclip release. Update the source image,
release metadata, daemon hashes, pack identities and CLI checks together as described
in [Runner release matching](runner.md). Do not update an individual CLI in the pack.

Update matching catalog versions, arguments, and checks together. Catalog entries remain deliberate support decisions; Renovate does not retire versions or generate combinations.

Update CI binary versions, asset URLs, and official release checksums together in `scripts/tools.lock.json`. Checksum mismatch is fatal. Skopeo's architecture-specific Ubuntu revisions are pinned in `scripts/install-skopeo.sh`; maintain these with the runner distribution.

Catalogs and build plans use `schemaVersion: 2`. Old build plans fail with a
regeneration instruction. A historical v1 release baseline triggers a full rebuild
without interpreting or validating its retired dependency graph.
