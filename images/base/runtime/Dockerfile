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

COPY --from=shim-build --chmod=0755 /out/paperclip-agent-shim /usr/local/bin/paperclip-agent-shim
COPY agent-shim/LICENSE /usr/local/share/licenses/paperclip-agent-shim/LICENSE

ENV HOME=/home/paperclip \
    XDG_CACHE_HOME=/home/paperclip/.cache \
    TMPDIR=/tmp

USER 1000:1000
WORKDIR /workspace
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/usr/local/bin/paperclip-agent-shim"]
