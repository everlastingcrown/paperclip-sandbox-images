# Runner release matching and migration

The v2 image family is `base → toolset`. The three catalog entries are `base-2`,
`expo-2` and `godot-2`, all versioned `2.0.0` and published in `sandbox-base`,
`sandbox-expo` and `sandbox-godot`. Both toolsets parent directly to `base-2`.

| Previous reference                                                     | Replacement           |
| ---------------------------------------------------------------------- | --------------------- |
| `sandbox-base:1.0.0`                                                   | `sandbox-base:2.0.0`  |
| `sandbox-codex`, `sandbox-claude`, `sandbox-opencode`                  | `sandbox-base:2.0.0`  |
| `sandbox-expo-codex`, `sandbox-expo-opencode` with CLI-specific tags   | `sandbox-expo:2.0.0`  |
| `sandbox-godot-codex`, `sandbox-godot-opencode` with CLI-specific tags | `sandbox-godot:2.0.0` |

Use the published immutable build tag or digest when configuring a sandbox.
The old repositories and published bytes remain available for rollback.

Every image contains the Paperclip Runner daemon at
`/opt/paperclip-runner/bin/paperclip-runnerd`, exposed as `paperclip-runnerd` on
PATH, and the unchanged pack at `/opt/paperclip-runner/provider-pack`.
`codex`, `claude`, `claude-code` and `opencode` invoke that pack's pinned launchers.
They do not need a profile or runtime installation. System Node 24.22.0 remains
first on PATH, while pack launchers retain their verified bundled interpreter.
OpenCode's managed configuration sets `snapshot: false`.

The assets are pinned to the Paperclip backport source
`6b7a08a6889073135e2651de2295402e09f4d70f`, using the source image
`ghcr.io/everlastingcrown/paperclip-backport:sha-6b7a08a6889073135e2651de2295402e09f4d70f@sha256:02631216fd0bde3c5da71621f65b644c81374820fcdcf77f7f2c7188ab2ca284`.
The pinned backport image index includes Linux amd64 and ARM64 manifests.
The importer verifies the vendored runner against the release revision and
checksums below.
The pinned Node runtime is Debian Trixie; the released daemon requires GNU libc
2.39 or newer. Python is 3.13, and Expo uses OpenJDK 21.

[runner-release.json](../images/base/runtime/runner-release.json) records both
Linux image daemon hashes, image provider-pack identities, source provenance,
and the direct CLI versions:

| CLI      | Version                                       |
| -------- | --------------------------------------------- |
| Codex    | 0.160.0                                       |
| Claude   | 2.1.286, supplied by Claude Agent SDK 0.3.286 |
| OpenCode | 1.18.34                                       |

These versions follow the pinned backport image. Update the image digest, source
revision, both daemon checksums, both pack manifests and CLI checks together.
Never independently install or upgrade one provider inside the pack. Upstream package license files and manifests stay with the imported
graph; `/opt/paperclip-runner/provenance.json` records package license metadata,
CLI versions and release identities. The Runner uses Paperclip's MIT license,
preserved under `/usr/local/share/licenses/paperclip-agent-shim/LICENSE`.
Provider packages retain their own terms and license files.

The importer requires
`/app/server/dist/vendor/paperclip-runner/bin/paperclip-runnerd`
in each target architecture of the pinned image. Its build stamp must match the
backport source revision and its bytes must match the recorded image SHA-256.
It records the source in `/opt/paperclip-runner/asset-origin.json`. A missing or
mismatched daemon fails the build. The upstream npm server release is not a
fallback for the fork's assets.

The two checked-in `linux-*-provider-pack.json` files are the exact manifests
from the pinned image's native layers. Verification checks their source revision,
platform, payload digest, artifact hashes and provider trees. The image is the
source of truth; a shared version string does not prove identical bytes.
Use the matching pinned backport controller image for rollout.

Paperclip's controller reuses preinstalled assets only when its release metadata
and digests match. Without a usable sandbox daemon it stages its own verified,
release-matched daemon; it does not fetch an arbitrary daemon in the sandbox.
The matching image supplies the pack. See upstream's
[Runner release packaging](https://github.com/paperclipai/paperclip/blob/v2026.1106.0/packages/paperclip-runner/README.md)
and [remote environment configuration](https://github.com/paperclipai/paperclip/blob/v2026.1106.0/docs/deploy/environment-variables.md).

OpenCode Runner execution is unsupported on Linux ARM64 for this release.
The direct OpenCode CLI and legacy execution remain available on ARM64.

Before rollout, replace the older custom controller with the matching pinned backport
controller image in a separate deployment change. Run authenticated Runner tasks and
follow-ups through OpenShell and retain logs proving reuse of preinstalled assets.
Check Codex and OpenCode within their existing policy boundaries; merely having
all three CLIs installed does not authorize additional model endpoints. Both
native image jobs must pass release identity checks, restricted runtime and CLI
checks, scans and SBOM generation. Local Docker builds, live policy application,
and controller deployment changes are outside this implementation.
