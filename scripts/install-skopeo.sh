#!/usr/bin/env bash
set -euo pipefail

# Keep explicit Ubuntu 24.04 pins for each supported architecture.
# Check the noble-updates package indexes when updating either pin.
case "$(dpkg --print-architecture)" in
  amd64) version='1.13.3+ds1-2ubuntu0.24.04.3' ;;
  arm64) version='1.13.3+ds1-2ubuntu0.24.04.3' ;;
  *) echo 'Skopeo installer requires Ubuntu 24.04 amd64 or arm64' >&2; exit 1 ;;
esac
sudo apt-get update
sudo apt-get install --yes --no-install-recommends "skopeo=$version"
