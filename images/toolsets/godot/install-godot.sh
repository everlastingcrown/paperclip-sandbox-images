#!/bin/sh
set -eu
case "$TARGETARCH" in
  amd64) arch=x86_64; checksum=$GODOT_AMD64_SHA256 ;;
  arm64) arch=arm64; checksum=$GODOT_ARM64_SHA256 ;;
  *) echo "Unsupported architecture: $TARGETARCH" >&2; exit 1 ;;
esac
release="https://github.com/godotengine/godot-builds/releases/download/${GODOT_VERSION}-stable"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT HUP INT TERM
curl --fail --silent --show-error --location "$release/Godot_v${GODOT_VERSION}-stable_linux.${arch}.zip" -o "$work/editor.zip"
curl --fail --silent --show-error --location "$release/Godot_v${GODOT_VERSION}-stable_export_templates.tpz" -o "$work/templates.tpz"
printf '%s  %s\n' "$checksum" "$work/editor.zip" "$GODOT_TEMPLATES_SHA256" "$work/templates.tpz" > "$work/checksums"
sha256sum --check --strict "$work/checksums"
mkdir -p /opt/godot/templates
unzip -q "$work/editor.zip" -d "$work/editor"
install -m 0755 "$work/editor/Godot_v${GODOT_VERSION}-stable_linux.${arch}" /opt/godot/godot
# Retain only the supported export targets, including both Linux architectures.
unzip -q "$work/templates.tpz" 'templates/version.txt' 'templates/icudt_godot.dat' 'templates/linux_*x86_64' 'templates/linux_*arm64' 'templates/windows_*x86_64.exe' 'templates/windows_*x86_64_console.exe' 'templates/web_*.zip' -d "$work"
test "$(cat "$work/templates/version.txt")" = "${GODOT_VERSION}.stable"
mv "$work/templates" "/opt/godot/templates/${GODOT_VERSION}.stable"
printf '%s\n' "${GODOT_VERSION}.stable" > /opt/godot/TEMPLATE_VERSION
chmod -R a+rX /opt/godot
