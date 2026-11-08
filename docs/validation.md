# Validation contract

Follow [Paperclip's sandbox requirements](https://github.com/paperclipai/paperclip/blob/master/packages/plugins/sandbox-providers/SANDBOX-REQUIREMENTS.md), using [the upstream runtime images](https://github.com/paperclipai/paperclip/tree/master/docker/agent-runtime) as the initial shim/defaults reference. Future recipes should record the reviewed upstream revision they implement.

## Runtime tests

Adopt UID/GID `1000:1000`, `WORKDIR /workspace`, home `/home/paperclip`, and shim command file `/run/paperclip/runtime-command.json`. Supply `sh`, Node.js 24+, Python 3.13 (`python` and `python3`) with `venv` and pip in virtual environments, `tar`, `gh`, `git`, `rg`, `tini`, and `paperclip-agent-shim` directly on PATH. Verify `gh --version`, virtual environment creation, pip availability, and Python file I/O offline as the runtime user. Derived recipes preserve the init/shim defaults.

Tests use a read-only root filesystem, dropped capabilities, no privilege escalation, bounded resources, and no network. Writable mounts provide workspace, home/cache, and temporary storage. Checks cover writes, archive round-trips, declared CLI versions, and functional smoke commands. A synthetic shim command tests launch, argument delivery, SIGTERM forwarding, and preservation of child exit status.

Authenticated API calls are excluded from required smoke tests. Add separately controlled integration checks where necessary; never bake credentials into images.

## Security and supply chain

Trivy reports vulnerabilities on each architecture. Fixable high/critical findings block publication except for the explicitly accepted upstream provider-pack findings in `scripts/trivyignore.yaml`. Each exception identifies a finding ID, package version (PURL), exact vendored path, and reason; review and remove these exceptions when updating the Paperclip release. The exceptions apply only to the publication vulnerability gate; the full JSON vulnerability report retains all findings. Unfixed findings remain visible. Secret scanning runs separately without vulnerability severity/status filtering or these exceptions, and any detected secret blocks publication. Scanner/download/database failures are fatal. There is no automatic bypass or blanket ignore list.

SBOMs use CycloneDX. BuildKit emits provenance. Cosign signs and attests via GitHub OIDC; verification requires the exact main-branch workflow identity and GitHub issuer. CI binaries have fixed checksums, Actions have fixed commits, and image build/test jobs have no publishing credentials.

## Assurance limits

The image is not the host security boundary. Paperclip/the provider must enforce host filesystem isolation, synchronization validation, management socket isolation, bridge authentication/routing, and egress policy outside the sandbox. Image smoke tests cannot prove these controls.

Unit tests verify infrastructure using metadata fixtures, synthetic OCI layouts, and mocked external tools. The active base, Expo, and Godot recipes enable real builds and runtime checks on both architectures. Inherited base checks exercise Claude's project MCP configuration, Codex's shell completion generation, and OpenCode's local storage paths without API credentials. Architecture compatibility, scanning integration, GHCR promotion, and OIDC signing require successful workflow runs; registering a recipe alone does not verify them. Empty-catalog CI explicitly reports runtime checks as skipped.

## Runner assets

Both native architecture builds import the digest-pinned Paperclip source image.
The importer checks the vendored architecture-local daemon path, records whether it
exists, and checks its recorded image SHA-256. A missing daemon uses only the recorded
server release tarball, whose SHA-256 is checked before extraction. A present
but mismatched daemon fails the build.

Build and restricted runtime checks compare the installed pack manifest bytes
with the matching pinned image manifest, recompute its canonical payload digest,
verify architecture/source revision, verify every declared artifact, and hash the
dist and declared provider trees including symlinks. The imported pack retains
its contents and modes. Builds record CLI versions and package license provenance
in `/opt/paperclip-runner/provenance.json`. CI runs the daemon's build metadata
command and direct CLI smoke checks without network or credentials, then scans
and emits SBOMs before promotion. There are no local Docker builds in this migration.

Authenticated Runner tasks, follow-ups, OpenShell policy enforcement and evidence
of preinstalled asset reuse remain required before rollout against the matching
pinned official controller image. Those live acceptance checks cannot be established by unit
or offline image tests. Linux ARM64 retains direct OpenCode/legacy execution;
OpenCode Runner use is unsupported there for this release.
