# hadolint ignore=DL3006
FROM paperclip-parent

LABEL org.opencontainers.image.title="Paperclip claude harness" \
    org.opencontainers.image.description="Pinned @anthropic-ai/claude-code CLI on the shared Paperclip sandbox runtime"

USER 0:0

# renovate: datasource=npm depName=@anthropic-ai/claude-code
ARG CLAUDE_VERSION=2.1.300
RUN npm install --global --no-audit --no-fund "@anthropic-ai/claude-code@${CLAUDE_VERSION}" \
    && ln -s "$(command -v claude)" /usr/local/bin/claude-code \
    && npm cache clean --force

USER 1000:1000

# Verify the native CLI and its optional platform package as the runtime user.
RUN claude-code --version
