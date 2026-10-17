# hadolint ignore=DL3006
FROM paperclip-parent

LABEL org.opencontainers.image.title="Paperclip Expo toolset" \
    org.opencontainers.image.description="Expo web development, Playwright Chromium, and AMD64 Android builds for Expo projects"

USER 0:0

ARG TARGETARCH
ARG TOOLSET_VERSION=1.0.0
ARG ANDROID_COMMANDLINE_BUILD=13114758
ARG ANDROID_COMMANDLINE_SHA256=7ec965280a073311c339e571cd5de778b9975026cfcbe79f2b1cdcb1e15317ee
ARG ANDROID_PLATFORM=36
ARG ANDROID_BUILD_TOOLS=36.0.0
ARG ANDROID_NDK=27.1.12297006
ARG ANDROID_CMAKE=3.22.1
ARG NDK_SETUPTOOLS_VERSION=78.1.1
ARG NDK_SETUPTOOLS_SHA256=c3a9c4211ff4c309edb8b8c4f1cbfa7ae324c4ba9f91ff254e3d305b9fd54561
ARG NDK_SETUPTOOLS_URL=https://files.pythonhosted.org/packages/90/99/158ad0609729111163fc1f674a5a42f2605371a4cf036d0441070e2f7455/setuptools-78.1.1-py3-none-any.whl

ENV JAVA_HOME=/opt/java17 \
    ANDROID_HOME=/opt/android-sdk \
    ANDROID_SDK_ROOT=/opt/android-sdk \
    PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers \
    PLAYWRIGHT_SKIP_BROWSER_GC=1 \
    NO_UPDATE_CHECK=1
ENV PATH="/opt/java17/bin:/opt/android-sdk/cmake/3.22.1/bin:${PATH}"

# Track Debian security updates for distribution packages, as the base does.
# hadolint ignore=DL3008
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential openjdk-17-jdk-headless python3 unzip zip \
    && ln -s "/usr/lib/jvm/java-17-openjdk-$(dpkg --print-architecture)" /opt/java17 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/expo-tools
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
    && ln -s /opt/expo-tools/node_modules/.bin/playwright /usr/local/bin/playwright \
    && ln -s /opt/expo-tools/node_modules/.bin/serve /usr/local/bin/serve \
    && playwright install --with-deps chromium \
    && chmod -R a+rX /opt/playwright-browsers \
    && npm cache clean --force \
    && rm -rf /var/lib/apt/lists/*

COPY install-android.sh smoke.sh smoke-browser.mjs ./
RUN sh ./install-android.sh \
    && printf '%s\n' "${TOOLSET_VERSION}" > VERSION
COPY --chmod=0755 paperclip-expo /usr/local/bin/paperclip-expo

USER 1000:1000
WORKDIR /workspace

# Run again through the catalog under read-only, offline runtime restrictions.
RUN paperclip-expo check
