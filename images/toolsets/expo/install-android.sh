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
yes | sdkmanager --sdk_root="$ANDROID_HOME" --licenses >/dev/null
sdkmanager --sdk_root="$ANDROID_HOME" --install \
  "platforms;android-${ANDROID_PLATFORM}" \
  "build-tools;${ANDROID_BUILD_TOOLS}" \
  "ndk;${ANDROID_NDK}" \
  "cmake;${ANDROID_CMAKE}"
chmod -R a+rX "$ANDROID_HOME"
rm -rf /root/.android /root/.cache
