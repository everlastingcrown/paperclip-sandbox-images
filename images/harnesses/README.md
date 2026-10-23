# Harness images

These recipes extend `base-1` through the `paperclip-parent` Bake context and install exact npm CLI versions for Linux AMD64 and ARM64.

| Catalog ID        | Published image           | npm package                 | Commands                |
| ----------------- | ------------------------- | --------------------------- | ----------------------- |
| `claude-2-1-300`  | `sandbox-claude:2.1.300`  | `@anthropic-ai/claude-code` | `claude`, `claude-code` |
| `codex-0-162-1`   | `sandbox-codex:0.162.1`   | `@openai/codex`             | `codex`                 |
| `opencode-1-19-0` | `sandbox-opencode:1.19.0` | `opencode-ai`               | `opencode`              |

Installation runs as root, retains the packages' native optional dependencies, and clears the npm download cache. Installed tools remain root-owned; ordinary execution uses UID/GID `1000:1000`. A build-time version check as that user catches missing native platform packages. The recipes inherit `/workspace`, `/home/paperclip`, the ready PATH, tini entrypoint, and agent shim command from the base. Several maintained catalog entries can share each parameterized recipe; update its version argument, catalog version, and expected version together.

Claude's `claude-code` symlink preserves the upstream Paperclip command name while keeping the original `claude` command available. The provider can mount a runtime command such as:

```json
{ "command": "claude-code", "args": ["--help"] }
```

Use `codex` or `opencode` as the command for the other harnesses. Mount a writable home, workspace, and temporary directory as described in the [base runtime documentation](../base/runtime/README.md). Supply credentials at run time.

## OpenCode snapshots

The OpenCode image installs root-owned, world-readable
`/etc/opencode/opencode.json` with `{"snapshot":false}`. Paperclip places OpenCode's
HOME under `/sandbox/paperclip-workspace/.paperclip-runtime/opencode/`; snapshots
can otherwise capture runtime data, including previous snapshots, recursively.
This managed setting also applies to the Expo OpenCode descendant.

For OpenCode 1.19.0, Linux [managed configuration](https://github.com/anomalyco/opencode/blob/v1.19.0/packages/opencode/src/config/managed.ts)
lives in `/etc/opencode`. The [configuration loader](https://github.com/anomalyco/opencode/blob/v1.19.0/packages/opencode/src/config/config.ts)
loads it after global, project, inline, and active-account configuration, so an
earlier `snapshot: true` cannot override it. It survives relocated `HOME` and
`XDG_CONFIG_HOME` without an entrypoint hook. `OPENCODE_TEST_MANAGED_CONFIG_DIR`
can explicitly override the managed directory; leave it unset in production.
Recheck these contracts when upgrading OpenCode.

Disabling snapshots removes automatic filesystem checkpoints and file restoration
through OpenCode undo/revert for subsequent steps. Snapshot-derived change
summaries may also be reduced. Conversation history, model context, normal editing,
and Git operations remain available. Existing snapshots are not deleted.

For release review, select `opencode-1-19-0` with `--resolve` using the workflow
below; this also selects `expo-1-opencode`. Build and test both architectures, then
use the trusted current-main publication workflow to promote the tested OCI bytes
without rebuilding. Publication and deployment require separate authorization.
After rollout, create a fresh sandbox using the new image digest: existing
containers and already-running OpenCode processes will not pick up this change.
Measure command timing and snapshot growth after rollout before claiming a
performance improvement. The separately observed OpenShell callback/relay timeout
has no proven relationship to snapshot pressure or demonstrated fix here.

## Upstream reference

Reviewed Paperclip revision: [`38d8f371722b315d2fb3bbaa512518742e33ce2f`](https://github.com/paperclipai/paperclip/tree/38d8f371722b315d2fb3bbaa512518742e33ce2f/docker/agent-runtime).

The [Claude](https://github.com/paperclipai/paperclip/blob/38d8f371722b315d2fb3bbaa512518742e33ce2f/docker/agent-runtime/Dockerfile.claude), [Codex](https://github.com/paperclipai/paperclip/blob/38d8f371722b315d2fb3bbaa512518742e33ce2f/docker/agent-runtime/Dockerfile.codex), and [OpenCode](https://github.com/paperclipai/paperclip/blob/38d8f371722b315d2fb3bbaa512518742e33ce2f/docker/agent-runtime/Dockerfile.opencode) recipes provide the package and command reference. These recipes use this repository's base runtime and pin CLI versions in place of upstream's `latest` installs. Package directories retain root ownership because the restricted runtime only needs to read and execute installed tools.

## Validation

```sh
pnpm check
pnpm images lint-recipes
pnpm images plan --select all --resolve
pnpm images build --platform linux/amd64
pnpm images test --platform linux/amd64
```

Repeat build and test on native ARM64 with `--platform linux/arm64`. To build one harness against an already published base, select its catalog ID with `--resolve`.

The catalog's credential-free smoke checks exercise more than version reporting:

- Claude writes a project-scoped MCP server configuration; Node verifies its command and arguments. Both executable names must resolve to the same installed CLI.
- Codex generates Bash completions; Bash parses the result and the check verifies a Codex completion registration.
- OpenCode resolves local storage paths and creates its data directory. Model fetching is disabled for this offline smoke command.

The existing workflow runs these checks alongside the inherited Node/npm checks, restricted runtime contract, shim signal/exit checks, vulnerability and secret scans, and SBOM generation on both architectures. See [image authoring](../../docs/images.md) and the [validation contract](../../docs/validation.md).
