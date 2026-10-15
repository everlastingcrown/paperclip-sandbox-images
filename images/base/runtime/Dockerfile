FROM --platform=$BUILDPLATFORM golang:1.27.2-bookworm@sha256:5cf287a799e6b94384bad13d16b14904c531f51ba65792237e122ce42b392f61 AS shim-build

ARG TARGETOS
ARG TARGETARCH
WORKDIR /src
COPY agent-shim/go.mod agent-shim/main.go agent-shim/runtime_command.go ./
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} GOPROXY=off GOTOOLCHAIN=local \
    go build -mod=readonly -trimpath -buildvcs=false -ldflags='-s -w' -o /out/paperclip-agent-shim .

FROM node:24.22.0-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS runtime

LABEL org.opencontainers.image.title="Paperclip sandbox base runtime" \
    org.opencontainers.image.description="Shared Node.js runtime and Paperclip agent shim for sandbox harnesses"

# Refresh distribution security fixes on rebuilds; intentionally track APT packages.
# hadolint ignore=DL3008
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends \
        bash ca-certificates coreutils curl git ripgrep tar tini \
    && rm -rf /var/lib/apt/lists/* \
    && groupmod --new-name paperclip node \
    && usermod --login paperclip --home /home/paperclip --move-home --shell /bin/bash node \
    && install -d -o 1000 -g 1000 /workspace /home/paperclip/.cache \
    && install -d -m 0755 /run/paperclip

# npm's bundled dependencies lag these security fixes. Keep versions/checksums
# together until the pinned Node image bundles fixed releases (CVE-2026-102276,
# CVE-2026-102278, CVE-2026-19534).
ARG NPM_BRACE_EXPANSION_VERSION=5.0.11
ARG NPM_BRACE_EXPANSION_SHA256=67bb5a1b4d4a8ff497d845a0b891ffe6b7233aea2202641315cec88d0fff15eb
ARG NPM_UNDICI_VERSION=6.28.1
ARG NPM_UNDICI_SHA256=e18191aac9c0ff43dac7fe9b10b7041a22d07addb7b66a6e8ac14a52a5b69b74
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

ENV HOME=/home/paperclip \
    XDG_CACHE_HOME=/home/paperclip/.cache \
    TMPDIR=/tmp

USER 1000:1000
WORKDIR /workspace
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/usr/local/bin/paperclip-agent-shim"]
