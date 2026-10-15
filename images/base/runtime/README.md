# Base runtime 1.0.0

The `base-1` catalog entry publishes `sandbox-base:1.0.0` for Linux AMD64 and ARM64. This version identifies the shared runtime contract; Node and operating system security updates can be incorporated through rebuilds and reviewed pin updates.

## Contents and defaults

- Debian Bookworm with Node.js 24.22.0 and npm from the digest-pinned official Node image.
- npm's bundled `brace-expansion` and `undici` dependencies receive compatible patch releases 5.0.11 and 6.28.1, downloaded with verified SHA-256 checksums. These fix CVE-2026-102276, CVE-2026-102278, and CVE-2026-19534 while upstream npm still bundles affected versions. Update versions and checksums together; remove the overrides once the pinned Node image includes fixed dependencies. The offline smoke check exercises `npm pack`.
- Bash/POSIX shell, CA certificates, coreutils, curl, git, ripgrep, tar, and tini. Distribution packages receive security updates at build time; APT versions intentionally follow Bookworm updates.
- A statically compiled `paperclip-agent-shim`, built with digest-pinned Go 1.27.2. The compiler is confined to the build stage. BuildKit cross-compiles the shim for the target architecture without downloading Go modules.
- User/group `paperclip` (`1000:1000`), home `/home/paperclip`, workspace `/workspace`, cache `/home/paperclip/.cache`, and temporary directory `/tmp`. Home, cache, and workspace are owned by the runtime user.
- Entrypoint `/usr/bin/tini --` and default command `/usr/local/bin/paperclip-agent-shim`.

The official Node image's existing UID/GID 1000 account is renamed to preserve the Paperclip contract. Node and npm are already on PATH; launch requires no profile changes or runtime installers. Harness images add their agent CLI using `FROM paperclip-parent`.

The provider mounts a readable `/run/paperclip/runtime-command.json`, for example:

```json
{ "command": "node", "args": ["-e", "console.log('hello from Paperclip')"] }
```

The shim resolves the command on PATH and replaces itself with the command, preserving arguments, environment, signals, and exit status. Missing or invalid command files fail immediately. For an idle sandbox using provider exec, override the command explicitly, for example with `sleep infinity`.

For a read-only root filesystem, supply writable mounts at `/workspace`, `/home/paperclip`, and `/tmp`, owned by UID/GID 1000. Create the cache directory in a mounted home or set `XDG_CACHE_HOME` to a writable directory. Supply credentials and egress policy per run. Provider isolation, workspace synchronization validation, and bridge authorization must be enforced outside this image.

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
pnpm images plan --select base-1 --resolve
pnpm images build --platform linux/amd64
pnpm images test --platform linux/amd64
```

Repeat build and test on native ARM64 with `--platform linux/arm64`. The existing pipeline runs restricted runtime checks, shim launch/signal/exit checks, vulnerability and secret scans, and SBOM generation for both architectures before publishing.
