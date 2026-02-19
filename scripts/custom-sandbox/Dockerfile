# syntax=docker/dockerfile:1

# ── Python 3.13 source (python:3.13-slim is debian:trixie-slim, glibc 2.41)
FROM python:3.13-slim@sha256:3de9a8d7aedbb7984dc18f2dff178a7850f16c1ae7c34ba9d7ecc23d0755e35f AS python313

FROM debian:trixie-slim

# ── Environment ──────────────────────────────────────────────────────────────
ENV DEBIAN_FRONTEND=noninteractive \
    LANG=en_US.UTF-8 \
    LC_ALL=en_US.UTF-8 \
    TERM=xterm-256color

# ── Base system + locale ─────────────────────────────────────────────────────
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      bash \
      ca-certificates \
      curl \
      git \
      gnupg \
      jq \
      locales \
      ripgrep \
      wget \
      zsh \
 && echo "en_US.UTF-8 UTF-8" > /etc/locale.gen \
 && locale-gen \
 && rm -rf /var/lib/apt/lists/*

# ── GitHub CLI ───────────────────────────────────────────────────────────────
RUN mkdir -p /etc/apt/keyrings \
 && wget -qO /etc/apt/keyrings/githubcli-archive-keyring.gpg \
      https://cli.github.com/packages/githubcli-archive-keyring.gpg \
 && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends gh \
 && rm -rf /var/lib/apt/lists/*

# ── Node.js 24 LTS + npm ─────────────────────────────────────────────────────
# Note: setup_lts.x still resolves to 22.x — use setup_24.x explicitly
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

# ── Dart SDK ─────────────────────────────────────────────────────────────────
RUN wget -qO- https://dl-ssl.google.com/linux/linux_signing_key.pub \
      | gpg --dearmor -o /usr/share/keyrings/dart.gpg \
 && echo "deb [signed-by=/usr/share/keyrings/dart.gpg arch=$(dpkg --print-architecture)] https://storage.googleapis.com/download.dartlang.org/linux/debian stable main" \
      > /etc/apt/sources.list.d/dart_stable.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends dart \
 && rm -rf /var/lib/apt/lists/*

# ── uv + uvx (Astral) ────────────────────────────────────────────────────────
# Multi-arch (amd64 + arm64). On Bookworm, prefer uv over pip — PEP 668
# blocks system pip installs without --break-system-packages.
COPY --from=ghcr.io/astral-sh/uv:0.10.4@sha256:4cac394b6b72846f8a85a7a0e577c6d61d4e17fe2ccee65d9451a8b3c9efb4ac /uv /uvx /usr/local/bin/

# ── Python 3.13 (copied from official image — no runtime download needed) ─────
COPY --from=python313 /usr/local/bin/python3.13 /usr/local/bin/python3.13
COPY --from=python313 /usr/local/lib/python3.13 /usr/local/lib/python3.13
COPY --from=python313 /usr/local/lib/libpython3.13.so.1.0 /usr/local/lib/libpython3.13.so.1.0
COPY --from=python313 /usr/local/bin/pip3 /usr/local/bin/pip3
COPY --from=python313 /usr/local/bin/pip3.13 /usr/local/bin/pip3.13
RUN ldconfig \
 && ln -sf /usr/local/bin/python3.13 /usr/local/bin/python3 \
 && ln -sf /usr/local/bin/python3 /usr/local/bin/python \
 && ln -sf /usr/local/bin/pip3 /usr/local/bin/pip

# ── Deno ─────────────────────────────────────────────────────────────────────
# amd64 only — Deno has no official arm64 Linux binary.
# Build with --platform linux/amd64 on Apple Silicon (see build.sh).
COPY --from=denoland/deno:bin-2.6.10@sha256:a947d7ea218d4b1cce3d17366d9ef2de96e20e0e54080025f5a8be70c9c020ee /deno /usr/local/bin/deno

# ── PATH: Dart binaries + standard dirs (system-wide, all users) ─────────────
ENV PATH=/usr/lib/dart/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin

# ── Sandbox user (OpenClaw requires non-root "sandbox", UID 1000) ────────────
RUN useradd --create-home --shell /usr/bin/zsh sandbox

USER sandbox
WORKDIR /home/sandbox

# ── User PATH: ~/.local/bin (uv tools) + ~/.pub-cache/bin (dart pub global) ──
ENV PATH=/home/sandbox/.local/bin:/home/sandbox/.pub-cache/bin:/usr/lib/dart/bin:/usr/local/bin:/usr/bin:/bin

# ── Minimal zsh config ───────────────────────────────────────────────────────
RUN printf '%s\n' \
      'export PATH="$HOME/.local/bin:$HOME/.pub-cache/bin:/usr/lib/dart/bin:/usr/local/bin:$PATH"' \
      '# Suppress compinit warnings in non-interactive containers' \
      'skip_global_compinit=1' \
    > ~/.zshrc \
 && mkdir -p ~/.local/bin ~/.pub-cache/bin

CMD ["sleep", "infinity"]
