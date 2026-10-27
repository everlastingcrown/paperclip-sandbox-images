# Godot toolset 1.0.0

Generic Godot development tools over the shared non-root Paperclip runtime. Clone
or mount your project into `/workspace`; source, addons, project configuration,
credentials, and project dependencies are supplied at runtime.

| Catalog ID         | Parent            | Version tag                                    |
| ------------------ | ----------------- | ---------------------------------------------- |
| `godot-1-codex`    | `codex-0-162-1`   | `sandbox-godot-codex:1.0.0-codex-0.162.1`      |
| `godot-1-opencode` | `opencode-1-19-0` | `sandbox-godot-opencode:1.0.0-opencode-1.19.0` |

Both Linux AMD64 and ARM64 images include:

- Standard Godot 4.6.3 (GDScript), with matching Web, Linux AMD64/ARM64, and Windows
  x86_64 debug/release export templates.
- Playwright 1.61.0 and its Chromium revision, with software WebGL rendering.
- Static server `serve` 14.2.6, SQLite CLI, and inherited Node.js/npm, Git, and GitHub CLI.

The standard build does not include .NET/C#, Android SDKs, native desktop display
streaming, or a Godot MCP integration. Native addons must supply binaries matching
the host and export target architectures. Producing a cross-platform export does
not imply that the sandbox can execute that target's binaries.

## Development

Use the ordinary `paperclip` user. Keep `/workspace`, `/home/paperclip`, and `/tmp`
writable. Tools and Chromium live under `/opt`, so a fresh mounted home does not
hide them. The `godot` launcher links the baked template version into
`${XDG_DATA_HOME:-$HOME/.local/share}/godot/export_templates` when absent. Existing
project-managed templates are preserved. Godot's normal CLI arguments are passed
through unchanged; use `--headless` for imports, exports, and server processes.

From a project checkout:

```sh
godot --headless --editor --import
godot --headless --path . --quit-after 120

# Use preset names defined in the project's export_presets.cfg.
mkdir -p exports/web exports/linux exports/windows
godot --headless --export-release 'Web' exports/web/index.html
godot --headless --export-release 'Linux' exports/linux/game.x86_64
godot --headless --export-release 'Windows' exports/windows/game.exe
serve --listen tcp://127.0.0.1:4173 --no-clipboard exports/web
```

Imports write generated data to the project's `.godot` directory; user data and
editor state use the writable home/XDG directories. Export presets, assets,
GDExtensions, and entry scenes remain the project's responsibility. Diagnose
missing addons and script/import errors before exporting. Some presets require
additional SDKs that this bundle does not supply.

For browser tests, use the bundled Playwright package at
`/opt/godot-tools/node_modules/playwright/index.mjs` or install project dependencies
separately with an appropriate policy. Match project Playwright to version 1.61.0
when using the shared browser revision. Launch headless Chromium with
`--use-gl=angle`, `--use-angle=swiftshader`, and `--enable-unsafe-swiftshader` for
software WebGL rendering; see `smoke-browser.mjs` for a complete local example.
Threaded Web exports also need a server that supplies cross-origin isolation
headers; the smoke fixture uses a single-threaded export.

Bind development servers to loopback. Access from outside the sandbox requires
provider-managed forwarding configured separately. Remote game services, asset
stores, package registries, and deployment credentials are not automatically
allowed by the associated Godot policy.

## Validation and builds

`paperclip-godot --version` reports the bundle release. `paperclip-godot check`
uses a synthetic project to import an SVG, run GDScript, write user data, exchange
WebSocket packets on loopback, query SQLite, and export Web/Linux/Windows builds.
It loads the Web export in Chromium, clicks the rendered Godot button, verifies
the game callback, and captures a screenshot inside its temporary work directory.
The browser and WebSocket checks bind OS-assigned loopback ports so parallel
builds cannot connect to another check's server. Each invocation also isolates
Godot's temporary export files and removes them on exit. No external network,
project checkout, or credentials are required. Generated native binaries are not executed on `noexec` mounts.

The catalog repeats these checks with a read-only root filesystem, fresh writable
home, no external network, and inherited harness checks. Both native architectures
must pass the runtime checks and scans before publication.

```sh
# Select the full chain when parents have not already been published.
pnpm images plan --select base-1
pnpm images build --platform linux/amd64
pnpm images test --platform linux/amd64

# Or select a toolset against its published parent.
pnpm images plan --select godot-1-codex --resolve
```

Repeat build/test on a native ARM64 worker. See [image authoring](../../../docs/images.md)
for artifact, selection, validation, and publication details.

Godot URLs and SHA-256 values in the Dockerfile and catalog must be updated
together. Downloads are pinned to the [official 4.6.3 release](https://github.com/godotengine/godot-builds/releases/tag/4.6.3-stable),
using its published asset digests. Only supported template targets are retained.
Distribution libraries track Debian security updates, as in the base image. The
Node lockfile uses the same patched `compression` override as the Expo toolset.
