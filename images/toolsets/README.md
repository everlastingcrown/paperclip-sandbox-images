# Toolset images

Each capability extends an exact base entry through `paperclip-parent`. Both
include the base's Runner, provider pack, three CLIs and inherited smoke checks.

- [Expo](expo/README.md): web development and Playwright on AMD64/ARM64, plus
  Android build tooling on AMD64. Publishes `sandbox-expo:2.0.0`.
- [Godot](godot/README.md): Godot, Web/Linux/Windows exports, SQLite, Xvfb and
  Playwright on AMD64/ARM64. Publishes `sandbox-godot:2.0.0`.

Projects, addons and credentials are supplied at runtime. See
[image authoring](../../docs/images.md) and [Runner release matching](../../docs/runner.md).
