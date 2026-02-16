---
title: "Custom Sandbox Images"
description: "Build and deploy custom Docker images for OpenClaw sandboxes — when setupCommand isn't enough or compromises security."
weight: 86
---

The default sandbox image (`openclaw-sandbox:bookworm-slim`) covers most use cases. This page explains when and how to build custom images, and why you should prefer them over `setupCommand` for production.

---

## Default Images

OpenClaw ships three locally-built images (not published to any registry):

| Image | Contents | Use case |
|-------|----------|----------|
| `openclaw-sandbox:bookworm-slim` | bash, curl, git, jq, python3, ripgrep, ca-certificates | Default for all agents |
| `openclaw-sandbox-common:bookworm-slim` | Above + Node.js, npm, pnpm, Bun, Go, Rust, build-essential, Homebrew | Agents that need build tools |
| `openclaw-sandbox-browser:bookworm-slim` | Chromium, xvfb, VNC/noVNC, websockify | Browser automation |

> **Note:** `sandbox-common` is available in the repo (`scripts/sandbox-common-setup.sh`) but not yet covered in the [official sandboxing docs](https://docs.openclaw.ai/gateway/sandboxing).

All images use `debian:bookworm-slim` base, run as non-root user `sandbox` (UID 1000), and default to `CMD ["sleep", "infinity"]`.

Build any of them locally from the OpenClaw install directory:

```bash
# From the openclaw package directory
./scripts/sandbox-setup.sh           # → openclaw-sandbox:bookworm-slim
./scripts/sandbox-common-setup.sh    # → openclaw-sandbox-common:bookworm-slim
./scripts/sandbox-browser-setup.sh   # → openclaw-sandbox-browser:bookworm-slim
```

---

## setupCommand — Quick but Weakened Isolation

`setupCommand` runs a shell command once after container creation (via `sh -lc`). The container persists and is reused for subsequent sessions, so the command only runs once — until the container is recreated or pruned (24 h idle / 7 days old).

```json5
{
  "sandbox": {
    "docker": {
      "setupCommand": "apt-get update && apt-get install -y nodejs npm"
    }
  }
}
```

### The problem

The container runs with whatever security posture you configure — there is **no two-phase model** where setup runs privileged then drops to restricted mode. So if your `setupCommand` needs to install packages, you must weaken **both** secure defaults:

```json5
{
  "sandbox": {
    "docker": {
      "network": "bridge",      // default: "none" — blocks package downloads
      "readOnlyRoot": false,    // default: true — blocks apt writes
      "setupCommand": "apt-get update && apt-get install -y nodejs npm"
    }
  }
}
```

This means the container **permanently** runs with network access and a writable filesystem — exactly the isolation you're trying to achieve with Docker sandboxing.

### When setupCommand is fine

- **Prototyping** — fast iteration without rebuilding images
- **Non-security-critical agents** — agents that already need `network: "bridge"` anyway
- **Trivial setup** — commands that don't need network or root (e.g., creating directories)

### When to use a custom image instead

- **Production deployments** — maintain `network: "none"` + `readOnlyRoot: true`
- **Reproducibility** — no dependency on external package repos at startup
- **Startup latency** — packages are pre-installed, no download/install delay
- **Multi-machine deployments** — identical environment everywhere

---

## Building a Custom Image

### Option 1: Extend the official base

Build the base image first, then layer your tools on top:

```bash
./scripts/sandbox-setup.sh   # builds openclaw-sandbox:bookworm-slim
```

```dockerfile
FROM openclaw-sandbox:bookworm-slim

USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    build-essential nodejs npm python3-pip \
 && npm install -g pnpm \
 && rm -rf /var/lib/apt/lists/*

USER sandbox
```

```bash
docker build -t my-sandbox:latest -f Dockerfile.custom .
```

**Trade-off:** Your image depends on a locally-built base. You can't distribute it to other machines without also distributing or rebuilding the base there.

### Option 2: Standalone (no dependency on official base)

Replicate the base image structure directly:

```dockerfile
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    bash ca-certificates curl git jq python3 ripgrep \
    build-essential nodejs npm \
 && npm install -g pnpm \
 && rm -rf /var/lib/apt/lists/*

# OpenClaw expects non-root user "sandbox" (UID 1000)
RUN useradd --create-home --shell /bin/bash sandbox
USER sandbox
WORKDIR /home/sandbox

CMD ["sleep", "infinity"]
```

{{< callout type="warning" >}}
The `sandbox` user with UID 1000 is required. OpenClaw maps file permissions between host and container using this convention. Using a different user or running as root will break workspace mounts.
{{< /callout >}}

### Multi-architecture builds

If you build on Apple Silicon (arm64) but deploy to x86_64 Linux (or vice versa), specify the target platform explicitly:

```bash
docker build --platform linux/amd64 -t my-sandbox:latest .
```

For images used across both architectures, build a multi-arch manifest with `docker buildx`.

---

## Using Custom Images

### Per-agent

```json5
{
  "agents": {
    "list": [
      {
        "id": "computer",
        "sandbox": {
          "mode": "all",
          "scope": "agent",
          "workspaceAccess": "rw",
          "docker": {
            "image": "my-sandbox:latest",   // custom image
            "network": "none"               // ✅ secure defaults preserved
          }
        }
      }
    ]
  }
}
```

### Global default

```json5
{
  "agents": {
    "defaults": {
      "sandbox": {
        "docker": {
          "image": "my-sandbox:latest"
        }
      }
    }
  }
}
```

### After rebuilding an image

Force container recreation to pick up the new image:

```bash
openclaw sandbox recreate --all              # all containers
openclaw sandbox recreate --agent computer   # specific agent
openclaw sandbox recreate --all --force      # skip confirmation
```

---

## Multi-Machine Deployment

Official images are locally-built only — no public registry. For custom images you need your own distribution strategy.

### Private registry (recommended)

```bash
# Tag and push
docker tag my-sandbox:latest ghcr.io/myorg/openclaw-sandbox:latest
docker push ghcr.io/myorg/openclaw-sandbox:latest

# Reference in config
# "image": "ghcr.io/myorg/openclaw-sandbox:latest"
```

Works with GHCR, Docker Hub, ECR, or any OCI-compliant registry.

### Air-gapped (save/load)

```bash
# Export on build machine
docker save my-sandbox:latest | gzip > sandbox.tar.gz

# Import on target machine
docker load < sandbox.tar.gz
```

### Version pinning

For production, use image digests or explicit version tags instead of `:latest`:

```json5
"image": "ghcr.io/myorg/openclaw-sandbox:2026.2"
```

---

## Summary

| | `setupCommand` | Custom image |
|---|---|---|
| Security posture | Weakened (`network: bridge`, `readOnlyRoot: false`) | Full (`network: none`, `readOnlyRoot: true`) |
| Startup time | Slower (runtime package install) | Instant |
| Reproducibility | Fragile (depends on external repos) | Deterministic |
| Iteration speed | Fast (edit config → recreate) | Slower (rebuild image) |
| Best for | Prototyping | Production |
