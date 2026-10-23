# hadolint ignore=DL3006
FROM paperclip-parent

LABEL org.opencontainers.image.title="Paperclip opencode harness" \
    org.opencontainers.image.description="Pinned opencode-ai CLI on the shared Paperclip sandbox runtime"

USER 0:0

# renovate: datasource=npm depName=opencode-ai
ARG OPENCODE_VERSION=1.19.0
RUN npm install --global --no-audit --no-fund "opencode-ai@${OPENCODE_VERSION}" \
    && npm cache clean --force

# Paperclip places the harness HOME inside the source worktree.
# Prevent snapshots from recursively capturing runtime data.
RUN install -d -m 0755 /etc/opencode \
    && printf '%s\n' '{"snapshot":false}' > /etc/opencode/opencode.json \
    && chmod 0644 /etc/opencode/opencode.json

USER 1000:1000

# Verify the native CLI and its optional platform package as the runtime user.
RUN opencode --version
