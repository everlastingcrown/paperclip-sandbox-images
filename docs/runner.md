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

The assets come from Paperclip **v2026.1106.0**, source
`d69631b01b9c658f80bf8bed389863dce82643e1`, using the source image
`ghcr.io/paperclipai/paperclip:2026.1106.0@sha256:d6584f05cf57a4b26c117eb083725f18c1fe69ddafa7d16c9f8cce83f6fa17da`.
The image's OCI labels were checked against the release revision on both architectures.
The pinned Node runtime is Debian Trixie; the released daemon requires GNU libc
2.39 or newer. Python is 3.13, and Expo uses OpenJDK 21.

[runner-release.json](../images/base/runtime/runner-release.json) records both
Linux image daemon hashes, image provider-pack identities, source provenance, fallback server
artifact URL and SHA-256, and the direct CLI versions:

| CLI      | Version                                       |
| -------- | --------------------------------------------- |
| Codex    | 0.160.0                                       |
| Claude   | 2.1.286, supplied by Claude Agent SDK 0.3.286 |
| OpenCode | 1.18.34                                       |

These versions follow Paperclip's release. Update the release image, source
revision, server artifact checksum, release manifest, both pack manifests and
CLI checks together. Never independently install or upgrade one provider inside
the pack. Upstream package license files and manifests stay with the imported
graph; `/opt/paperclip-runner/provenance.json` records package license metadata,
CLI versions and release identities. The Runner uses Paperclip's MIT license,
preserved under `/usr/local/share/licenses/paperclip-agent-shim/LICENSE`.
Provider packages retain their own terms and license files.

The importer first checks
`/app/server/dist/vendor/paperclip-runner/bin/paperclip-runnerd`
in the target architecture of the pinned image. Both published architectures were
inspected and contain that path. A present daemon must match the recorded image
SHA-256. When the
platform daemon is absent, it extracts that exact daemon from
`@paperclipai/server@2026.1106.0` after verifying the recorded tarball checksum.
It records the source in `/opt/paperclip-runner/asset-origin.json`; CI logs the
missing image path when the fallback is used. There is no Rust compilation or
independent daemon update in these recipes.

The official Docker image and npm server package use the same release tag and
source revision, but their daemon bytes and provider-pack identities differ.
The image remains the source of truth for these recipes. The two checked-in
`linux-*-provider-pack.json` files are the exact manifests from its native layers;
`server-release-manifest.json` records the npm artifact identities for the daemon
fallback only. Verification never treats a shared version string as proof that
the bytes are equal. Use the exact pinned official controller image for rollout;
compatibility with an npm-installed controller of the same version requires
separate asset qualification.

| Target      | Image provider-pack digest                                                | npm provider-pack digest                                                  |
| ----------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Linux x64   | `sha256:9ba7212fb6d805a67b2cab3b4716ef8d1e5a8f4d30394eed4a62e38ef0f9aec0` | `sha256:36a1b2287af072c8fccfa21f1772bb41e6eabead46bf6627e1a10661aad0024a` |
| Linux ARM64 | `sha256:24527a66d4fe72b55f40bac7ed3b0e85cfc7ae0f6372f0c0c4ccbe47f7ca9548` | `sha256:0167cf267f06b40a949d98b78e237d54c1a25d36ddc115de744628c48a461439` |

Paperclip's controller reuses preinstalled assets only when its release metadata
and digests match. Without a usable sandbox daemon it stages its own verified,
release-matched daemon; it does not fetch an arbitrary daemon in the sandbox.
The matching image supplies the pack. See upstream's
[Runner release packaging](https://github.com/paperclipai/paperclip/blob/v2026.1106.0/packages/paperclip-runner/README.md)
and [remote environment configuration](https://github.com/paperclipai/paperclip/blob/v2026.1106.0/docs/deploy/environment-variables.md).

OpenCode Runner execution is unsupported on Linux ARM64 for this release.
The direct OpenCode CLI and legacy execution remain available on ARM64.

Before rollout, replace the older custom controller with the matching pinned official
controller image in a separate deployment change. Run authenticated Runner tasks and
follow-ups through OpenShell and retain logs proving reuse of preinstalled assets.
Check Codex and OpenCode within their existing policy boundaries; merely having
all three CLIs installed does not authorize additional model endpoints. Both
native image jobs must pass release identity checks, restricted runtime and CLI
checks, scans and SBOM generation. Local Docker builds, live policy application,
and controller deployment changes are outside this implementation.
