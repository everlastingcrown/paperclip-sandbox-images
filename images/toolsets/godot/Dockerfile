# hadolint ignore=DL3006
FROM paperclip-parent

LABEL org.opencontainers.image.title="Paperclip Godot toolset" \
    org.opencontainers.image.description="Godot headless development, web and desktop exports, and Chromium automation"

USER 0:0
ARG TARGETARCH
ARG TOOLSET_VERSION=1.0.0
ARG GODOT_VERSION=4.6.3
ARG GODOT_AMD64_SHA256=d0bc2113065e481c9c2c2b2c37daa4e8be3fe9e27f0ab9ab0b6096e9a37907f3
ARG GODOT_ARM64_SHA256=90c70382eee1542904bf507b9bdc6e62a230ac73fd214bf3887a9e0a4d85aeed
ARG GODOT_TEMPLATES_SHA256=3fbe2c0e2dec9d537ab9ec97bcf8da91dcf23357fc51f67092dd068d839290a8

ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers \
    PLAYWRIGHT_SKIP_BROWSER_GC=1 \
    NO_UPDATE_CHECK=1

# Track Debian security updates, as in the shared base.
# hadolint ignore=DL3008
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        unzip sqlite3 libfontconfig1 libx11-6 libxcursor1 libxinerama1 \
        libgl1 libegl1 libasound2 libxrandr2 libxi6 libgl1-mesa-dri \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/godot-tools
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
    && ln -s /opt/godot-tools/node_modules/.bin/playwright /usr/local/bin/playwright \
    && ln -s /opt/godot-tools/node_modules/.bin/serve /usr/local/bin/serve \
    && playwright install --with-deps chromium \
    && chmod -R a+rX /opt/playwright-browsers \
    && npm cache clean --force \
    && rm -rf /var/lib/apt/lists/*

COPY install-godot.sh ./
RUN sh ./install-godot.sh \
    && printf '%s\n' "${TOOLSET_VERSION}" > VERSION
COPY smoke.sh smoke-browser.mjs ./
COPY fixture ./fixture
COPY --chmod=0755 godot paperclip-godot /usr/local/bin/

# Root installers inherit the runtime HOME and may create root-owned XDG paths.
# Restore the entire user home before the non-root smoke check and runtime use.
RUN chown -R 1000:1000 /home/paperclip

USER 1000:1000
WORKDIR /workspace
RUN paperclip-godot check
