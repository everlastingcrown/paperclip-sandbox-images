#!/bin/sh
set -eu

# Google's Linux SDK/NDK host executables require x86-64. ARM64 retains the
# complete web toolset; do not install unusable host binaries there.
case "$TARGETARCH" in
  arm64) exit 0 ;;
  amd64) ;;
  *) echo "Unsupported architecture: $TARGETARCH" >&2; exit 1 ;;
esac

curl --fail --silent --show-error --location \
  "https://dl.google.com/android/repository/commandlinetools-linux-${ANDROID_COMMANDLINE_BUILD}_latest.zip" \
  --output /tmp/android-commandline.zip
printf '%s  %s\n' "$ANDROID_COMMANDLINE_SHA256" /tmp/android-commandline.zip \
  | sha256sum --check --strict
mkdir -p "$ANDROID_HOME/cmdline-tools"
unzip -q /tmp/android-commandline.zip -d "$ANDROID_HOME/cmdline-tools"
mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/19.0"
rm /tmp/android-commandline.zip

# This pipeline intentionally uses POSIX sh: sdkmanager's status is decisive,
# including when yes exits on a closed pipe after the last license prompt.
sdkmanager="$ANDROID_HOME/cmdline-tools/19.0/bin/sdkmanager"
yes | "$sdkmanager" --sdk_root="$ANDROID_HOME" --licenses >/dev/null
"$sdkmanager" --sdk_root="$ANDROID_HOME" --install \
  "platforms;android-${ANDROID_PLATFORM}" \
  "build-tools;${ANDROID_BUILD_TOOLS}" \
  "ndk;${ANDROID_NDK}" \
  "cmake;${ANDROID_CMAKE}"

# The installer includes vulnerable Java libraries. It is build-only: the fixed
# SDK is read-only at runtime and Gradle uses the installed packages directly.
rm -rf "$ANDROID_HOME/cmdline-tools"

# NDK r27b bundles setuptools 65.5.0 (CVE-2022-40897, CVE-2024-6345,
# CVE-2025-47273). Replace the package, not just its version metadata.
curl --fail --silent --show-error --location "$NDK_SETUPTOOLS_URL" \
  --output "/tmp/setuptools-${NDK_SETUPTOOLS_VERSION}-py3-none-any.whl"
printf '%s  %s\n' "$NDK_SETUPTOOLS_SHA256" "/tmp/setuptools-${NDK_SETUPTOOLS_VERSION}-py3-none-any.whl" \
  | sha256sum --check --strict
ndk_python="$ANDROID_HOME/ndk/$ANDROID_NDK/toolchains/llvm/prebuilt/linux-x86_64/python3/bin/python3"
"$ndk_python" -m pip install --no-index --no-deps --no-cache-dir \
  "/tmp/setuptools-${NDK_SETUPTOOLS_VERSION}-py3-none-any.whl"
"$ndk_python" -c "import setuptools; assert setuptools.__version__ == '$NDK_SETUPTOOLS_VERSION'"
rm "/tmp/setuptools-${NDK_SETUPTOOLS_VERSION}-py3-none-any.whl"
chmod -R a+rX "$ANDROID_HOME"
rm -rf /root/.android /root/.cache
