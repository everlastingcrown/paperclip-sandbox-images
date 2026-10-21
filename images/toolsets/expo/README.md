# Expo toolset 1.0.0

The Expo toolset supplies the same tools for Expo web development and Android builds over either harness, using the shared `Dockerfile` and `base-1` runtime. The catalog registers these variants under the configured registry namespace:

| Catalog ID        | Parent            | Version tag                                   |
| ----------------- | ----------------- | --------------------------------------------- |
| `expo-1-codex`    | `codex-0-162-1`   | `sandbox-expo-codex:1.0.0-codex-0.162.1`      |
| `expo-1-opencode` | `opencode-1-19-0` | `sandbox-expo-opencode:1.0.0-opencode-1.19.0` |

The images supply shared development tools; project source, dependencies, caches, and credentials are provided at runtime.

| Included tools                                                      | AMD64 | ARM64 |
| ------------------------------------------------------------------- | ----- | ----- |
| Node.js 24/npm                                                      | Yes   | Yes   |
| Playwright 1.61.0 Chromium and static server `serve` 14.2.6         | Yes   | Yes   |
| Java 17, Python 3, C/C++ host compiler and Make                     | Yes   | Yes   |
| Android SDK 36, Build Tools 36.0.0, NDK 27.1.12297006, CMake 3.22.1 | Yes   | No    |

Expo CLI, React Native, TypeScript, and test frameworks come from each project's dependencies. Choose projects compatible with the tool versions above; the bundle does not select or upgrade a project's Expo SDK version. Keep the project's Playwright version at 1.61.0 to match the baked Chromium revision. Different Android SDK/NDK requirements or Playwright browser revisions require a corresponding toolset update.

Google's Linux NDK host toolchain uses `linux-x86_64` binaries. Use an AMD64 worker for Android builds and Gradle Android native checks; the ARM64 image supports web development and browser tests. Android command-line tools 19.0 use the fixed build-13114758 URL and a verified SHA-256. SDK Manager installs the explicitly versioned packages and accepts their licenses during image construction, then is removed with its Java libraries. The runtime contains the fixed SDK packages without the installer. Use each project's Gradle wrapper rather than a global Gradle installation.

Debian packages track distribution security updates, as in the base image. The tools lockfile overrides `serve`'s `compression` dependency to patched version 1.8.2 ([GHSA-vc2v-76pw-4v95](https://github.com/advisories/GHSA-vc2v-76pw-4v95)).

The NDK's bundled Python replaces its vulnerable setuptools 65.5.0 with [setuptools 80.10.2](https://pypi.org/project/setuptools/80.10.2/) from a checksum-pinned wheel. Keep its version, URL, and SHA-256 together in the Dockerfile and catalog when updating.

Android/iOS emulators, simulator images, and iOS device builds are excluded. Apple SDK-dependent native tests require a separate macOS environment. Android builds can produce APK/AAB files without a device; `npx expo run:android` also tries to install/run the app and therefore needs an external device. Release signing and store upload credentials must be supplied separately.

## Working in the sandbox

Check out or mount an Expo project at `/workspace`, then install its dependencies as the ordinary `paperclip` user. For projects with an npm lockfile:

```sh
npm ci --include=dev
npx expo start --web --host lan --port 8081
```

Expose port 8081 through the sandbox provider to access the development server. `JAVA_HOME`, `ANDROID_HOME`, `ANDROID_SDK_ROOT`, and tool PATHs are ready without shell startup scripts. The SDK and shared Chromium installation live under `/opt`, so mounting a fresh home/cache does not hide them. Keep `/workspace`, `/home/paperclip`, and `/tmp` writable as in the runtime contract.

For a project configured with TypeScript and Playwright, run its checks separately from the development server:

```sh
npx tsc --noEmit
npx expo export --platform web
CI=1 npx playwright test --project chromium

# AMD64 only: generate Android sources and build without deploying to a device.
npx expo prebuild --platform android
cd android
./gradlew assembleDebug --no-daemon
./gradlew testDebugUnitTest --no-daemon
```

Playwright needs a project configuration that starts or connects to the project's web server and defines a Chromium project. The bundled `serve` command can serve an exported `dist` directory. Use the project's own lint and unit-test commands when available.

Prebuild modifies the project's native Android directory; review generated changes. Project dependencies, Gradle distributions, Maven artifacts, and any project-specific asset downloads need network access on first use. They are installed for the checked-out project rather than baked into this image. Do not run browser installation into the read-only shared `/opt` directory at runtime.

## Validation

`paperclip-expo --version` reports the bundle release. `paperclip-expo check` compiles a host C object, compiles/runs a Java 17 class, exercises Python SQLite, serves a local page, launches Chromium, clicks its UI, and captures a screenshot. Generated native binaries are not executed because runtime tmpfs mounts are `noexec`. On AMD64 it also checks the SDK platform/license, runs AAPT2/CMake/Ninja, and compiles an Android ARM64 object with the NDK. The catalog repeats these checks offline under the restricted runtime contract and inherits the selected harness's smoke check. Full project tests require a checkout and its dependencies.

To build the entire chain without relying on previously published parents:

```sh
pnpm images plan --select base-1
pnpm images build --platform linux/amd64
pnpm images test --platform linux/amd64
```

Repeat the build/test commands on a native ARM64 worker. Selecting `base-1` also includes the other active harness descendants. To build just this toolset against an already published parent, use `pnpm images plan --select expo-1-codex --resolve` or `pnpm images plan --select expo-1-opencode --resolve` instead. Both architecture tests and scans must pass before publication.

Sources: [Android SDK Manager](https://developer.android.com/tools/sdkmanager), [Google SDK package metadata](https://dl.google.com/android/repository/repository2-1.xml), [NDK downloads](https://developer.android.com/ndk/downloads), and [Playwright shared browser installation](https://playwright.dev/docs/browsers#managing-browser-binaries).
