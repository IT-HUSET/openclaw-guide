---
title: "Phase 5 — Deployment"
description: "VM isolation, LaunchDaemon/systemd, secrets, firewall, Tailscale, Signal."
weight: 50
---

Run OpenClaw as a system service that starts at boot, survives reboots, and is locked down at the network level.

- **Coming from Phase 1 quick start?** Each isolation model section below covers migrating your existing config to the dedicated user/VM — stop the personal gateway first, then follow the migration steps in your chosen section.
- **Fresh dedicated machine?** Each section installs OpenClaw from scratch in the right place — no prior installation needed. A dedicated machine also changes the isolation trade-offs — see [Security: dedicated machine note](phase-2-security.md#comparison).

**Pick one isolation model and skip the others** — each section is self-contained with full installation, configuration, and service setup:
- [Docker Isolation](#docker-isolation) *(recommended)* — macOS or Linux, single gateway with Docker sandboxing
- [VM: macOS VMs](#vm-isolation-macos-vms) — macOS hosts, stronger host isolation, no Docker inside
- [VM: Linux VMs](#vm-isolation-linux-vms) — any host, strongest combined (VM + Docker)

**Shared sections** (apply to all models, read after completing your chosen model): [Secrets Management](#secrets-management) | [Firewall](#macos-firewall) | [Tailscale ACLs](#tailscale-acls) | [Signal Setup](#signal-setup) | [Verification](#verification-checklist) | [Emergency](#emergency-procedures)

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

## Deployment: Choose Your Isolation Model

Before setting up the service, choose your isolation model. See [Security: Deployment Isolation Options](phase-2-security.md#deployment-isolation-options) for the full trade-off analysis.

- **Docker isolation** *(recommended)* — single 6-agent gateway as `openclaw` user with Docker sandboxing. macOS or Linux.
- **VM isolation: macOS VMs** (Lume / Parallels) — single macOS VM, 6-agent gateway, no Docker inside VM. macOS hosts only.
- **VM isolation: Linux VMs** (Multipass / KVM / UTM) — Linux VM with Docker inside. Strongest combined posture (VM boundary + Docker sandbox). macOS or Linux hosts.

All three use the same 6-agent architecture with `sessions_send` delegation. They differ in the outer boundary and internal sandboxing:
- **Docker isolation:** OS user boundary + Docker sandbox. LaunchDaemon/systemd on host.
- **VM: macOS VMs:** Kernel-level VM boundary + standard user (no sudo). LaunchDaemon inside VM. No Docker.
- **VM: Linux VMs:** Kernel-level VM boundary + Docker sandbox inside VM. systemd inside VM.

---

## Docker Isolation

> **Recommended approach.** Works on both macOS and Linux. Single gateway, 6 agents, Docker sandboxing for internal isolation.
>
> **Automated setup:** For a fresh dedicated macOS machine, see [`scripts/docker-isolation/`](https://github.com/IT-HUSET/openclaw-guide/tree/main/scripts/docker-isolation/) — three scripts that automate everything below.

### Installation Scope

The OpenClaw installer (`curl ... | bash`) runs `npm install -g openclaw`, placing files in the global npm prefix. On a service deployment, global install is preferred:

- **Global install (recommended):** Admin installs OpenClaw once. The `openclaw` user — in the `staff` group by default on macOS — can run `/opt/homebrew/bin/openclaw` without its own Node.js install. The LaunchDaemon plist references these paths directly.
- **Per-user install:** Alternative if you can't modify global packages. Requires updating `ProgramArguments` in the plist to point at the user's local npm prefix (e.g., `/Users/openclaw/.npm-global/...`).

On Linux, global install places the binary at `/usr/local/bin/openclaw` — accessible to all users by default.

> **macOS: Homebrew `staff` group write access.** The `staff` group has **write** access to `/opt/homebrew` by default. Any user in `staff` (including the `openclaw` user) can modify binaries there — a compromised `openclaw` user could trojan `/opt/homebrew/bin/node`, affecting all users who run it. Mitigations: (1) `sudo chown root:wheel /opt/homebrew/bin/node` to remove group write (re-apply after `brew upgrade`), or (2) install Node.js per-user via [nvm](https://github.com/nvm-sh/nvm) so each user runs their own copy. This is lower risk for single-user deployments where only the `openclaw` user runs Node.js.

### Dedicated OS User

If you haven't already (from [Phase 2](phase-2-security.md)), create a dedicated non-admin user:

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
> These are standard multi-user OS risks, not OpenClaw-specific. On a **dedicated machine** with no personal data, these are non-issues — see the [dedicated machine note](phase-2-security.md#comparison).

#### Install OpenClaw

If OpenClaw is already installed globally (e.g., via Homebrew or by the admin user), skip the install and verify the `openclaw` user can access it:

```bash
sudo -u openclaw openclaw --version
sudo -u openclaw openclaw doctor
```

Otherwise, install as the `openclaw` user:

```bash
sudo -u openclaw bash -c 'curl -fsSL https://openclaw.ai/install.sh | bash'
sudo -u openclaw openclaw --version
sudo -u openclaw openclaw doctor
```

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

Without this, the gateway exits immediately. Run `openclaw doctor` to diagnose startup failures.

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
sudo chmod 700 /Users/openclaw              # Lock down home directory itself
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
      <string>YOUR_GATEWAY_TOKEN_HERE</string>
      <key>ANTHROPIC_API_KEY</key>
      <string>YOUR_ANTHROPIC_KEY_HERE</string>
      <key>BRAVE_API_KEY</key>
      <string>YOUR_BRAVE_KEY_HERE</string>
      <key>GITHUB_TOKEN</key>
      <string>YOUR_GITHUB_TOKEN_HERE</string>
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

#### If using Docker (OrbStack)

OrbStack runs as a user-session LaunchAgent. Bootstrap it into the `openclaw` user's GUI domain so the Docker socket is available to the gateway:

```bash
sudo launchctl bootstrap gui/$(id -u openclaw) /Library/LaunchAgents/com.orbstack.helper.plist
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

> **Do not use `openclaw gateway restart`** — it targets user-level LaunchAgents (`gui/<uid>` domain), not system-level LaunchDaemons (`system` domain). Always restart via `launchctl bootout` + `bootstrap` as shown above. The `KeepAlive` setting also means that simply killing the process causes `launchd` to respawn it immediately, which can race with OpenClaw's own restart logic.

#### Config reload without restart

OpenClaw watches `openclaw.json` for changes automatically. The default reload mode is `hybrid` — safe changes (tool policies, agent definitions) are hot-applied, while critical changes trigger an in-process restart. No manual action needed for most config edits.

To force an immediate reload:

```bash
sudo kill -USR1 $(pgrep -f "openclaw.*gateway")
```

Use a full `launchctl` restart only for binary updates or when auto-reload doesn't pick up your changes. Disable auto-reload with `gateway.reload.mode: "off"` if you prefer manual control.

#### Alternative: LaunchAgent

If your setup uses the browser agent with Playwright and you encounter headless rendering issues in a LaunchDaemon context, a LaunchAgent in the `openclaw` user's GUI domain provides GUI framework access that Playwright may need. Headless Playwright generally works fine under a LaunchDaemon, but Apple occasionally changes framework availability in non-GUI contexts across macOS updates.

| Dependency | LaunchDaemon | LaunchAgent |
|------------|--------------|-------------|
| Node.js gateway | Works | Works |
| OrbStack Docker socket | Requires bootstrapping OrbStack's helper (see above) | OrbStack runs in same user domain — socket always available |
| Playwright (browser agent) | Works headless; can break across macOS updates | Reliable — has GUI framework access |

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
      <string>YOUR_GATEWAY_TOKEN_HERE</string>
      <key>ANTHROPIC_API_KEY</key>
      <string>YOUR_ANTHROPIC_KEY_HERE</string>
      <key>BRAVE_API_KEY</key>
      <string>YOUR_BRAVE_KEY_HERE</string>
      <key>GITHUB_TOKEN</key>
      <string>YOUR_GITHUB_TOKEN_HERE</string>
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

See [OpenClaw sandboxing docs](https://docs.openclaw.ai/gateway/sandboxing) for full Docker configuration.

### Option: Multi-user channel separation

For stricter channel isolation without VMs, run one gateway per channel under separate OS users:

```
Host (macOS or Linux)
  ├── openclaw-wa user (non-admin)
  │    └── Gateway (port 18789): main+whatsapp + search [+ browser]
  └── openclaw-sig user (non-admin)
       └── Gateway (port 18790): main+signal + search [+ browser]
```

Each gateway is a small 2–3 agent instance (channel-connected main agent + search + optionally browser). Different UIDs mean a compromised channel can't read the other's config, credentials, or sessions (`chmod 700` home directories).

> **Naming convention:** The names `openclaw-wa`/`openclaw-sig` are channel-based examples. You may prefer identity-based names (e.g., the user's name or the agent's purpose) since channels might change but agent identity persists.

#### Create users

**macOS:**
```bash
sudo sysadminctl -addUser openclaw-wa -fullName "OpenClaw WhatsApp" -password "<temp>" \
  -home /Users/openclaw-wa -shell /bin/zsh
sudo sysadminctl -addUser openclaw-sig -fullName "OpenClaw Signal" -password "<temp>" \
  -home /Users/openclaw-sig -shell /bin/zsh
sudo passwd openclaw-wa && sudo passwd openclaw-sig

sudo mkdir -p /Users/openclaw-wa /Users/openclaw-sig
sudo chown -R openclaw-wa:staff /Users/openclaw-wa
sudo chown -R openclaw-sig:staff /Users/openclaw-sig
```

**Linux:**
```bash
sudo useradd -m -s /bin/bash openclaw-wa
sudo useradd -m -s /bin/bash openclaw-sig
sudo passwd openclaw-wa && sudo passwd openclaw-sig

# Docker sandboxing
sudo usermod -aG docker openclaw-wa
sudo usermod -aG docker openclaw-sig
```

Follow the standard [Install OpenClaw](#install-openclaw), [gateway.mode](#required-config-gatewaymode), [log directory](#log-directory), and [file permissions](#file-permissions) steps for each user — substituting `openclaw-wa`/`openclaw-sig` for `openclaw` and using the appropriate home directory.

> **Homebrew shared binaries:** In a multi-user setup, all users share `/opt/homebrew`. See the [Homebrew warning](#installation-scope) above for mitigation.

#### Port assignment

Each gateway needs a unique port:

| User | Port | Label (macOS) | Service (Linux) |
|------|------|---------------|-----------------|
| `openclaw-wa` | 18789 | `ai.openclaw.gateway.wa` | `openclaw-gateway-wa` |
| `openclaw-sig` | 18790 | `ai.openclaw.gateway.sig` | `openclaw-gateway-sig` |

#### Service files

Create one LaunchDaemon (macOS) or systemd unit (Linux) per user. Use the same templates from the [LaunchDaemon](#macos-launchdaemon) / [systemd](#linux-systemd) sections, changing per instance:

- `UserName` / `User` → channel-specific user (`openclaw-wa` or `openclaw-sig`)
- `--port` and `OPENCLAW_GATEWAY_PORT` → assigned port
- `Label` / service name → channel-specific (see table above)
- `HOME`, `OPENCLAW_HOME`, log paths → user's home directory

#### Config per user

Each user gets their own `openclaw.json` with only the relevant channel, agents, and bindings. Start from [`examples/openclaw.json`](../examples/config.md) and remove everything that belongs to the other channel.

> **Tool deny/allow split:** When a gateway has mixed tool needs (main agent denies web tools, search agent allows them), deny web tools at the **agent level** on the main agent — not globally. Global `tools.deny` overrides agent-level `tools.allow`, so a global deny on `web_search` breaks the search agent even if it has `web_search` in its `tools.allow`. See [Phase 4](phase-4-web-search.md) for the correct pattern.

> **Simplified workspace sync:** Since each channel-connected agent is the main agent of its own gateway (with full exec access), it can run `git` commands directly. The [delegation-based workspace git sync](phase-3-multi-agent.md#workspace-git-sync) — needed when channel agents lack exec in a single-gateway setup — is unnecessary here. Each agent manages its own workspace repo without `sessions_send`.

> **Trade-off:** Multiple gateways, configs, service files, and secrets to manage — but user-level isolation between channels without VM overhead. A root exploit still compromises all users (shared kernel). Both users share the Docker daemon if using Docker sandboxing.

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
            └── Gateway (port 18789): main + whatsapp + signal + googlechat + search + browser
```

Same 6-agent architecture as Docker isolation (main + channels + search + browser, `sessions_send` delegation), but with a VM boundary instead of an OS user boundary. No Docker inside the VM (macOS doesn't support nested virtualization).

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

Then follow [Phase 3](phase-3-multi-agent.md) and [Phase 4](phase-4-web-search.md) to configure the 6-agent gateway. Use [`examples/openclaw.json`](../examples/config.md) as a starting point.

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
      <string>YOUR_GATEWAY_TOKEN_HERE</string>
      <key>ANTHROPIC_API_KEY</key>
      <string>YOUR_ANTHROPIC_KEY_HERE</string>
      <key>BRAVE_API_KEY</key>
      <string>YOUR_BRAVE_KEY_HERE</string>
      <key>GITHUB_TOKEN</key>
      <string>YOUR_GITHUB_TOKEN_HERE</string>
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

#### Option: Two VMs for channel separation

For stricter isolation between channels, run one VM per channel (uses both macOS VM slots):

```
macOS Host (personal use, untouched)
  ├── VM 1 — "openclaw-wa" (4 agents: main + whatsapp + search + browser)
  └── VM 2 — "openclaw-sig" (4 agents: main + signal + search + browser)
```

Create both VMs:

**Lume:**
```bash
lume create openclaw-wa --os macos --ipsw latest \
  --cpu 4 --memory 8192 --disk-size 80 --unattended
lume create openclaw-sig --os macos --ipsw latest \
  --cpu 4 --memory 8192 --disk-size 80 --unattended
```

**Parallels:**
```bash
prlctl create openclaw-wa --ostype macos
prlctl set openclaw-wa --cpus 4 --memsize 8192
prlctl create openclaw-sig --ostype macos
prlctl set openclaw-sig --cpus 4 --memsize 8192
```

Follow the same dedicated user + LaunchDaemon setup inside each VM. Use [`examples/openclaw.json`](../examples/config.md) as a starting point — remove the signal agent/channel/binding from the WhatsApp VM and vice versa.

> **Trade-off:** Two separate gateways, two configs, double the resource usage, uses both VM slots. Main benefit: a compromise of one VM doesn't affect the other channel.

### VM Isolation: Linux VMs

> **Works on macOS and Linux hosts.** Combines VM host boundary with Docker sandbox inside.

Run OpenClaw inside a Linux VM with Docker. This gives the strongest combined isolation posture — kernel-level VM boundary from the host, plus Docker sandboxing for internal agent isolation.

```
Host (macOS or Linux, untouched)
  └── Linux VM — "openclaw-vm"
       └── openclaw user (no sudo, docker group)
            └── Gateway (port 18789): main + whatsapp + signal + googlechat + search + browser
                 ├── whatsapp (Docker sandbox, no network)
                 ├── signal (Docker sandbox, no network)
                 ├── googlechat (Docker sandbox, no network)
                 ├── search (Docker sandbox, no filesystem)
                 └── browser (Docker sandbox, no filesystem)
```

Same 6-agent architecture as Docker isolation, but running inside a VM. Docker closes the `read→exfiltrate` chain; the VM boundary protects the host. No macOS 2-VM limit — run as many Linux VMs as resources allow.

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

Same configuration as Docker isolation — see [Firewall](#firewall) and [Tailscale: Private Networking](#tailscale-private-networking). Apply inside the Linux VM (UFW/iptables) and optionally install Tailscale inside the VM for remote access.

#### Option: multiple VMs

Unlike macOS VMs (limited to 2 per host), Linux VMs have no artificial limit. Run one VM per channel for maximum isolation:

```bash
multipass launch --name openclaw-wa --cpus 2 --memory 2G --disk 20G
multipass launch --name openclaw-sig --cpus 2 --memory 2G --disk 20G
```

Follow the same dedicated user + systemd + Docker setup inside each VM.

---

## Linux: systemd

> **Applies to:** Docker isolation on Linux hosts **and** inside Linux VMs (same systemd unit, same user setup).

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

## Secrets Management

Keep `openclaw.json` secrets-free — use `${ENV_VAR}` references in config, store actual values in the service plist (macOS) or environment file (Linux). This applies to both deployment options.

### Secrets to externalize

| Secret | Env var | Notes |
|--------|---------|-------|
| Gateway token | `OPENCLAW_GATEWAY_TOKEN` | Included in all plist/systemd examples above |
| Anthropic API key | `ANTHROPIC_API_KEY` | SDK reads from env directly |
| Brave search key | `BRAVE_API_KEY` | Referenced as `${BRAVE_API_KEY}` in config |
| OpenRouter key | `OPENROUTER_API_KEY` | If using Perplexity via OpenRouter |
| GitHub token | `GITHUB_TOKEN` | Fine-grained PAT — see [GitHub token setup](#github-token-setup) below |
| *(web-guard & channel-guard use local ONNX models — no API keys needed)* | | See [plugin setup](phase-4-web-search.md#advanced-prompt-injection-guard) |

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

**Two VMs** — automate with a deploy script:
```bash
#!/bin/bash
# ~/openclaw-deploy-secrets.sh — chmod 700

SECRETS=(
  "ANTHROPIC_API_KEY=sk-ant-..."
  "BRAVE_API_KEY=BSA..."
  "OPENCLAW_GATEWAY_TOKEN=your-gateway-token"
  "GITHUB_TOKEN=github_pat_..."
)

SSH_CMD="lume ssh"   # Or: prlctl exec
PLIST=/Library/LaunchDaemons/ai.openclaw.gateway.plist

for VM in openclaw-wa openclaw-sig; do
  for SECRET in "${SECRETS[@]}"; do
    KEY="${SECRET%%=*}"
    VALUE="${SECRET#*=}"
    $SSH_CMD "$VM" -- sudo /usr/libexec/PlistBuddy \
      -c "Set :EnvironmentVariables:$KEY $VALUE" "$PLIST"
  done
  $SSH_CMD "$VM" -- sudo launchctl bootout system/ai.openclaw.gateway 2>/dev/null
  $SSH_CMD "$VM" -- sudo launchctl bootstrap system "$PLIST"
  $SSH_CMD "$VM" -- sudo chmod 600 "$PLIST"
done
```

> **No shared directory needed** — secrets are pushed via SSH, so the VM isolation boundary stays intact.

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

---

## macOS Companion App

If you install the OpenClaw macOS app (Docker isolation — on host), create this marker file **before** installing to prevent it from starting its own gateway:

```bash
sudo -u openclaw touch /Users/openclaw/.openclaw/disable-launchagent
```

The app will attach to the existing gateway in read-only mode.

Alternative (per-launch): `open -a OpenClaw --args --attach-only`

> **VM isolation:** The companion app runs on your host macOS. Point it at the VM's gateway via `--gateway-url http://<vm-ip>:18789` (requires the gateway to bind to the VM's interface, not just loopback).

---

## Signal Setup

Signal requires `signal-cli` (Java-based) linked as a device.

### Install

**macOS:**
```bash
brew install signal-cli   # requires Java
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

# Health check
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
/Users/openclaw/.openclaw/logs/gateway.log     openclaw:staff  644  7  1024  *  J
/Users/openclaw/.openclaw/logs/gateway.err.log openclaw:staff  644  7  1024  *  J
```

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

```bash
# Delete sessions older than 30 days
sudo -u openclaw find /Users/openclaw/.openclaw/agents/*/sessions -name "*.jsonl" -mtime +30 -delete
```

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

→ **[Reference](../reference.md)** — config cheat sheet, tool list, gotchas, emergency procedures

Or review:
- [Examples](../examples/) — complete config and security audit
