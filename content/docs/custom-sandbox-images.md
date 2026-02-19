---
title: "Custom Sandbox Images"
description: "Build and deploy custom Docker images for OpenClaw sandboxes — when setupCommand isn't enough or compromises security."
weight: 86
---

The default sandbox image (`openclaw-sandbox:bookworm-slim`) covers most use cases. This page explains when and how to build custom images, and why you should prefer them over `setupCommand` for production.

---

## Default Images

OpenClaw provides setup scripts that build three images locally. **These images are not pre-built or published to any registry** — the default sandbox image (`openclaw-sandbox:bookworm-slim`) starts as raw `debian:bookworm-slim` with no extra packages until you run the setup script.

{{< callout type="warning" >}}
**You must build the sandbox image before enabling Docker sandboxing.** Agents that try to use tools like `git`, `curl`, or `python3` inside an unbuilt sandbox will fail immediately (`sh: 1: git: not found`).
{{< /callout >}}

```bash
# From the openclaw package directory
cd $(npm root -g)/openclaw
./scripts/sandbox-setup.sh

# Verify
docker run --rm openclaw-sandbox:bookworm-slim git --version
```

| Image | Contents | Setup script |
|-------|----------|--------------|
| `openclaw-sandbox:bookworm-slim` | bash, curl, git, jq, python3, ripgrep, ca-certificates | `sandbox-setup.sh` |
| `openclaw-sandbox-common:bookworm-slim` | Above + Node.js, npm, pnpm, Bun, Go, Rust, build-essential, Homebrew | `sandbox-common-setup.sh` |
| `openclaw-sandbox-browser:bookworm-slim` | Chromium, xvfb, VNC/noVNC, websockify | `sandbox-browser-setup.sh` |

> **Note:** `sandbox-common` is available in the repo (`scripts/sandbox-common-setup.sh`) but not yet covered in the [official sandboxing docs](https://docs.openclaw.ai/gateway/sandboxing).

All images use `debian:bookworm-slim` base, run as non-root user `sandbox` (UID 1000), and default to `CMD ["sleep", "infinity"]`.

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

> **Version note (2026.2.16):** OpenClaw now rejects dangerous Docker sandbox configurations at startup — bind mounts to sensitive host paths, `--network host`, and unconfined seccomp/AppArmor profiles are blocked. This catches common misconfigurations before they weaken isolation.

### When setupCommand is fine

- **Prototyping** — fast iteration without rebuilding images
- **Non-security-critical agents** — agents that already need `network: "bridge"` anyway
- **Trivial setup** — commands that don't need network or root (e.g., creating directories)

> **Note:** Paths inside the container are relative to the sandbox root, not the host. Sandboxed agents see `/home/sandbox/workspace/` — not the host path configured in `workspace`. The gateway handles the mount mapping transparently.

### When to use a custom image instead

- **Production deployments** — maintain `network: "none"` + `readOnlyRoot: true`
- **Reproducibility** — no dependency on external package repos at startup
- **Startup latency** — packages are pre-installed, no download/install delay
- **Multi-machine deployments** — identical environment everywhere

---

## Ready-Made Example

This guide ships a fully worked example at `scripts/custom-sandbox/` — a standalone Dockerfile with:

| Tool | Version |
|------|---------|
| Base OS | Debian 13 (trixie) |
| Python | 3.13 (via multi-stage copy from `python:3.13-slim`) |
| pip | 25.x |
| uv | latest (Astral) |
| Node.js | 24 LTS |
| Deno | latest |
| Dart SDK | latest |
| GitHub CLI | latest |
| zsh | system |

```bash
cd scripts/custom-sandbox
./build.sh                          # builds openclaw-sandbox-custom:latest
./build.sh myorg/sandbox:v1         # custom tag
```

The build script auto-detects Apple Silicon and sets `--platform linux/amd64` (required for Deno, which has no official arm64 Linux binary).

{{< callout type="info" >}}
**Why Debian trixie?** Python 3.12+ requires glibc 2.38+, which is only available in Debian 13 (trixie). The official `python:3.13-slim` Docker image is trixie-based. If you need to stay on Debian 12 (bookworm), the maximum Python version you can run is 3.11 (the bookworm default).
{{< /callout >}}

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

Replicate the base image structure directly. Base image choice depends on which Python version you need:

| Base | glibc | Max Python |
|------|-------|------------|
| `debian:bookworm-slim` (Debian 12) | 2.36 | 3.11 |
| `debian:trixie-slim` (Debian 13) | 2.41 | 3.13+ |

```dockerfile
FROM debian:trixie-slim   # or bookworm-slim if you don't need Python 3.12+

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    bash ca-certificates curl git jq ripgrep \
    build-essential nodejs npm \
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

> **Deno constraint:** Deno has no official arm64 Linux binary. Images that include Deno must always be built and run as `linux/amd64`. On Apple Silicon, OrbStack and Docker Desktop run these via Rosetta transparently.

---

## Using Custom Images

### Per-agent

```json5
{
  "agents": {
    "list": [
      {
        "id": "main",
        "default": true,
        "sandbox": {
          "mode": "all",
          "scope": "agent",
          "workspaceAccess": "rw",
          "docker": {
            "image": "my-sandbox:latest",   // custom image
            "network": "openclaw-egress"    // ✅ egress-allowlisted network
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
openclaw sandbox recreate --agent main      # specific agent
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
