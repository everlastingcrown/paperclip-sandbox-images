# Toolset images

Each capability family extends a specific harness through `paperclip-parent` and installs a versioned capability or bundle of pinned tools. Supported combinations are explicit catalog entries.

The [Expo toolset](expo/README.md) supplies Expo web development and Playwright on AMD64/ARM64, plus Android build tooling on AMD64, over the Codex or OpenCode harness.

See [image authoring](../../docs/images.md).

The [Godot toolset](godot/README.md) supplies headless Godot development,
Web/Linux/Windows exports, SQLite, and Playwright Chromium on AMD64/ARM64 over
Codex or OpenCode. Projects and their addons are supplied at runtime.
