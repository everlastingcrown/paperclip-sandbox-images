#!/bin/sh
set -eu

test "$(id -u)" = 1000
test "$(id -g)" = 1000
test "$PWD" = /workspace
for command in sh node tar git rg tini paperclip-agent-shim; do
  command -v "$command" >/dev/null
done
node -e 'if (Number(process.versions.node.split(".")[0]) < 24) process.exit(1)'

for directory in /workspace "$HOME" "$XDG_CACHE_HOME" "$TMPDIR"; do
  test -d "$directory"
  touch "$directory/.contract-write"
  rm "$directory/.contract-write"
done
mkdir /workspace/source /workspace/restored
printf 'archive round-trip\n' > /workspace/source/check.txt
tar -cf /tmp/workspace.tar -C /workspace/source .
tar -xf /tmp/workspace.tar -C /workspace/restored
cmp /workspace/source/check.txt /workspace/restored/check.txt
test ! -w /usr/local/bin
test ! -S /var/run/docker.sock
printf 'Runtime contract passed\n'
