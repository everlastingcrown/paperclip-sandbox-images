#!/bin/sh
set -eu

test "$(id -u)" = 1000
test "$(id -g)" = 1000
test "$PWD" = /workspace
for command in sh node python python3 tar gh git jq rg tini paperclip-agent-shim paperclip-runnerd codex claude claude-code opencode; do
  command -v "$command" >/dev/null
done
gh --version
printf '{"tool":"jq"}\n' | jq -e '.tool == "jq"' >/dev/null
node -e 'if (Number(process.versions.node.split(".")[0]) < 24) process.exit(1)'

python -c 'import sys; assert sys.version_info[:2] == (3, 13)'
python3 -m venv /tmp/python-contract-venv
/tmp/python-contract-venv/bin/python -m pip --version
/tmp/python-contract-venv/bin/python -c 'import pathlib; p = pathlib.Path("/workspace/python-smoke.txt"); p.write_text("paperclip\n"); assert p.read_text() == "paperclip\n"; p.unlink()'
rm -rf /tmp/python-contract-venv

mkdir -p "${XDG_CACHE_HOME:-$HOME/.cache}"
for directory in /workspace "$HOME" "${XDG_CACHE_HOME:-$HOME/.cache}" "$TMPDIR"; do
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
test "$(command -v node)" = /usr/local/bin/node
node /opt/paperclip-runner/verify-assets.mjs /opt/paperclip-runner
paperclip-runnerd --build-metadata | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>JSON.parse(s))'
test ! -w /opt/paperclip-runner/provider-pack
printf 'Runtime contract passed\n'
