# hadolint ignore=DL3006
FROM paperclip-parent

LABEL org.opencontainers.image.title="Paperclip codex harness" \
    org.opencontainers.image.description="Pinned @openai/codex CLI on the shared Paperclip sandbox runtime"

USER 0:0

# renovate: datasource=npm depName=@openai/codex
ARG CODEX_VERSION=0.162.1
RUN npm install --global --no-audit --no-fund "@openai/codex@${CODEX_VERSION}" \
    && npm cache clean --force

USER 1000:1000

# Verify the native CLI and its optional platform package as the runtime user.
RUN codex --version
