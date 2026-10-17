#!/bin/sh
set -eu

work=$(mktemp -d /tmp/expo-smoke.XXXXXX)
trap 'rm -rf "$work"' EXIT HUP INT TERM
cd "$work"

# Exercise the native dependency toolchain and JDK without downloading Gradle,
# Maven artifacts, app dependencies, or credentials.
python3 -c 'import sqlite3; db = sqlite3.connect(":memory:"); assert db.execute("select 1").fetchone() == (1,)'
printf '%s\n' 'int main(void) { return 0; }' > smoke.c
cc smoke.c -o smoke
./smoke
printf '%s\n' 'class Smoke { public static void main(String[] args) { if (Runtime.version().feature() != 17) throw new AssertionError(); } }' > Smoke.java
javac Smoke.java
java -cp . Smoke
jar --create --file smoke.jar Smoke.class
jar --list --file smoke.jar | rg '^Smoke.class$'

node /opt/expo-tools/smoke-browser.mjs

case "$(uname -m)" in
  x86_64)
    test "$ANDROID_HOME" = "$ANDROID_SDK_ROOT"
    test -r "$ANDROID_HOME/platforms/android-36/android.jar"
    test -r "$ANDROID_HOME/licenses/android-sdk-license"
    rg '^Pkg.Revision\s*=\s*27\.1\.12297006\s*$' "$ANDROID_HOME/ndk/27.1.12297006/source.properties"
    "$ANDROID_HOME/build-tools/36.0.0/aapt2" version
    "$ANDROID_HOME/cmake/3.22.1/bin/cmake" --version
    "$ANDROID_HOME/cmake/3.22.1/bin/ninja" --version
    "$ANDROID_HOME/ndk/27.1.12297006/toolchains/llvm/prebuilt/linux-x86_64/bin/aarch64-linux-android26-clang" -c smoke.c -o android-smoke.o
    test -s android-smoke.o
    ;;
  aarch64)
    test ! -e "$ANDROID_HOME/ndk"
    ;;
  *) echo 'Unsupported host architecture' >&2; exit 1 ;;
esac

printf 'Expo toolset checks passed\n'
