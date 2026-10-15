# Validation contract

Follow [Paperclip's sandbox requirements](https://github.com/paperclipai/paperclip/blob/master/packages/plugins/sandbox-providers/SANDBOX-REQUIREMENTS.md), using [the upstream runtime images](https://github.com/paperclipai/paperclip/tree/master/docker/agent-runtime) as the initial shim/defaults reference. Future recipes should record the reviewed upstream revision they implement.

## Runtime tests

Adopt UID/GID `1000:1000`, `WORKDIR /workspace`, home `/home/paperclip`, and shim command file `/run/paperclip/runtime-command.json`. Supply `sh`, Node.js 24+, `tar`, `git`, `rg`, `tini`, and `paperclip-agent-shim` directly on PATH. Derived recipes preserve the init/shim defaults.

Tests use a read-only root filesystem, dropped capabilities, no privilege escalation, bounded resources, and no network. Writable mounts provide workspace, home/cache, and temporary storage. Checks cover writes, archive round-trips, declared CLI versions, and functional smoke commands. A synthetic shim command tests launch, argument delivery, SIGTERM forwarding, and preservation of child exit status.

Authenticated API calls are excluded from required smoke tests. Add separately controlled integration checks where necessary; never bake credentials into images.

## Security and supply chain

Trivy reports vulnerabilities on each architecture. Fixable high/critical findings block publication; unfixed findings remain visible. Secret scanning runs separately without vulnerability severity/status filtering, and any detected secret blocks publication. Scanner/download/database failures are fatal. There is no automatic bypass or blanket ignore list.

SBOMs use CycloneDX. BuildKit emits provenance. Cosign signs and attests via GitHub OIDC; verification requires the exact main-branch workflow identity and GitHub issuer. CI binaries have fixed checksums, Actions have fixed commits, and image build/test jobs have no publishing credentials.

## Assurance limits

The image is not the host security boundary. Paperclip/the provider must enforce host filesystem isolation, synchronization validation, management socket isolation, bridge authentication/routing, and egress policy outside the sandbox. Image smoke tests cannot prove these controls.

Unit tests verify infrastructure using metadata fixtures, synthetic OCI layouts, and mocked external tools. The active base, Claude, Codex, and OpenCode recipes enable real builds and runtime checks on both architectures. Harness checks exercise Claude's project MCP configuration, Codex's shell completion generation, and OpenCode's local storage paths without API credentials. Architecture compatibility, scanning integration, GHCR promotion, and OIDC signing require successful workflow runs; registering a recipe alone does not verify them. Empty-catalog CI explicitly reports runtime checks as skipped.
