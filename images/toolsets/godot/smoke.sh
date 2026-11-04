#!/bin/sh
set -eu
work=$(mktemp -d "${TMPDIR:-/tmp}/godot-smoke.XXXXXX")
trap 'rm -rf "$work"' EXIT HUP INT TERM
# Godot exports use fixed temporary filenames; isolate concurrent checks.
export TMPDIR="$work/tmp"
mkdir "$work/project" "$work/exports" "$TMPDIR"
cp -R /opt/godot-tools/fixture/. "$work/project/"
cd "$work/project"
version=$(cat /opt/godot/TEMPLATE_VERSION)
godot --version | rg -F "$version"
test -r "${XDG_DATA_HOME:-$HOME/.local/share}/godot/export_templates/$version/version.txt"
test "$(sqlite3 :memory: 'select 40 + 2;')" = 42
timeout 60 godot --headless --path . --editor --import
timeout 15 godot --headless --path . --script check.gd > check.log 2>&1
cat check.log
rg '^GODOT_CHECK_PASSED$' check.log
# Check XKB/authentication before opening a native window with software OpenGL.
# Keep both clients on the same authenticated display; retain Xvfb diagnostics.
if ! timeout 60 xvfb-run -a -e "$work/xvfb.log" \
  -s '-screen 0 1152x648x24 -nolisten tcp' \
  sh -eu -c '
    xdpyinfo > display.log
    rg -q XKEYBOARD display.log
    LIBGL_ALWAYS_SOFTWARE=1 godot --display-driver x11 \
      --rendering-method gl_compatibility --audio-driver Dummy \
      --path . --script check-native.gd
  ' > native.log 2>&1; then
  cat "$work/xvfb.log" native.log
  exit 1
fi
cat native.log
rg '^GODOT_NATIVE_CHECK_PASSED$' native.log
test -s native.png
for target in Web Linux Windows; do
  case "$target" in
    Web) output=index.html ;;
    Linux) output=smoke.x86_64 ;;
    Windows) output=smoke.exe ;;
  esac
  timeout 120 godot --headless --path . --export-release "$target" "$work/exports/$output"
  test -s "$work/exports/$output"
done
cd "$work"
node /opt/godot-tools/smoke-browser.mjs
printf 'Godot toolset checks passed\n'
