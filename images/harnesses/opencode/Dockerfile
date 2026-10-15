# hadolint ignore=DL3006
FROM paperclip-parent

LABEL org.opencontainers.image.title="Paperclip opencode harness" \
    org.opencontainers.image.description="Pinned opencode-ai CLI on the shared Paperclip sandbox runtime"

USER 0:0

# renovate: datasource=npm depName=opencode-ai
ARG OPENCODE_VERSION=1.19.0
RUN npm install --global --no-audit --no-fund "opencode-ai@${OPENCODE_VERSION}" \
    && npm cache clean --force

USER 1000:1000

# Verify the native CLI and its optional platform package as the runtime user.
RUN opencode --version
