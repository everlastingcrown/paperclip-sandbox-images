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
