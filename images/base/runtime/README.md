# Base runtime 2.0.0

The `base-2` catalog entry publishes `sandbox-base:2.0.0` for Linux AMD64 and ARM64. This version identifies the shared runtime contract; Node and operating system security updates can be incorporated through rebuilds and reviewed pin updates.

## Contents and defaults

- Debian Trixie with Node.js 24.22.0 and npm from the digest-pinned official Node image.
- npm's bundled `brace-expansion` and `undici` dependencies receive compatible releases 5.0.11 and 6.29.1, downloaded with verified SHA-256 checksums. These fix CVE-2026-102276, CVE-2026-102278, CVE-2026-19534, and CVE-2026-109869 while upstream npm still bundles affected versions. Update versions and checksums together; remove the overrides once the pinned Node image includes fixed dependencies. The offline smoke check exercises `npm pack`.
- Python 3.13 from Trixie, available as both `python` and `python3`, with `venv` support and pip inside virtual environments. Use `python -m venv /workspace/.venv` and `/workspace/.venv/bin/python -m pip install ...` for project dependencies. The offline runtime contract creates a virtual environment, checks pip, and exercises Python file I/O.
- Bash/POSIX shell, CA certificates, coreutils, curl, GitHub CLI (`gh`), git, jq, ripgrep, tar, and tini. Distribution packages receive security updates at build time; APT versions intentionally follow Trixie updates. The offline runtime contract checks `gh --version` and JSON processing with `jq`; supply GitHub credentials per run when authenticated operations are needed.
- A statically compiled `paperclip-agent-shim`, built with digest-pinned Go 1.27.3. The compiler is confined to the build stage. BuildKit cross-compiles the shim for the target architecture without downloading Go modules.
- User/group `paperclip` (`1000:1000`), home `/home/paperclip`, workspace `/workspace`, and temporary directory `/tmp`. The cache defaults to `$HOME/.cache`, so it follows the runtime home supplied by the container environment.
- Entrypoint `/usr/bin/tini --` and default command `/usr/local/bin/paperclip-agent-shim`.

The official Node image's existing UID/GID 1000 account is renamed to preserve the Paperclip contract. Node and npm are already on PATH; launch requires no profile changes or runtime installers. Toolsets extend this base using `FROM paperclip-parent`.

The pinned official Paperclip v2026.1106.0 image supplies the Runner daemon and provider pack, with Codex
0.160.0, Claude 2.1.286 (from the pinned Claude Agent SDK), and OpenCode 1.18.34.
The direct `claude-code` alias uses the same pack launcher as `claude`.
OpenCode's managed `/etc/opencode/opencode.json` disables snapshots.
See [Runner provenance and release matching](../../../docs/runner.md).
Select `base-2` to rebuild the base and both toolsets together.

The provider mounts a readable `/run/paperclip/runtime-command.json`, for example:

```json
{ "command": "node", "args": ["-e", "console.log('hello from Paperclip')"] }
```

The shim resolves the command on PATH and replaces itself with the command, preserving arguments, environment, signals, and exit status. Missing or invalid command files fail immediately. For an idle sandbox using provider exec, override the command explicitly, for example with `sleep infinity`.

For a read-only root filesystem, supply writable mounts at `/workspace`, `/home/paperclip`, and `/tmp`, owned by UID/GID 1000. Cache files default to `$HOME/.cache`; if a sandbox runtime changes `HOME`, mount that home writable for the runtime UID/GID as well. Supply credentials and egress policy per run. Provider isolation, workspace synchronization validation, and bridge authorization must be enforced outside this image.

## Upstream provenance

Reviewed Paperclip revision: [`13e5128164500cf1ec7d27163581d73d246120c1`](https://github.com/paperclipai/paperclip/tree/13e5128164500cf1ec7d27163581d73d246120c1).

The files `agent-shim/go.mod`, `agent-shim/main.go`, and `agent-shim/runtime_command.go` are copied unchanged from that revision's `tools/agent-shim/`. `agent-shim/LICENSE` is the upstream repository license. Update these files and the recorded revision together after reviewing upstream changes.

References at the reviewed revision:

- [Base Dockerfile](https://github.com/paperclipai/paperclip/blob/13e5128164500cf1ec7d27163581d73d246120c1/docker/agent-runtime/Dockerfile.base)
- [Runtime image documentation](https://github.com/paperclipai/paperclip/blob/13e5128164500cf1ec7d27163581d73d246120c1/docker/agent-runtime/README.md)
- [Sandbox requirements](https://github.com/paperclipai/paperclip/blob/13e5128164500cf1ec7d27163581d73d246120c1/packages/plugins/sandbox-providers/SANDBOX-REQUIREMENTS.md)

The Debian Node image replaces upstream's Ubuntu/NodeSource installation to pin Node directly and avoid executing a remote installer. The init, shim, UID/GID, workspace, and command-file defaults follow upstream and this repository's [validation contract](../../../docs/validation.md).

## Build and validation

```sh
pnpm images plan --select base-2 --resolve
pnpm images build --platform linux/amd64
pnpm images test --platform linux/amd64
```

Repeat build and test on native ARM64 with `--platform linux/arm64`. The existing pipeline runs restricted runtime checks, shim launch/signal/exit checks, vulnerability and secret scans, and SBOM generation for both architectures before publishing.
