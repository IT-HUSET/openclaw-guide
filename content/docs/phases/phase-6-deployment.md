---
title: "Phase 6 — Deployment"
description: "Deployment methods, isolation models, LaunchDaemon/systemd, secrets, firewall, Tailscale, Signal."
weight: 60
---

Run OpenClaw as a system service that starts at boot, survives reboots, and is locked down at the network level. Assumes [Phase 3 security baseline](phase-3-security.md) complete.

- **Coming from Phase 1 quick start?** Each isolation model section below covers migrating your existing config to the dedicated user/VM — stop the personal gateway first, then follow the migration steps in your chosen section.
- **Fresh dedicated machine?** Each section installs OpenClaw from scratch in the right place — no prior installation needed.

**Choose your deployment method and skip the others** — each section is self-contained:
- [Docker Containerized](#docker-containerized-gateway) — official Docker setup, simplest path
- [Docker Isolation](#docker-isolation) *(recommended)* — macOS or Linux, dedicated OS user with Docker sandboxing
- [VM: macOS VMs](#vm-isolation-macos-vms) — macOS hosts, stronger host isolation, no Docker inside
- [VM: Linux VMs](#vm-isolation-linux-vms) — any host, strongest combined (VM + Docker)

**Shared sections** (apply to all methods): [Secrets Management](#secrets-management-all-methods) (read first) | [Firewall](#macos-firewall) | [Tailscale ACLs](#tailscale-acls) | [Signal Setup](#signal-setup) | [Verification](#verification-checklist) | [Emergency](#emergency-procedures)

### Deployment Methods Overview

| Method | Isolation | Sandboxing | Best for |
|--------|-----------|-----------|----------|
| **Docker Containerized** | Container boundary | Docker (gateway runs inside container) | VPS, cloud, fastest path |
| **Docker Isolation** *(recommended)* | OS user boundary | Docker (per-agent sandboxing) | Dedicated hardware, full control |
| **VM: macOS VMs** | Kernel-level VM | Tool policy only (no Docker) | macOS hosts, strongest host isolation |
| **VM: Linux VMs** | Kernel-level VM | Docker inside VM | Any host, strongest combined |

### Hosting Options

- **Local/dedicated hardware** (Mac Mini, NUC, etc.) — this guide's primary focus
- **Cloud VPS** (Hetzner, DigitalOcean, Linode) — use Docker Containerized or Linux VM method
- **GCP/AWS/Azure** — works with any small VM; use Docker Containerized for simplest setup
- **Hosted Mac** (MacStadium, AWS EC2 Mac) — use macOS VM or Docker Isolation method

---

## Decision: Foreground vs Service

| | Foreground (`openclaw start`) | System service |
|--|-------------------------------|----------------|
| Starts at boot | No | Yes |
| Survives logout | No | Yes |
| Log management | Terminal | Log files |
| Best for | Development, testing | Production |

For anything beyond testing, run as a system service.

---

## Deployment: Choose Your Method

Before setting up the service, choose your deployment method. See [Security: Deployment Isolation Options](phase-3-security.md#deployment-isolation-options) for the full trade-off analysis of the isolation models.

- **Docker Containerized** — official `docker-setup.sh`, gateway runs inside a Docker container. Simplest path.
- **Docker Isolation** *(recommended)* — multi-agent gateway as `openclaw` user with Docker sandboxing. macOS or Linux.
- **VM: macOS VMs** (Lume / Parallels) — single macOS VM, multi-agent gateway, no Docker inside VM. macOS hosts only.
- **VM: Linux VMs** (Multipass / KVM / UTM) — Linux VM with Docker inside. Strongest combined posture (VM boundary + Docker sandbox). macOS or Linux hosts.

The isolation models (Docker Isolation, macOS VMs, Linux VMs) all use the same multi-agent architecture with `sessions_send` delegation. They differ in the outer boundary and internal sandboxing:
- **Docker Isolation:** OS user boundary + Docker sandbox. LaunchDaemon/systemd on host.
- **VM: macOS VMs:** Kernel-level VM boundary + standard user (no sudo). LaunchDaemon inside VM. No Docker.
- **VM: Linux VMs:** Kernel-level VM boundary + Docker sandbox inside VM. systemd inside VM.

---

## Secrets Management (All Methods)

Keep `openclaw.json` secrets-free — use `${ENV_VAR}` references in config, store actual values in the service plist (macOS) or environment file (Linux). This applies to all deployment methods.

**Choose your secrets method:**
- **Docker isolation (macOS)** → LaunchDaemon `EnvironmentVariables` block
- **Docker isolation (Linux)** → `/etc/openclaw/secrets.env` file
- **VM: macOS/Linux** → SSH-load secrets before gateway start

### Secrets to externalize

| Secret | Env var | Notes |
|--------|---------|-------|
| Gateway token | `OPENCLAW_GATEWAY_TOKEN` | Included in all plist/systemd examples below |
| Anthropic API key | `ANTHROPIC_API_KEY` | SDK reads from env directly |
| Brave search key | `BRAVE_API_KEY` | Referenced as `${BRAVE_API_KEY}` in config |
| OpenRouter key | `OPENROUTER_API_KEY` | If using Perplexity via OpenRouter |
| GitHub token | `GITHUB_TOKEN` | Fine-grained PAT — see [GitHub token setup](#github-token-setup) below |
| *(web-guard & channel-guard use local ONNX models — no API keys needed)* | | See [plugin setup](phase-5-web-search.md#advanced-prompt-injection-guard) |

> **Empty env vars cause startup failure.** If a `${VAR}` reference resolves to an empty string, the gateway exits with `EX_CONFIG` (exit 78). For optional keys not yet provisioned (e.g., `BRAVE_API_KEY` when using Perplexity instead), use a non-empty placeholder like `"not-configured"` rather than leaving the variable empty or unset.
>
> **Version note (2026.2.16):** Telegram bot tokens are now auto-redacted from gateway logs (same mechanism as `redactSensitive: "tools"` for other secrets).

### GitHub token setup

Use a **fine-grained personal access token** (not a classic token). Fine-grained PATs let you scope access to specific repositories with minimal permissions.

1. Go to **[github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new)**
2. **Token name:** e.g., `openclaw-workspace-sync`
3. **Expiration:** set a reasonable expiry (e.g., 90 days) and create a reminder to rotate
4. **Repository access:** select **"Only select repositories"** → pick only your workspace repos
5. **Permissions:**

   | Permission | Access | Why |
   |------------|--------|-----|
   | Contents | Read and write | Push/pull workspace commits |
   | Metadata | Read | Automatically selected (read-only) |

   No other permissions needed. Do **not** grant "All repositories" access.

6. Click **Generate token** — the value starts with `github_pat_`

Set the token in your LaunchDaemon plist (macOS) or environment file (Linux) as `GITHUB_TOKEN`. The `gh` CLI and `git push`/`pull` over HTTPS both read from this env var.

> **Rotation:** When the token expires, generate a new one with the same settings and update the plist/env file. Restart the gateway to pick up the new value.

### Config references

In `openclaw.json`, reference secrets with `${...}` — OpenClaw substitutes at startup:

```json
{
  "tools": {
    "web": { "search": { "apiKey": "${BRAVE_API_KEY}" } }
  },
  "gateway": {
    "auth": { "token": "${OPENCLAW_GATEWAY_TOKEN}" }
  }
}
```

Result: `openclaw.json` contains zero plaintext secrets — safe to copy between VMs, diff, or version-control.

---

## Docker Containerized Gateway

> **Simplest path.** The official Docker setup runs the entire gateway inside a container with persistence, auto-restart, and basic security. No per-agent sandboxing — all agents share the container.

**When to use:** Cloud VPS, quick evaluation on any Docker-capable host, or when per-agent Docker sandboxing isn't needed.

**Quick start:**

```bash
curl -fsSL https://openclaw.ai/docker-setup.sh | bash
```

> For production, review the script before piping to shell, or download and inspect first: `curl -fsSL https://openclaw.ai/docker-setup.sh -o docker-setup.sh && less docker-setup.sh && bash docker-setup.sh`

This creates a Docker Compose setup with:
- Persistent data volume (survives container restarts)
- Auto-restart on crash (`restart: unless-stopped`)
- Loopback binding (not exposed to network by default)
- Environment variable passthrough for secrets

**What it doesn't provide** (compared to Docker Isolation below):
- No dedicated OS user — the container runs as whatever user Docker assigns
- No per-agent sandboxing — all agents share the same container filesystem and network
- No LaunchDaemon/systemd integration — relies on Docker's restart policy

For production deployments on dedicated hardware where you want per-agent isolation and OS-level service management, use Docker Isolation below instead.

> **Official docs:** See [docs.openclaw.ai](https://docs.openclaw.ai) for the latest Docker setup instructions and options.

---

## Docker Isolation

> **Recommended approach.** Works on both macOS and Linux. Single gateway, multi-agent, Docker sandboxing for internal isolation.
>
> **Automated setup:** For a fresh dedicated macOS machine, see [`scripts/docker-isolation/`](https://github.com/IT-HUSET/openclaw-guide/tree/main/scripts/docker-isolation/) — three scripts that automate everything below.

### Installation Scope

The OpenClaw installer (`curl ... | bash`) runs `npm install -g openclaw`, placing files in the global npm prefix. On a service deployment, global install is preferred:

- **Global install (recommended):** Admin installs OpenClaw once. The `openclaw` user — in the `staff` group by default on macOS — can run `/opt/homebrew/bin/openclaw` without its own Node.js install. The LaunchDaemon plist references these paths directly.
- **Per-user install:** Alternative if you can't modify global packages. Requires updating `ProgramArguments` in the plist to point at the user's local npm prefix (e.g., `/Users/openclaw/.npm-global/...`).

On Linux, global install places the binary at `/usr/local/bin/openclaw` — accessible to all users by default.

> **Warning:** On macOS, the `staff` group has **write** access to `/opt/homebrew` by default. Any user in `staff` (including the `openclaw` user) can modify binaries there — a compromised `openclaw` user could trojan `/opt/homebrew/bin/node`, affecting all users who run it. Mitigations: (1) `sudo chown root:wheel /opt/homebrew/bin/node` to remove group write (re-apply after `brew upgrade`), or (2) install Node.js per-user via [nvm](https://github.com/nvm-sh/nvm) so each user runs their own copy. This is lower risk for single-user deployments where only the `openclaw` user runs Node.js.

### Dedicated OS User

If you haven't already (from [Phase 3](phase-3-security.md)), create a dedicated non-admin user:

> **VM isolation:** Skip this section — you'll create a dedicated user inside the VM instead. macOS VMs: see [Dedicated user (inside VM)](#dedicated-user-inside-vm). Linux VMs: see [Dedicated user (inside Linux VM)](#dedicated-user-inside-linux-vm).

**macOS:**
```bash
sudo sysadminctl -addUser openclaw -fullName "OpenClaw" -password "<temp>" \
  -home /Users/openclaw -shell /bin/zsh
sudo passwd openclaw

# Create home directory if not auto-created
sudo mkdir -p /Users/openclaw
sudo chown -R openclaw:staff /Users/openclaw
```

The user is automatically in the `staff` group, which gives read access to `/opt/homebrew` (where Node.js and OpenClaw are installed). No admin group membership needed.

**Linux:**
```bash
sudo useradd -m -s /bin/bash openclaw
sudo passwd openclaw
```

> **Mixed-use machine (personal data on host)?** Creating a dedicated `openclaw` user doesn't automatically protect your personal files. Lock down your admin home directory:
> ```bash
> chmod 700 /Users/youradmin    # macOS — replace with your username
> chmod 700 /home/youradmin     # Linux
> ```
> Without this, the `openclaw` user may be able to read world-readable files in your home directory (macOS doesn't always default home directories to `700`). Also be aware of residual multi-user exposure that no permission change fixes:
> - **Process listings** — `ps aux` shows all users' processes and command-line arguments. Never run commands with secrets in arguments (e.g., `curl -H "Authorization: Bearer sk-..."`)
> - **Shared temp directories** — `/tmp` and `/var/tmp` are accessible by all users
> - **Mounted volumes** — external drives and NAS mounts are typically world-readable
>
> These are standard multi-user OS risks, not OpenClaw-specific. On a **dedicated machine** with no personal data, these are non-issues — see the [dedicated machine note](phase-3-security.md#comparison).

#### Docker Group Membership

The `openclaw` user needs access to the Docker socket for agent sandboxing:

**macOS:**
```bash
sudo dseditgroup -o edit -a openclaw -t user docker
```

**Linux:**
```bash
sudo usermod -aG docker openclaw
```

> **Security note:** On **Linux**, the `docker` group grants effective root access on the host via the Docker socket. For bare Linux deployments, this is an accepted risk — see the warning at [Linux VM isolation](#vm-isolation-linux-vms). The dedicated machine posture or VM boundary contains this risk. On **macOS**, Docker Desktop manages access through its own application model — the `docker` group controls CLI access but doesn't grant the same host-level root equivalent.

**Verify access:**
```bash
sudo -u openclaw docker ps
```

This should list running containers (or show an empty list if none running) without errors. If you see "permission denied", the group membership hasn't taken effect — log out and back in, or restart the daemon.

#### Install OpenClaw

If OpenClaw is already installed globally (e.g., via Homebrew or by the admin user), skip the install and verify the `openclaw` user can access it:

```bash
sudo -u openclaw openclaw --version
sudo -u openclaw openclaw doctor
```

{{< callout type="info" >}}
**Two `sudo -u openclaw` patterns:**
- Bare form: `sudo -u openclaw <cmd>` — for simple commands
- `bash -c` form: `sudo -u openclaw bash -c 'cd ... && HOME=... <cmd>'` — when command requires specific working directory or HOME
{{< /callout >}}

Otherwise, install as the `openclaw` user:

```bash
sudo -u openclaw bash -c 'curl -fsSL https://openclaw.ai/install.sh | bash'
sudo -u openclaw openclaw --version
sudo -u openclaw openclaw doctor
```

> Download and review the script before running, or verify the source URL.

Then either migrate from your personal user (below) or create a fresh config:

```bash
# Fresh install (skip if migrating)
sudo -u openclaw openclaw setup
```

> **Do not use `openclaw onboard --install-daemon`** — that installs a user-level LaunchAgent (label `bot.molt.gateway`), not the system-level LaunchDaemon we configure below. Similarly, `openclaw gateway install` creates a user-level service. We use manual plists for system-level control under a dedicated user.
>
> The `ProgramArguments` in the LaunchDaemon plist must match where OpenClaw is actually installed. The "Verify paths" step before creating the plist covers this.

#### Required config: `gateway.mode`

The gateway refuses to start unless `gateway.mode` is set in `openclaw.json`. Add this to the config (via `openclaw setup` or manually):

```json
{
  "gateway": {
    "mode": "local"
  }
}
```

Without this, the gateway exits immediately. Run `openclaw doctor` to diagnose startup failures — it checks config validity, API key availability, Docker access, and file permissions. Fix any issues it reports before proceeding.

#### Move OpenClaw data

If you were running as your own user, move the data instead of running `openclaw setup`:

```bash
sudo cp -r ~/.openclaw /Users/openclaw/.openclaw
sudo chown -R openclaw:staff /Users/openclaw/.openclaw
```

Update all paths in `openclaw.json` to use `/Users/openclaw/.openclaw/...` (macOS) or `/home/openclaw/.openclaw/...` (Linux).

#### Log directory

The gateway auto-creates agent, workspace, and session directories on startup. The log directory must exist before the LaunchDaemon starts (launchd won't create it):

```bash
sudo -u openclaw mkdir -p /Users/openclaw/.openclaw/logs
```

#### File permissions

After the first successful gateway start (which creates the directory tree), set ownership and lock down permissions:

```bash
# Set ownership first (critical — setup/copy commands run as root)
sudo chown -R openclaw:staff /Users/openclaw/.openclaw

# Then restrict permissions
sudo chmod 700 /Users/openclaw              # Lock down home directory itself (on macOS, this may exclude it from Spotlight indexing and Time Machine backups — acceptable for a service account)
sudo chmod 700 /Users/openclaw/.openclaw
sudo chmod 600 /Users/openclaw/.openclaw/openclaw.json
sudo chmod 600 /Users/openclaw/.openclaw/credentials/*.json
sudo chmod 600 /Users/openclaw/.openclaw/agents/*/agent/auth-profiles.json
sudo chmod 600 /Users/openclaw/.openclaw/identity/*.json
sudo chmod -R 600 /Users/openclaw/.openclaw/credentials/whatsapp/default/*
sudo chmod 700 /Users/openclaw/.openclaw/credentials/whatsapp
```

### macOS: LaunchDaemon

> **VM isolation:** macOS VMs — use the [LaunchDaemon (Inside VM)](#launchdaemon-inside-vm) section below. Linux VMs — use [Linux: systemd](#linux-systemd).

A LaunchDaemon runs as a system service — starts at boot, no user session required. Use `UserName`/`GroupName` to run as the dedicated `openclaw` user.

> **Label convention:** OpenClaw's built-in service installer (`openclaw gateway install`) uses the label `bot.molt.gateway`. We use `ai.openclaw.gateway` for the manual system-level daemon to avoid conflicts. This means `openclaw gateway status` won't detect the daemon — use `launchctl print system/ai.openclaw.gateway` instead.

#### Create the plist

Verify paths first:
```bash
which openclaw
which node
readlink -f $(which openclaw)
```

```bash
sudo tee /Library/LaunchDaemons/ai.openclaw.gateway.plist > /dev/null << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>ai.openclaw.gateway</string>
    <key>UserName</key>
    <string>openclaw</string>
    <key>GroupName</key>
    <string>staff</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ProgramArguments</key>
    <array>
      <string>/opt/homebrew/bin/node</string>
      <string>/opt/homebrew/lib/node_modules/openclaw/dist/index.js</string>
      <string>gateway</string>
      <string>--port</string>
      <string>18789</string>
    </array>
    <key>StandardOutPath</key>
    <string>/Users/openclaw/.openclaw/logs/gateway.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/openclaw/.openclaw/logs/gateway.err.log</string>
    <key>EnvironmentVariables</key>
    <dict>
      <key>HOME</key>
      <string>/Users/openclaw</string>
      <key>OPENCLAW_HOME</key>
      <string>/Users/openclaw</string>
      <key>PATH</key>
      <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
      <key>OPENCLAW_GATEWAY_PORT</key>
      <string>18789</string>
      <key>OPENCLAW_GATEWAY_TOKEN</key>
      <string><!-- See Secrets Management section above --></string>
      <key>ANTHROPIC_API_KEY</key>
      <string><!-- See Secrets Management section above --></string>
      <key>BRAVE_API_KEY</key>
      <string><!-- See Secrets Management section above --></string>
      <key>GITHUB_TOKEN</key>
      <string><!-- See Secrets Management section above --></string>
      <key>OPENCLAW_SERVICE_MARKER</key>
      <string>openclaw</string>
      <key>OPENCLAW_SERVICE_KIND</key>
      <string>gateway</string>
    </dict>
  </dict>
</plist>
PLIST
```

#### If using Docker (OrbStack)

Required if using Docker sandboxing with OrbStack (not needed for Docker Desktop or native Docker on Linux). OrbStack runs as a user-session LaunchAgent. Bootstrap it into the `openclaw` user's GUI domain so the Docker socket is available to the gateway. Run **before** creating the LaunchDaemon — Docker socket must be available at gateway start:

```bash
sudo launchctl bootstrap gui/$(id -u openclaw) /Library/LaunchAgents/com.orbstack.helper.plist
```

Verify Docker is accessible:
```bash
sudo -u openclaw docker run --rm hello-world
```

#### Manage the daemon

```bash
# Start
sudo launchctl bootstrap system /Library/LaunchDaemons/ai.openclaw.gateway.plist

# Stop
sudo launchctl bootout system/ai.openclaw.gateway

# Restart
sudo launchctl bootout system/ai.openclaw.gateway
sudo launchctl bootstrap system /Library/LaunchDaemons/ai.openclaw.gateway.plist

# Check status
sudo launchctl print system/ai.openclaw.gateway 2>&1 | head -10

# Check it's listening
sudo lsof -i :18789

# View logs
tail -f /Users/openclaw/.openclaw/logs/gateway.log
```

> **Note:** Use `launchctl bootout` / `launchctl bootstrap` (or `systemctl restart` on Linux) instead of `openclaw gateway restart` — the latter targets user-level LaunchAgents (`gui/<uid>` domain), not system-level LaunchDaemons (`system` domain), and doesn't work for daemon-managed processes. The `KeepAlive` setting also means that simply killing the process causes `launchd` to respawn it immediately, which can race with OpenClaw's own restart logic.

#### Config reload without restart

OpenClaw watches `openclaw.json` for changes automatically. The default reload mode is `hybrid` — safe changes (tool policies, agent definitions) are hot-applied, while critical changes trigger an in-process restart. No manual action needed for most config edits.

To force an immediate reload:

```bash
sudo kill -USR1 $(pgrep -f "openclaw.*gateway")
```

Use a full `launchctl` restart only for binary updates or when auto-reload doesn't pick up your changes. Disable auto-reload with `gateway.reload.mode: "off"` if you prefer manual control.

#### Alternative: LaunchAgent

If your setup uses the browser tool with Playwright and you encounter headless rendering issues in a LaunchDaemon context, a LaunchAgent in the `openclaw` user's GUI domain provides GUI framework access that Playwright may need. Headless Playwright generally works fine under a LaunchDaemon, but Apple occasionally changes framework availability in non-GUI contexts across macOS updates.

| Dependency | LaunchDaemon | LaunchAgent |
|------------|--------------|-------------|
| Node.js gateway | Works | Works |
| OrbStack Docker socket | Requires bootstrapping OrbStack's helper (see above) | OrbStack runs in same user domain — socket always available |
| Playwright (browser tool) | Works headless; can break across macOS updates | Reliable — has GUI framework access |

##### Create LaunchAgents directory

```bash
sudo -u openclaw mkdir -p /Users/openclaw/Library/LaunchAgents
```

##### Create the plist

```bash
sudo -u openclaw tee /Users/openclaw/Library/LaunchAgents/ai.openclaw.gateway.plist > /dev/null << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>ai.openclaw.gateway</string>

    <key>Comment</key>
    <string>OpenClaw Gateway (Docker isolation — LaunchAgent alternative)</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ProgramArguments</key>
    <array>
      <string>/opt/homebrew/bin/node</string>
      <string>/opt/homebrew/lib/node_modules/openclaw/dist/index.js</string>
      <string>gateway</string>
      <string>--port</string>
      <string>18789</string>
    </array>

    <key>StandardOutPath</key>
    <string>/Users/openclaw/.openclaw/logs/gateway.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/openclaw/.openclaw/logs/gateway.err.log</string>
    <key>EnvironmentVariables</key>
    <dict>
      <key>HOME</key>
      <string>/Users/openclaw</string>
      <key>OPENCLAW_HOME</key>
      <string>/Users/openclaw</string>
      <key>PATH</key>
      <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
      <key>OPENCLAW_GATEWAY_PORT</key>
      <string>18789</string>
      <key>OPENCLAW_GATEWAY_TOKEN</key>
      <string><!-- See Secrets Management section above --></string>
      <key>ANTHROPIC_API_KEY</key>
      <string><!-- See Secrets Management section above --></string>
      <key>BRAVE_API_KEY</key>
      <string><!-- See Secrets Management section above --></string>
      <key>GITHUB_TOKEN</key>
      <string><!-- See Secrets Management section above --></string>
      <key>OPENCLAW_SERVICE_MARKER</key>
      <string>openclaw</string>
      <key>OPENCLAW_SERVICE_KIND</key>
      <string>gateway</string>
    </dict>
  </dict>
</plist>
PLIST
```

##### Manage the LaunchAgent

Get the `openclaw` user's UID (needed for `gui/` domain):

```bash
OPENCLAW_UID=$(id -u openclaw)
```

```bash
# Start (bootstrap into the user's GUI domain)
sudo launchctl bootstrap gui/$OPENCLAW_UID /Users/openclaw/Library/LaunchAgents/ai.openclaw.gateway.plist

# Stop
sudo launchctl bootout gui/$OPENCLAW_UID/ai.openclaw.gateway

# Restart (stop + start)
sudo launchctl bootout gui/$OPENCLAW_UID/ai.openclaw.gateway
sudo launchctl bootstrap gui/$OPENCLAW_UID /Users/openclaw/Library/LaunchAgents/ai.openclaw.gateway.plist

# Check status
sudo launchctl print gui/$OPENCLAW_UID/ai.openclaw.gateway 2>&1 | head -10
```

> **Survives logout?** Yes — `gui/<uid>` domains persist even when no user is visually logged in at the console, as long as the domain has been bootstrapped.

### Docker Sandboxing

Docker provides an additional isolation layer for agents.

> **VM isolation:** macOS VMs — skip this section (no Docker inside macOS VMs). Linux VMs — follow this section (Docker works inside the VM).

- **macOS:** [OrbStack](https://orbstack.dev) is recommended over Docker Desktop — lighter, faster, and integrates well with macOS networking.
- **Linux:** Docker Engine (via `apt`/`dnf`) is all you need — no Docker Desktop required. See [Docker Engine install docs](https://docs.docker.com/engine/install/).

> **Warning (bare Linux hosts):** Adding a user to the `docker` group grants effective root access on the host. For bare-metal Linux deployments, consider rootless Docker or Podman as alternatives.

```json
{
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "non-main",
        "scope": "session",
        "workspaceAccess": "none"
      }
    }
  }
}
```

For stronger isolation, use an internal Docker network so agents can only reach the gateway:

```bash
# Internal network — no internet access from containers
docker network create --internal openclaw-sandbox

# Gateway joins both internal and external networks
docker network connect openclaw-sandbox gateway
```

Agents on the internal network can communicate with the gateway but have no route to the internet. This is particularly useful for the search agent — the gateway mediates all external access.

See [OpenClaw sandboxing docs](https://docs.openclaw.ai/gateway/sandboxing) for full Docker configuration. For agents that need additional tools beyond the default image, see [Custom Sandbox Images](../custom-sandbox-images.md).

#### Sandbox the Main Agent

The [recommended configuration](../examples/config.md) sandboxes the main agent with Docker on an egress-allowlisted network. This roots main's filesystem inside Docker while preserving workspace access, and restricts outbound traffic to pre-approved hosts.

```json5
{
  "agents": {
    "list": [{
      "id": "main",
      // ... other config ...
      "sandbox": {
        "mode": "all",
        "scope": "agent",
        "workspaceAccess": "rw",
        "docker": { "network": "openclaw-egress" }
      }
    }]
  }
}
```

This roots the main agent's filesystem inside Docker — it can no longer read `openclaw.json` or `auth-profiles.json`. Workspace data (SOUL.md, memory, workspace files) remains accessible via the mount. Outbound network is restricted to pre-approved hosts via the `openclaw-egress` Docker network and host-level firewall rules.

**Prerequisites:**
1. Docker network created: `docker network create openclaw-egress`
2. Egress allowlist configured — see [`scripts/network-egress/`](https://github.com/IT-HUSET/openclaw-guide/tree/main/scripts/network-egress/) for setup

> **macOS with Docker Desktop or OrbStack:** Egress allowlisting via pf rules does not work — these tools run containers inside a Linux VM where the bridge interface is inaccessible to host-level pf. Options: (1) use a Linux VM deployment with `apply-rules-linux.sh` inside the VM, (2) use colima with bridged networking, or (3) accept no egress filtering and rely on tool policy as the primary defense.

**Trade-off:** Host-native tools (Xcode, Homebrew binaries) are unavailable inside the container. For host-level automation (cron jobs, service management), see [Local Admin Agent](#optional-local-admin-agent) below. For an even more isolated architecture with a dedicated computer agent, see [Hardened Multi-Agent](../hardened-multi-agent.md).

### Optional: Local Admin Agent

Sandboxed agents can't manage host-level tasks — `cron`, `gateway`, and other `group:automation` tools are denied inside Docker. A local admin agent fills this gap: an unsandboxed agent with `group:automation` access, completely isolated from channels and other agents, reachable only via the Control UI.

```
Channels → main ←→ search
                (sandboxed, egress-allowlisted, no cron)

Control UI → local-admin (unsandboxed, group:automation)
                (no channel binding, no sessions_send)
```

Agent definition (also in the [recommended config](../examples/config.md), commented out):

```json5
{
  "id": "local-admin",
  "workspace": "/Users/openclaw/.openclaw/workspaces/main",
  "agentDir": "/Users/openclaw/.openclaw/agents/local-admin/agent",
  "tools": {
    "allow": ["group:fs", "group:runtime", "group:automation", "memory_search", "memory_get"],
    "deny": ["group:web", "browser", "message"],
    "elevated": { "enabled": false }
  },
  "subagents": { "allowAgents": [] }
  // No sandbox block — runs directly on host as openclaw user
}
```

By pointing `workspace` at main's workspace, local-admin shares the same working directory — and importantly the same SOUL.md, CLAUDE.md, and project files. This means it behaves with the same personality and context as main, which is typically what you want when using it via the Control UI for workspace management tasks.

{{< callout type="info" >}}
The `agentDir` remains separate — local-admin gets its own conversation history and memory while sharing workspace files with main.
{{< /callout >}}

If you prefer full isolation (e.g., local-admin is purely for host automation with no need to touch workspace files), use a dedicated workspace instead:

```json5
"workspace": "/Users/openclaw/.openclaw/workspaces/local-admin"
```

With a separate workspace, give local-admin its own SOUL.md scoped to admin tasks. If it needs to modify main's files occasionally, it can still reach them via absolute paths (`/Users/openclaw/.openclaw/workspaces/main/...`) since it runs unsandboxed.

**Security properties:**
- **No channel binding** — unreachable from WhatsApp, Signal, and Google Chat
- **Not in any agent's `allowAgents`** — no delegation path from other agents
- **No `sessions_send`** — can't contact other agents
- **No `message` tool** — can't post to channels
- **Unsandboxed** — runs as the `openclaw` OS user (host access is the point)

{{< callout type="warning" >}}
Since this agent runs unsandboxed with exec and cron access, ensure the gateway port is firewalled to localhost. See [macOS Firewall](#macos-firewall).
{{< /callout >}}

Create the agent directory before starting the gateway:

```bash
mkdir -p /Users/openclaw/.openclaw/agents/local-admin/agent
```

If using a separate workspace, also create it and add a dedicated SOUL.md:

```bash
mkdir -p /Users/openclaw/.openclaw/workspaces/local-admin
nano /Users/openclaw/.openclaw/agents/local-admin/agent/SOUL.md
```

### Multi-Gateway Options

For running multiple gateway instances — profiles, multi-user separation, or VM variants — see [Multi-Gateway Deployments](../multi-gateway.md).

---

## VM Isolation

Run OpenClaw inside a VM for kernel-level host isolation. Your host is untouched — no access to personal files, external drives, or other host resources. Two sub-variants: macOS VMs (macOS hosts) and Linux VMs (any host).

### VM Isolation: macOS VMs

> **macOS hosts only.**

Run OpenClaw inside a macOS VM. Your host macOS is untouched.

```
macOS Host (personal use, untouched)
  └── VM — "openclaw-vm"
       └── openclaw user (standard, non-admin)
            └── Gateway (port 18789): main + search (+ optional channel agents)
```

Same multi-agent architecture as Docker isolation (main + search, plus optional channel agents, `sessions_send` delegation), but with a VM boundary instead of an OS user boundary. No Docker inside the VM (macOS doesn't support nested virtualization). For adding macOS-native tooling (Xcode, iOS Simulator, macOS apps) via Lume VMs, see [Phase 8: Computer Use](phase-8-computer-use.md).

Two hypervisor options:

| | **Lume** | **Parallels** |
|--|----------|--------------|
| Cost | Free | ~$100/yr |
| Interface | CLI-only | GUI + CLI (`prlctl`) |
| Hypervisor | Apple Virtualization.framework | Own hypervisor |
| macOS VM limit | 2 per host (Apple's limit) | 2 per host (same limit) |
| Best for | Headless/server deployments | GUI management, advanced snapshots |

#### Install

**Lume:**
```bash
brew install --cask lume
```

**Parallels:**
```bash
brew install --cask parallels
```
Or download from [parallels.com](https://www.parallels.com/products/desktop/).

#### Create the VM

**Lume:**
```bash
lume create openclaw-vm --os macos --ipsw latest \
  --cpu 8 --memory 16384 --disk-size 100 --unattended
```

**Parallels** — create via GUI (**File > New > Download macOS**, recommended) or CLI:
```bash
prlctl create openclaw-vm --ostype macos
prlctl set openclaw-vm --cpus 8 --memsize 16384
```

> The CLI creates an empty VM shell — you still need to install macOS (attach an IPSW or use the GUI installer). The GUI workflow handles this automatically.

Resource guidance:
- **CPU 8** — adjust based on your machine (leave cores for the host)
- **Memory 16GB** — minimum 8GB recommended for OpenClaw
- **Disk 100GB** — Lume uses sparse disks (grow on demand); Parallels: configure in VM settings

#### Start and connect

**Lume:**
```bash
lume run openclaw-vm --no-display
# Wait for boot, then SSH in:
lume ssh openclaw-vm
```

**Parallels:**
```bash
prlctl start openclaw-vm
# SSH in (enable Remote Login in VM's System Settings first):
ssh user@$(prlctl exec openclaw-vm ipconfig getifaddr en0)
```

#### Inside the VM: install dependencies

Same regardless of hypervisor:

```bash
# Install Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js
brew install node

# Install Xcode Command Line Tools (for coding agents)
xcode-select --install
```

#### Dedicated user (inside VM)

The default VM user is typically admin with a known password (e.g., Lume creates `lume`/`lume`). A compromised agent with `exec` access could escalate via `echo <password> | sudo -S <command>`. Create a dedicated **standard** (non-admin) user to run OpenClaw:

> **Why not just use the default user?** Three reasons: (1) admin users can `sudo` — a compromised agent could gain root access to the VM, (2) a non-login user has no `gui/<uid>` domain, preventing LaunchAgent/login item persistence, (3) shell RC files (`.zshrc`) are never sourced since nobody logs in interactively as this user.

```bash
# Create a standard user (NOT admin — no sudo access)
sudo sysadminctl -addUser openclaw -fullName "OpenClaw" -password "<temp>" \
  -home /Users/openclaw -shell /bin/zsh
sudo passwd openclaw

# Create home directory if not auto-created
sudo mkdir -p /Users/openclaw
sudo chown -R openclaw:staff /Users/openclaw
```

> **Keep the default admin user for management.** You need an admin user to SSH in, modify plists, restart services, and install updates. The dedicated `openclaw` user only runs the gateway. Change the default admin password (`sudo passwd lume` or equivalent) — the default is well-known and a compromised agent could use it for local SSH escalation.

##### Install OpenClaw

If already installed globally (e.g., by the admin user), skip the install and verify access:

```bash
sudo -u openclaw openclaw --version
```

Otherwise:

```bash
sudo -u openclaw bash -c 'curl -fsSL https://openclaw.ai/install.sh | bash'
sudo -u openclaw openclaw --version
sudo -u openclaw openclaw doctor
```

> Download and review the script before running, or verify the source URL.

Then either migrate from your personal user or create a fresh config:

```bash
# Fresh install (skip if migrating)
sudo -u openclaw openclaw setup
```

##### Required config: `gateway.mode`

The gateway refuses to start unless `gateway.mode` is set in `openclaw.json`:

```json
{
  "gateway": {
    "mode": "local"
  }
}
```

Run `openclaw doctor` to diagnose startup failures.

##### Log directory

```bash
sudo -u openclaw mkdir -p /Users/openclaw/.openclaw/logs
```

The gateway auto-creates agent, workspace, and session directories on startup. The log directory must exist before the LaunchDaemon starts.

##### File permissions

After the first successful gateway start, set ownership and lock down permissions:

```bash
# Set ownership first (critical — setup/copy commands run as root)
sudo chown -R openclaw:staff /Users/openclaw/.openclaw

# Then restrict permissions
sudo chmod 700 /Users/openclaw
sudo chmod 700 /Users/openclaw/.openclaw
sudo chmod 600 /Users/openclaw/.openclaw/openclaw.json
sudo chmod 600 /Users/openclaw/.openclaw/credentials/*.json
sudo chmod 600 /Users/openclaw/.openclaw/agents/*/agent/auth-profiles.json
sudo chmod 600 /Users/openclaw/.openclaw/identity/*.json
sudo chmod -R 600 /Users/openclaw/.openclaw/credentials/whatsapp/default/*
sudo chmod 700 /Users/openclaw/.openclaw/credentials/whatsapp
```

Then follow [Phase 4](phase-4-multi-agent.md) and [Phase 5](phase-5-web-search.md) to configure the multi-agent gateway. Use [`examples/openclaw.json`](../examples/config.md) as a starting point.

#### LaunchDaemon (Inside VM)

A LaunchDaemon runs as a system service — starts at boot, no user session required. Use `UserName`/`GroupName` to run as the `openclaw` user.

> **Why LaunchDaemon?** The `openclaw` user has no login session, so its `gui/<uid>` domain doesn't exist. This prevents agents from establishing persistence via `~/Library/LaunchAgents/`, login items, or shell RC files. Playwright headless works fine under a LaunchDaemon (since v1.49, `chromium-headless-shell` needs no GUI frameworks).

##### Create the plist

Verify paths first:
```bash
which openclaw
which node
readlink -f $(which openclaw)
```

```bash
sudo tee /Library/LaunchDaemons/ai.openclaw.gateway.plist > /dev/null << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>ai.openclaw.gateway</string>
    <key>UserName</key>
    <string>openclaw</string>
    <key>GroupName</key>
    <string>staff</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ProgramArguments</key>
    <array>
      <string>/opt/homebrew/bin/node</string>
      <string>/opt/homebrew/lib/node_modules/openclaw/dist/index.js</string>
      <string>gateway</string>
      <string>--port</string>
      <string>18789</string>
    </array>
    <key>StandardOutPath</key>
    <string>/Users/openclaw/.openclaw/logs/gateway.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/openclaw/.openclaw/logs/gateway.err.log</string>
    <key>EnvironmentVariables</key>
    <dict>
      <key>HOME</key>
      <string>/Users/openclaw</string>
      <key>OPENCLAW_HOME</key>
      <string>/Users/openclaw</string>
      <key>PATH</key>
      <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
      <key>OPENCLAW_GATEWAY_PORT</key>
      <string>18789</string>
      <key>OPENCLAW_GATEWAY_TOKEN</key>
      <string><!-- See Secrets Management section above --></string>
      <key>ANTHROPIC_API_KEY</key>
      <string><!-- See Secrets Management section above --></string>
      <key>BRAVE_API_KEY</key>
      <string><!-- See Secrets Management section above --></string>
      <key>GITHUB_TOKEN</key>
      <string><!-- See Secrets Management section above --></string>
      <key>OPENCLAW_SERVICE_MARKER</key>
      <string>openclaw</string>
      <key>OPENCLAW_SERVICE_KIND</key>
      <string>gateway</string>
    </dict>
  </dict>
</plist>
PLIST
```

> **Secrets:** Replace `YOUR_*_HERE` placeholders with real values — see [Secrets Management](#secrets-management).

##### Manage the daemon

```bash
# Start
sudo launchctl bootstrap system /Library/LaunchDaemons/ai.openclaw.gateway.plist

# Stop
sudo launchctl bootout system/ai.openclaw.gateway

# Restart
sudo launchctl bootout system/ai.openclaw.gateway
sudo launchctl bootstrap system /Library/LaunchDaemons/ai.openclaw.gateway.plist

# Check status
sudo launchctl print system/ai.openclaw.gateway 2>&1 | head -10

# Check it's listening
sudo lsof -i :18789

# View logs
tail -f /Users/openclaw/.openclaw/logs/gateway.log
```

##### Alternative: LaunchAgent

If you prefer simpler management (run as the default admin user, no dedicated user), use a LaunchAgent instead.

> **Warning:** Using a LaunchAgent instead of a LaunchDaemon weakens security — the agent runs as your admin user with writable persistence directories and no sudo restrictions. Use only if you accept reduced isolation compared to the dedicated-user LaunchDaemon setup.

| | LaunchDaemon + dedicated user | LaunchAgent + default user |
|--|------|------|
| sudo blocked | Yes (standard user) | No (admin user can sudo) |
| LaunchAgent persistence blocked | Yes (no gui domain) | No (writable `~/Library/LaunchAgents/`) |
| Shell RC persistence blocked | Yes (no interactive login) | No |
| Playwright headless | Works (since v1.49) | Works |
| Setup complexity | Medium | Low |

See the Docker isolation section's [Alternative: LaunchAgent](#alternative-launchagent) for the plist format — use the same pattern but without `UserName`/`GroupName` and with `$HOME` expansion.

#### VM management

**Lume:**
```bash
lume clone openclaw-vm openclaw-vm-backup   # Snapshot
lume stop openclaw-vm                        # Stop
lume run openclaw-vm --shared-dir ~/shared:~/shared  # Share files
lume list                                    # List VMs
```

**Parallels:**
```bash
prlctl snapshot openclaw-vm -n "pre-update"  # Snapshot
prlctl stop openclaw-vm                      # Stop
# Share files: configure via GUI (Parallels Tools > Sharing)
prlctl list                                  # List VMs
```

**Auto-start after host reboot:** Neither hypervisor auto-starts VMs by default. For Lume, create a LaunchDaemon on the host that runs `lume run openclaw-vm --no-display`. For Parallels, enable **Start Automatically** in VM settings, or use `prlctl start openclaw-vm` in a LaunchDaemon.

##### Config reload

OpenClaw watches `openclaw.json` for changes automatically — same behavior as Docker isolation. Safe changes (tool policies, agent definitions) are hot-applied; critical changes trigger an in-process restart. Force a reload with `sudo kill -USR1 $(pgrep -f "openclaw.*gateway")`.

#### Key differences from Docker isolation

- **No Docker** — `sandbox` blocks in `openclaw.json` have no effect. Tool policy + SOUL.md provide internal isolation. The `read→exfiltrate` chain is open within the VM (channel agents can read `~/.openclaw/openclaw.json`), but only OpenClaw data is at risk.
- **Standard user** — the `openclaw` user has no sudo access. Even within the VM, privilege escalation is blocked.
- **No GUI session** — the `openclaw` user never logs in. LaunchAgent persistence, login items, and shell RC file persistence are all neutralized.
- **VM is the outer boundary** — your host macOS is untouched. A full compromise of the VM doesn't affect the host.

For channel separation with two macOS VMs, see [Multi-Gateway: VM Variants](../multi-gateway.md#vm-variants).

### VM Isolation: Linux VMs

> **Works on macOS and Linux hosts.** Combines VM host boundary with Docker sandbox inside.

Run OpenClaw inside a Linux VM with Docker. This gives the strongest combined isolation posture — kernel-level VM boundary from the host, plus Docker sandboxing for internal agent isolation.

```
Host (macOS or Linux, untouched)
  └── Linux VM — "openclaw-vm"
       └── openclaw user (no sudo, docker group)
            └── Gateway (port 18789): main + search (+ optional channel agents)
                 ├── main (Docker sandbox, egress-allowlisted network)
                 └── search (unsandboxed — no filesystem/exec tools)
```

Same multi-agent architecture as Docker isolation, but running inside a VM. Docker closes the `read→exfiltrate` chain; the VM boundary protects the host. No macOS 2-VM limit — run as many Linux VMs as resources allow.

#### Hypervisor options

| | **Multipass** | **UTM** | **KVM/libvirt** |
|--|---|---|---|
| Host OS | macOS or Linux | macOS only | Linux only |
| Interface | CLI | GUI + CLI | CLI (`virsh`) |
| Best for | Headless/server (recommended) | macOS users wanting GUI | Linux-native deployments |
| Install | `brew install multipass` / `snap install multipass` | `brew install --cask utm` | `apt install qemu-kvm libvirt-daemon-system` |

#### Create the VM

**Multipass** (recommended):
```bash
multipass launch --name openclaw-vm --cpus 4 --memory 4G --disk 40G
multipass shell openclaw-vm
```

**KVM/libvirt** (Linux hosts):
```bash
# Download Ubuntu Server ISO first
curl -LO https://releases.ubuntu.com/24.04/ubuntu-24.04-live-server-amd64.iso

virt-install --name openclaw-vm --os-variant ubuntu24.04 \
  --vcpus 4 --memory 4096 --disk size=40 \
  --cdrom ubuntu-24.04-live-server-amd64.iso
```

> For headless (no GUI) installs, use [autoinstall](https://canonical-subiquity.readthedocs-hosted.com/en/latest/howto/autoinstall-quickstart.html) with a cloud-init seed instead of `--cdrom`.

Resource guidance:
- **CPU 4** — adjust based on your host (leave cores for host workloads)
- **Memory 4GB** — sufficient for headless Linux + Node.js + Docker. Increase to 8GB if agents do heavy coding
- **Disk 40GB** — sparse/thin-provisioned by default on most hypervisors

#### Inside the VM: install dependencies

```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install Node.js (LTS via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs

# Install Docker
curl -fsSL https://get.docker.com | sudo sh

# Install OpenClaw
curl -fsSL https://openclaw.ai/install.sh | bash
openclaw --version
```

> For production, verify GPG signatures per each project's install docs rather than piping to shell.

#### Dedicated user (inside Linux VM)

Create a non-sudo user with Docker access:

```bash
sudo useradd -m -s /bin/bash openclaw
sudo passwd openclaw
sudo usermod -aG docker openclaw
```

> **Why docker group?** The `openclaw` user needs Docker socket access for sandboxing but has no sudo. Note: `docker` group grants root-equivalent access to the Docker daemon — but the VM boundary contains this. Even if an attacker escapes Docker to VM root, they're still inside the VM, not on your host.

#### Install OpenClaw as dedicated user

If already installed globally (e.g., by the admin user), skip the install and verify access:

```bash
sudo -u openclaw openclaw --version
```

Otherwise:

```bash
sudo -u openclaw bash -c 'curl -fsSL https://openclaw.ai/install.sh | bash'
sudo -u openclaw openclaw --version
sudo -u openclaw openclaw doctor

# Fresh install (skip if migrating)
sudo -u openclaw openclaw setup
```

> Download and review the script before running, or verify the source URL.

#### Required config: `gateway.mode`

Same as all other models — the gateway refuses to start without it:

```json
{
  "gateway": {
    "mode": "local"
  }
}
```

#### Log directory and permissions

```bash
sudo -u openclaw mkdir -p /home/openclaw/.openclaw/logs

# After first successful gateway start:
# Set ownership first (critical — setup/copy commands run as root)
sudo chown -R openclaw:openclaw /home/openclaw/.openclaw

# Then restrict permissions
sudo chmod 700 /home/openclaw
sudo chmod 700 /home/openclaw/.openclaw
sudo chmod 600 /home/openclaw/.openclaw/openclaw.json
sudo chmod 600 /home/openclaw/.openclaw/credentials/*.json
sudo chmod 600 /home/openclaw/.openclaw/agents/*/agent/auth-profiles.json
sudo chmod 600 /home/openclaw/.openclaw/identity/*.json
```

#### Service: systemd

Use the [Linux: systemd](#linux-systemd) section below — it applies identically inside a Linux VM. The `openclaw` user is already set up with Docker access.

#### Key differences from Docker isolation

- **VM is the outer boundary** — your host is untouched. A full compromise of the VM doesn't affect the host.
- **Docker works inside** — `sandbox` blocks in `openclaw.json` work normally. Both isolation chains (VM + Docker) are active.
- **No macOS tooling** — Xcode, Homebrew-native macOS tools, and Swift aren't available. Use macOS VMs if agents need these.
- **Lighter weight** — a headless Ubuntu VM uses 2-4GB RAM vs 8-16GB for a macOS VM.

#### Firewall and Tailscale

Same configuration as Docker isolation — see [macOS Firewall](#macos-firewall) and [Tailscale ACLs](#tailscale-acls). Apply inside the Linux VM (UFW/iptables) and optionally install Tailscale inside the VM for remote access.

For multiple Linux VMs, see [Multi-Gateway: VM Variants](../multi-gateway.md#vm-variants).

---

## Service Management Comparison

| | LaunchDaemon (macOS) | LaunchAgent (macOS) | systemd (Linux) |
|--|---|---|---|
| Runs as | Dedicated user | Admin user | Dedicated user |
| Starts at | Boot | Login | Boot |
| Security | Strongest (macOS) | Weakened (admin can sudo, writable persistence dirs) | Strongest (Linux) |

## Linux: systemd

> **Applies to:** Docker isolation on Linux hosts **and** inside Linux VMs (same systemd unit, same user setup).

> **Prerequisite:** Create the secrets file first — see [Secrets Management](#linux-environment-file) below — before enabling this unit.

**Create the service file:**

```bash
sudo tee /etc/systemd/system/openclaw-gateway.service > /dev/null << 'EOF'
[Unit]
Description=OpenClaw Gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=openclaw
Group=openclaw
ExecStart=/usr/bin/node /usr/lib/node_modules/openclaw/dist/index.js gateway --port 18789
Restart=always
RestartSec=5

# Hardening
NoNewPrivileges=true
PrivateTmp=yes
ProtectSystem=strict
ReadWritePaths=/home/openclaw/.openclaw

Environment=HOME=/home/openclaw
Environment=OPENCLAW_HOME=/home/openclaw
Environment=OPENCLAW_GATEWAY_PORT=18789
EnvironmentFile=/etc/openclaw/secrets.env

StandardOutput=append:/home/openclaw/.openclaw/logs/gateway.log
StandardError=append:/home/openclaw/.openclaw/logs/gateway.err.log

[Install]
WantedBy=multi-user.target
EOF
```

> Verify your Node.js path: `which node && readlink -f $(which node)`. Update `ExecStart` if your path differs (e.g., nvm/asdf installs use `~/.nvm/` or `~/.asdf/` paths, not `/usr/bin/node`).

**Manage the service:**

```bash
# Enable + start
sudo systemctl enable --now openclaw-gateway

# Stop
sudo systemctl stop openclaw-gateway

# Restart
sudo systemctl restart openclaw-gateway

# Status
sudo systemctl status openclaw-gateway

# Logs
sudo journalctl -u openclaw-gateway -f
```

---

### VM isolation: secrets via SSH

**macOS VMs:** Push secrets from the host to the VM's LaunchDaemon plist. Uses `lume ssh` — for Parallels, replace with `prlctl exec` or regular `ssh user@<vm-ip>`.

**Linux VMs:** Push secrets to the systemd environment file inside the VM:
```bash
# Multipass
multipass exec openclaw-vm -- sudo tee /etc/openclaw/secrets.env > /dev/null << 'EOF'
OPENCLAW_GATEWAY_TOKEN=your-gateway-token
ANTHROPIC_API_KEY=sk-ant-...
BRAVE_API_KEY=BSA...
GITHUB_TOKEN=github_pat_...
EOF
multipass exec openclaw-vm -- sudo chmod 600 /etc/openclaw/secrets.env
multipass exec openclaw-vm -- sudo systemctl restart openclaw-gateway

# Or via SSH (any hypervisor)
ssh user@<vm-ip> 'sudo tee /etc/openclaw/secrets.env > /dev/null' < secrets.env
ssh user@<vm-ip> 'sudo chmod 600 /etc/openclaw/secrets.env && sudo systemctl restart openclaw-gateway'
```

**Single VM:**
```bash
PLIST=/Library/LaunchDaemons/ai.openclaw.gateway.plist

# Set a secret
lume ssh openclaw-vm -- sudo /usr/libexec/PlistBuddy \
  -c "Set :EnvironmentVariables:ANTHROPIC_API_KEY sk-ant-..." "$PLIST"

# Restart the daemon
lume ssh openclaw-vm -- sudo launchctl bootout system/ai.openclaw.gateway 2>/dev/null
lume ssh openclaw-vm -- sudo launchctl bootstrap system "$PLIST"

# Lock down the plist
lume ssh openclaw-vm -- sudo chmod 600 "$PLIST"
```

For multi-VM secrets automation, see [Multi-Gateway: VM Variants](../multi-gateway.md#vm-variants).

### Docker isolation: Single plist

No deploy script needed — one LaunchDaemon (or LaunchAgent) plist holds all secrets. Lock it down:

```bash
# LaunchDaemon
sudo chmod 600 /Library/LaunchDaemons/ai.openclaw.gateway.plist

# Or LaunchAgent (if using the alternative)
sudo chmod 600 /Users/openclaw/Library/LaunchAgents/ai.openclaw.gateway.plist
```

### Linux: Environment file

The systemd unit references `EnvironmentFile` instead of inline secrets:

```bash
sudo mkdir -p /etc/openclaw
sudo tee /etc/openclaw/secrets.env > /dev/null << 'EOF'
OPENCLAW_GATEWAY_TOKEN=your-gateway-token
ANTHROPIC_API_KEY=sk-ant-...
BRAVE_API_KEY=BSA...
GITHUB_TOKEN=github_pat_...
# web-guard and channel-guard plugins use local ONNX models — no API keys needed
EOF
sudo chmod 600 /etc/openclaw/secrets.env
sudo chown root:root /etc/openclaw/secrets.env
```

### What stays in openclaw.json

Channel config (`allowFrom`, `dmPolicy`), agent definitions, tool policies, workspace paths — structural config, not secrets. Channel credentials (WhatsApp session, Signal auth) are managed by their plugins in `~/.openclaw/credentials/`.

---

## macOS Firewall

```bash
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate on
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setstealthmode on
```

Also disable unneeded sharing services in **System Settings > General > Sharing**:
- Remote Management
- Screen Sharing (unless used for remote access)
- File Sharing
- AirDrop

**Linux (ufw):**
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw enable
```

---

## Tailscale ACLs

If using Tailscale, configure ACLs to prevent the OpenClaw machine from initiating connections to other devices on your tailnet. This blocks lateral movement if the agent is compromised. Internet traffic (APIs, WhatsApp, Signal) is unaffected — Tailscale ACLs only control tailnet traffic.

### Tag the device

Add to your Tailscale ACL config at https://login.tailscale.com/admin/acls:

```json
{
  "tagOwners": {
    "tag:openclaw": ["autogroup:admin"]
  }
}
```

Then tag the machine in the Tailscale admin console under **Machines**.

### ACL rules

```json
{
  "grants": [
    {
      "src": ["autogroup:member"],
      "dst": ["*"],
      "ip": ["*"]
    }
  ],

  "ssh": [
    {
      "action": "check",
      "src": ["autogroup:member"],
      "dst": ["autogroup:self"],
      "users": ["autogroup:nonroot", "root"]
    },
    {
      "action": "check",
      "src": ["autogroup:member"],
      "dst": ["tag:openclaw"],
      "users": ["autogroup:nonroot", "root"]
    }
  ]
}
```

The key: `tag:openclaw` has **no outbound grant** — it can't reach other tailnet devices. But all your personal devices (`autogroup:member`) can reach it (including via SSH).

> **Important:** Test SSH/screen sharing still works after applying ACLs. If locked out, use physical access (or out-of-band management) to fix.

## If You Need LAN Access

Prefer Tailscale Serve or an SSH tunnel over binding to `0.0.0.0`. If LAN binding is unavoidable:

1. **Set auth** — `gateway.auth.mode: "token"` or `"password"` (required for non-loopback; gateway enforces this)
2. **Firewall to source IPs** — restrict port 18789 to specific trusted IPs:

   **macOS (pf):**
   ```
   # /etc/pf.conf — allow only your admin machine
   block in on en0 proto tcp to any port 18789
   pass in on en0 proto tcp from 192.168.1.100 to any port 18789
   ```

   **Linux (ufw):**
   ```bash
   sudo ufw deny in on eth0 to any port 18789
   sudo ufw allow in on eth0 from 192.168.1.100 to any port 18789
   ```

3. **Never port-forward broadly** — don't expose 18789 on your router

> **What's exposed on port 18789:** Control UI, WebSocket protocol, HTTP API (`/v1/chat/completions`), and all webhook endpoints. Binding to `0.0.0.0` without a source-IP firewall exposes all of these to every device on your network.

## Reverse Proxy Configuration

If terminating TLS with a reverse proxy (Caddy, nginx, Cloudflare Tunnel):

1. **Set `trustedProxies`** in `openclaw.json`:
   ```json
   { "gateway": { "trustedProxies": ["127.0.0.1"] } }
   ```

2. **Proxy must OVERWRITE `X-Forwarded-For`** — not append. Appending allows clients to spoof their IP.

   **Caddy** (overwrites by default — no action needed).

   **nginx:**
   ```nginx
   proxy_set_header X-Forwarded-For $remote_addr;  # overwrites, not appends
   ```

3. **Strip Tailscale identity headers** if `gateway.auth.allowTailscale` is enabled:
   ```nginx
   proxy_set_header Tailscale-User-Login "";
   proxy_set_header Tailscale-User-Name "";
   ```
   Forwarding these headers from your proxy allows authentication bypass.

---

## macOS Companion App

If you install the OpenClaw macOS app (Docker isolation — on host), create this marker file **before** installing to prevent it from starting its own gateway:

```bash
sudo -u openclaw touch /Users/openclaw/.openclaw/disable-launchagent
```

The app will attach to the existing gateway in read-only mode.

Alternative (per-launch): `open -a OpenClaw --args --attach-only`

> **VM isolation:** The companion app runs on your host macOS. Recommended: use Tailscale Serve inside the VM (`tailscale serve --bg --https 8443 http://127.0.0.1:18789`) and connect via `--gateway-url https://<tailscale-ip>:8443`. Alternative: SSH tunnel (`ssh -N -L 18789:127.0.0.1:18789 user@<vm-ip>`). Avoid binding the gateway to `0.0.0.0` — see [If You Need LAN Access](#if-you-need-lan-access).

---

## Signal Setup

{{< callout type="warning" >}}
Signal device links are host-specific. If migrating to new hardware, you'll need to re-pair (see [Phase 7: Migration](phase-7-migration.md#signal)).
{{< /callout >}}

Signal requires `signal-cli` (Java-based) linked as a device.

> **Prerequisite:** Signal requires Java 21+. Install via `brew install openjdk@21` (macOS) or your distro's package manager (Linux, e.g., `sudo apt install openjdk-21-jre`).

### Install

**macOS:**
```bash
brew install signal-cli   # requires Java 21
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt-get install -y default-jre
# Check https://github.com/AsamK/signal-cli/releases for latest version
SIGNAL_CLI_VERSION=0.13.12  # Update to latest
curl -L -o signal-cli.tar.gz \
  "https://github.com/AsamK/signal-cli/releases/download/v${SIGNAL_CLI_VERSION}/signal-cli-${SIGNAL_CLI_VERSION}-Linux.tar.gz"
sudo tar xf signal-cli.tar.gz -C /opt
sudo ln -sf /opt/signal-cli-${SIGNAL_CLI_VERSION}/bin/signal-cli /usr/local/bin/signal-cli
```

### Link to Signal account

Run as the `openclaw` user so credentials are stored in its home:

```bash
sudo -u openclaw signal-cli link -n "OpenClaw"
```

This outputs a URI. Generate a QR code to scan:

```bash
pip install qrcode pillow
python3 -c "
import qrcode
img = qrcode.make('sgnl://linkdevice?uuid=...&pub_key=...')
img.save('signal-link-qr.png')
"
open signal-link-qr.png    # macOS
# xdg-open signal-link-qr.png  # Linux
```

Scan with **Signal > Settings > Linked Devices > Link New Device**. Do this quickly — links expire fast.

### Configure Signal channel

Add to `openclaw.json`:
```json
{
  "channels": {
    "signal": {
      "enabled": true,
      "account": "+46XXXXXXXXX",
      "cliPath": "signal-cli",
      "dmPolicy": "pairing",
      "allowFrom": ["+46XXXXXXXXX"],
      "groupPolicy": "allowlist",
      "mediaMaxMb": 8
    }
  }
}
```

> **Slow JVM starts:** `signal-cli` is Java-based and can take 10–30s to start. If you manage the daemon separately, set `autoStart: false` and point `httpUrl` at your running instance (e.g., `"httpUrl": "http://127.0.0.1:8080"`). For auto-spawned daemons, increase `startupTimeoutMs` if you see timeouts.

### Approve senders

```bash
openclaw pairing list signal
openclaw pairing approve signal <CODE>
```

> **Note:** The primary Signal device receives all messages too. Use a dedicated phone number for the bot, or mute notifications on the primary device.

---

## Verification Checklist

> **Config validation is strict.** OpenClaw rejects unknown keys, malformed types, or invalid values — the gateway refuses to start. If the daemon starts but exits immediately, run `openclaw doctor` to diagnose. Use `openclaw doctor --fix` to auto-apply safe repairs.

After deployment, verify everything works:

```bash
# Service is running
sudo launchctl print system/ai.openclaw.gateway 2>&1 | head -10  # VM (inside VM) / Docker isolation
sudo systemctl status openclaw-gateway                            # Linux

# Gateway is listening
sudo lsof -i :18789

# Health check (replace <token> with your OPENCLAW_GATEWAY_TOKEN value)
curl -s -H "Authorization: Bearer <token>" http://127.0.0.1:18789/health

# Recent logs
tail -20 /Users/openclaw/.openclaw/logs/gateway.log    # macOS (VM / Docker isolation)
tail -20 /home/openclaw/.openclaw/logs/gateway.log     # Linux
```

- [ ] Gateway starts at boot (both options)
- [ ] Health endpoint responds
- [ ] WhatsApp/Signal messages get responses
- [ ] Logs are written to the expected location
- [ ] File permissions are 600/700 on sensitive files
- [ ] Gateway only listens on loopback
- [ ] Tailscale ACLs block outbound from openclaw machine (if applicable)
- [ ] Security audit passes: `openclaw security audit --deep`

---

## Ongoing Management

```bash
# Edit config (VM and Docker isolation use the same dedicated user)
sudo -u openclaw vi /Users/openclaw/.openclaw/openclaw.json

# Restart (macOS — both VM and Docker isolation)
sudo launchctl bootout system/ai.openclaw.gateway
sudo launchctl bootstrap system /Library/LaunchDaemons/ai.openclaw.gateway.plist

# Restart (Linux)
sudo systemctl restart openclaw-gateway
```

### Updating OpenClaw

```bash
# Backup before upgrading
sudo cp -r /Users/openclaw/.openclaw /Users/openclaw/.openclaw.bak

# Update (either method works)
openclaw update                                  # Built-in updater
# or: curl -fsSL https://openclaw.ai/install.sh | bash

# Verify
openclaw --version
openclaw doctor

# Restart the daemon (see commands above)
```

If something breaks, restore the backup. Run `openclaw doctor --fix` to apply any config migrations needed after the update.

### Log Rotation

Gateway logs grow indefinitely. Set up rotation:

**macOS** — add to `/etc/newsyslog.d/openclaw.conf`:
```
/Users/openclaw/.openclaw/logs/gateway.log     openclaw:staff  640  7  1024  *  J
/Users/openclaw/.openclaw/logs/gateway.err.log openclaw:staff  640  7  1024  *  J
```

> `640` restricts log access to owner and group only. Gateway logs may contain sensitive data.

**Linux** — add to `/etc/logrotate.d/openclaw`:
```
/home/openclaw/.openclaw/logs/*.log {
    weekly
    rotate 4
    compress
    missingok
    notifempty
}
```

### Session Transcript Pruning

Session files (`agents/<id>/sessions/*.jsonl`) contain full message history including tool output. Prune old sessions periodically:

> **Test before scheduling.** Run the `find` command without `-delete` first to verify what would be pruned:
> ```bash
> sudo -u openclaw find /Users/openclaw/.openclaw/agents/*/sessions -name "*.jsonl" -mtime +30
> ```

Delete sessions older than 30 days:
```bash
sudo -u openclaw find /Users/openclaw/.openclaw/agents/*/sessions -name "*.jsonl" -type f -mtime +30 -delete
```

**Schedule with cron (simplest):**

*macOS:*
```bash
# Add to openclaw user's crontab
sudo -u openclaw crontab -e
# Add line (weekly, Sunday at 3am):
0 3 * * 0 find /Users/openclaw/.openclaw/agents/*/sessions -name "*.jsonl" -type f -mtime +30 -delete
```

*Linux:*
```bash
# Add to openclaw user's crontab
sudo crontab -u openclaw -e
# Add line (weekly, Sunday at 3am):
0 3 * * 0 find /home/openclaw/.openclaw/agents/*/sessions -name "*.jsonl" -type f -mtime +30 -delete
```

**macOS LaunchDaemon alternative** (more Mac-native):
```xml
<!-- /Library/LaunchDaemons/com.openclaw.session-pruning.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.openclaw.session-pruning</string>
    <key>UserName</key>
    <string>openclaw</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/sh</string>
        <string>-c</string>
        <string>find /Users/openclaw/.openclaw/agents/*/sessions -name "*.jsonl" -type f -mtime +30 -delete</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Weekday</key>
        <integer>0</integer>
        <key>Hour</key>
        <integer>3</integer>
    </dict>
</dict>
</plist>
```

Load the LaunchDaemon:
```bash
sudo launchctl bootstrap system /Library/LaunchDaemons/com.openclaw.session-pruning.plist
```

> **Retention policy:** 30 days balances audit trail (ability to review recent sessions) with storage (transcript files can be large). Adjust `mtime` value based on your needs.

---

## Deployment Gotchas

Operational issues discovered during real deployments. Most are macOS-specific.

### macOS Service User Setup

- **`sysadminctl` doesn't create home directories** — `sysadminctl -addUser` assigns a home path but doesn't create it. After creating the user: `sudo mkdir -p /Users/openclaw && sudo chown openclaw:staff /Users/openclaw`
- **Home dir ownership** — `sudo mkdir -p` creates directories owned by root. Always `chown user:staff` explicitly after.
- **Admin access to dedicated user files** — dedicated user home dirs are `drwx------`. Use macOS ACLs for admin read/write access:
  ```bash
  # Traverse-only on home dir (minimal — just enough to reach .openclaw)
  sudo chmod +a "youradmin allow list,search,execute" /Users/openclaw

  # Full read+write with inheritance on .openclaw
  sudo chmod -R +a "youradmin allow \
    read,write,append,delete,add_file,add_subdirectory,delete_child,\
    readattr,writeattr,readextattr,writeextattr,readsecurity,\
    list,search,execute,\
    file_inherit,directory_inherit" \
    /Users/openclaw/.openclaw
  ```
- **NOPASSWD sudo** — automated setup tools may need `NOPASSWD` in `/etc/sudoers.d/`. **Remove immediately after setup:** `sudo rm /etc/sudoers.d/<file>`

### Running Commands as Service User

`sudo -u` preserves the caller's working directory. Simple commands (`--version`, `--help`) typically work, but commands that access the filesystem can fail if the current directory isn't accessible to the target user:

```bash
# Works for simple commands
sudo -u openclaw openclaw --version

# Required for commands that access files or the working directory
sudo -u openclaw bash -c 'cd /Users/openclaw && HOME=/Users/openclaw openclaw doctor'
```

Use the `bash -c` pattern for interactive setup, `openclaw doctor`, `openclaw setup`, or any command that reads/writes files.

### Docker/OrbStack

- **OrbStack docker CLI not in PATH** — OrbStack installs at `/usr/local/bin/docker`, which may not be in PATH for dedicated users or non-interactive shells. Use the full path, ensure the engine is running with `orbctl start`, or symlink: `sudo ln -sf /Applications/OrbStack.app/Contents/MacOS/orbctl /usr/local/bin/docker`

### Playwright

- **Per-user install requires correct environment** — `npx -y playwright install chromium` as another user needs `HOME` and `PATH` set correctly, and must `cd` to the user's home first. The npm cache must be writable by that user.

### Signal

- **JAVA_HOME stale after brew upgrade** — signal-cli needs Java 21. After brew upgrades, `JAVA_HOME` may point to a removed version. Set explicitly in plist `EnvironmentVariables`: `JAVA_HOME=/opt/homebrew/Cellar/openjdk@21/<version>/libexec/openjdk.jdk/Contents/Home`

### Migration Between Hosts

For a complete migration guide covering config, credentials, memory, channels, services, and scheduled tasks, see **[Phase 7 — Migration](phase-7-migration.md)**.

---

## Emergency Procedures

### Immediate Shutdown

```bash
# VM: macOS VMs — stop the VM from host (fastest, kills everything)
lume stop openclaw-vm       # Lume
prlctl stop openclaw-vm     # Parallels

# VM: Linux VMs — stop the VM from host
multipass stop openclaw-vm          # Multipass
virsh shutdown openclaw-vm          # KVM/libvirt

# VM isolation — inside the VM (graceful)
sudo launchctl bootout system/ai.openclaw.gateway   # macOS VM
sudo systemctl stop openclaw-gateway                 # Linux VM

# Docker isolation (LaunchDaemon on host)
sudo launchctl bootout system/ai.openclaw.gateway

# Linux (Docker isolation on Linux host)
sudo systemctl stop openclaw-gateway
```

### Remote Shutdown (via Tailscale SSH)

```bash
# VM: macOS VMs — stop VM from host
ssh user@<tailscale-ip> 'lume stop openclaw-vm'       # Lume
ssh user@<tailscale-ip> 'prlctl stop openclaw-vm'     # Parallels

# VM: Linux VMs — stop VM from host
ssh user@<tailscale-ip> 'multipass stop openclaw-vm'       # Multipass
ssh user@<tailscale-ip> 'virsh shutdown openclaw-vm'       # KVM/libvirt

# Docker isolation (macOS host)
ssh user@<tailscale-ip> 'sudo launchctl bootout system/ai.openclaw.gateway'

# Docker isolation (Linux host)
ssh user@<tailscale-ip> 'sudo systemctl stop openclaw-gateway'
```

### Session Reset

```bash
sudo -u openclaw openclaw sessions reset
```

### Incident Response

If you suspect compromise, follow this sequence:

1. **Contain** — stop the gateway immediately (see [Immediate Shutdown](#immediate-shutdown) above)
2. **Rotate credentials:**
   - **Gateway token** — rotate in the LaunchDaemon/LaunchAgent plist (macOS) or `/etc/openclaw/secrets.env` (Linux)
   - **API keys** — rotate Anthropic, Perplexity/Brave keys in the same plist or env file; also update `auth-profiles.json` if used
   - **Channel credentials** — re-pair WhatsApp (scan new QR) or re-link Signal
3. **Audit** — review logs and session transcripts for unauthorized actions:
   ```bash
   # Recent gateway logs (macOS: /Users/openclaw, Linux: /home/openclaw)
   tail -100 ~openclaw/.openclaw/logs/gateway.log

   # Session transcripts (look for unexpected tool calls)
   ls -lt ~openclaw/.openclaw/agents/*/sessions/*.jsonl | head -20
   ```
4. **Restart** the gateway with rotated credentials
5. **Report** vulnerabilities to security@openclaw.ai

See the [official security docs](https://docs.openclaw.ai/gateway/security) for additional context on known attack patterns.

---

## Next Steps

Your OpenClaw deployment is production-ready.

→ **[Phase 7 — Migration](phase-7-migration.md)** — moving a deployment to a new machine
→ **[Reference](../reference.md)** — config cheat sheet, tool list, gotchas, emergency procedures

Or review:
- [Hardened Multi-Agent](../hardened-multi-agent.md) — optional: add a dedicated computer agent for exec isolation
- [Examples](../examples/) — complete config and security audit
