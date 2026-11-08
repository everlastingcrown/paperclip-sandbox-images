FROM ghcr.io/everlastingcrown/paperclip-backport:sha-6b7a08a6889073135e2651de2295402e09f4d70f@sha256:02631216fd0bde3c5da71621f65b644c81374820fcdcf77f7f2c7188ab2ca284 AS runner-source

FROM node:24.22.0-trixie-slim@sha256:a6155384446670e9719bdc4fd0ebe4d4b29fb32a8d6aa523da3547a6cfbcf22c AS runner-assets
ARG TARGETARCH
WORKDIR /opt/paperclip-runner
COPY runner-release.json linux-x64-provider-pack.json linux-arm64-provider-pack.json verify-assets.mjs import-assets.mjs ./
COPY --from=runner-source /opt/paperclip-runner/provider-pack/ ./provider-pack/
# Require the vendored backport daemon and verify its revision and checksum.
RUN --mount=type=bind,from=runner-source,source=/app,target=/source \
    node import-assets.mjs /source "$TARGETARCH" \
    && node verify-assets.mjs /opt/paperclip-runner --record

FROM --platform=$BUILDPLATFORM golang:1.27.3-bookworm@sha256:21ade014faf952365b9ecbd8dbdb87176fbacb82fac9fb132d9f2a7b8cc3f132 AS shim-build

ARG TARGETOS
ARG TARGETARCH
WORKDIR /src
COPY agent-shim/go.mod agent-shim/main.go agent-shim/runtime_command.go ./
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} GOPROXY=off GOTOOLCHAIN=local \
    go build -mod=readonly -trimpath -buildvcs=false -ldflags='-s -w' -o /out/paperclip-agent-shim .

FROM node:24.22.0-trixie-slim@sha256:a6155384446670e9719bdc4fd0ebe4d4b29fb32a8d6aa523da3547a6cfbcf22c AS runtime

LABEL org.opencontainers.image.title="Paperclip sandbox base runtime" \
    org.opencontainers.image.description="Release-matched Paperclip Runner, provider CLIs, Node.js and Python runtime"

# Refresh distribution security fixes on rebuilds; intentionally track APT packages.
# hadolint ignore=DL3008
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends \
        bash ca-certificates coreutils curl gh git jq \
        python3 python-is-python3 python3-venv ripgrep tar tini \
    # Trixie uses the time64 OpenSSL package. Scans gate security updates.
    && dpkg-query -W libbrotli1 libssl3t64 openssl \
    && python3 -c 'import sys; assert sys.version_info[:2] == (3, 13)' \
    && rm -rf /var/lib/apt/lists/* \
    && groupmod --new-name paperclip node \
    && usermod --login paperclip --home /home/paperclip --move-home --shell /bin/bash node \
    && install -d -o 1000 -g 1000 /workspace /home/paperclip/.cache \
    && install -d -m 0755 /run/paperclip

# npm's bundled dependencies lag these security fixes. Keep versions/checksums
# together until the pinned Node image bundles fixed releases (CVE-2026-102276,
# CVE-2026-102278, CVE-2026-19534, CVE-2026-109869).
ARG NPM_BRACE_EXPANSION_VERSION=5.0.11
ARG NPM_BRACE_EXPANSION_SHA256=67bb5a1b4d4a8ff497d845a0b891ffe6b7233aea2202641315cec88d0fff15eb
ARG NPM_UNDICI_VERSION=6.29.1
ARG NPM_UNDICI_SHA256=29c4b8e0b2d86cb8795571c1959012ce057a14ecfd34858335f47c31e770a04f
RUN curl --fail --silent --show-error --location \
        "https://registry.npmjs.org/brace-expansion/-/brace-expansion-${NPM_BRACE_EXPANSION_VERSION}.tgz" \
        --output /tmp/brace-expansion.tgz \
    && curl --fail --silent --show-error --location \
        "https://registry.npmjs.org/undici/-/undici-${NPM_UNDICI_VERSION}.tgz" \
        --output /tmp/undici.tgz \
    && printf '%s  %s\n' \
        "${NPM_BRACE_EXPANSION_SHA256}" /tmp/brace-expansion.tgz \
        "${NPM_UNDICI_SHA256}" /tmp/undici.tgz > /tmp/npm-checksums \
    && sha256sum --check --strict /tmp/npm-checksums \
    && rm -rf /usr/local/lib/node_modules/npm/node_modules/brace-expansion \
        /usr/local/lib/node_modules/npm/node_modules/undici \
    && mkdir /usr/local/lib/node_modules/npm/node_modules/brace-expansion \
        /usr/local/lib/node_modules/npm/node_modules/undici \
    && tar -xzf /tmp/brace-expansion.tgz --strip-components=1 \
        -C /usr/local/lib/node_modules/npm/node_modules/brace-expansion \
    && tar -xzf /tmp/undici.tgz --strip-components=1 \
        -C /usr/local/lib/node_modules/npm/node_modules/undici \
    && rm /tmp/brace-expansion.tgz /tmp/undici.tgz /tmp/npm-checksums

COPY --from=shim-build --chmod=0755 /out/paperclip-agent-shim /usr/local/bin/paperclip-agent-shim
COPY agent-shim/LICENSE /usr/local/share/licenses/paperclip-agent-shim/LICENSE

COPY --from=runner-assets /opt/paperclip-runner/ /opt/paperclip-runner/
COPY --chmod=0755 cli-wrapper /usr/local/bin/codex
RUN cp /usr/local/bin/codex /usr/local/bin/claude \
    && cp /usr/local/bin/codex /usr/local/bin/opencode \
    && ln -s claude /usr/local/bin/claude-code \
    && ln -s /opt/paperclip-runner/bin/paperclip-runnerd /usr/local/bin/paperclip-runnerd \
    && install -d -m 0755 /etc/opencode \
    && printf '%s\n' '{"snapshot":false}' > /etc/opencode/opencode.json

ENV PAPERCLIP_RUNNER_REMOTE_PROVIDER_PACK_PATH=/opt/paperclip-runner/provider-pack \
    HOME=/home/paperclip \
    TMPDIR=/tmp

USER 1000:1000
WORKDIR /workspace
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/usr/local/bin/paperclip-agent-shim"]
