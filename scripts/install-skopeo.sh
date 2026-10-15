#!/usr/bin/env bash
set -euo pipefail

# Ubuntu 24.04 supplies different revisions on these architectures.
# Check https://packages.ubuntu.com/noble/skopeo when updating either pin.
case "$(dpkg --print-architecture)" in
  amd64) version='1.13.3+ds1-2ubuntu0.24.04.3' ;;
  arm64) version='1.13.3+ds1-2build2' ;;
  *) echo 'Skopeo installer requires Ubuntu 24.04 amd64 or arm64' >&2; exit 1 ;;
esac
sudo apt-get update
sudo apt-get install --yes --no-install-recommends "skopeo=$version"
