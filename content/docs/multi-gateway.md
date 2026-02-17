---
title: "Multi-Gateway Deployments"
weight: 85
---

Running multiple gateway instances gives process-level isolation between channels or identities. Each instance gets its own config, workspaces, secrets, and channels — fully independent core agents (main + search) per gateway.

---

## When to Use Multiple Gateways

A single gateway handles multiple channels and agents. Multiple gateways add operational overhead — only use them when you need one of these:

| Use case | Example |
|----------|---------|
| Separate personal vs work channels | WhatsApp on one gateway, Signal on another |
| Different personality/SOUL.md per channel | Different agents with different identities |
| Channel-level process isolation | Separate crash domains, separate OS users or VMs |
| Different API keys per channel | Billing separation |

**Three approaches, from simplest to most isolated:**

| Approach | Isolation | Complexity | When to use |
|----------|-----------|------------|-------------|
| [**Profiles**](#profiles-recommended) *(recommended)* | Process-level (same UID) | Low | Default choice — separate state, minimal setup |
| [**Multi-user**](#multi-user) | OS user boundary | Medium | Compliance/regulatory UID separation, different trust levels |
| [**VM variants**](#vm-variants) | Kernel-level | High | Maximum isolation between channels |

---

## Profiles (Recommended)

The `--profile <name>` CLI flag creates a fully scoped gateway instance with its own state directory. No extra OS users needed — the simplest multi-gateway approach.

### How it works

Each profile gets an auto-scoped state directory at `~/.openclaw-<name>/`, completely separate from the default `~/.openclaw/`. The profile flag applies to all CLI commands:

> **Shared UID risk:** All profiles run as the same OS user. A compromised agent in one profile can read another profile's config and credentials (`~/.openclaw-<name>/`). For UID-level isolation, use [multi-user](#multi-user) instead.

```bash
# Setup a new profile
openclaw --profile wa setup

# Start the gateway for this profile
openclaw --profile wa start --port 18789

# Doctor, channels, etc. — all profile-scoped
openclaw --profile wa doctor
openclaw --profile wa channels login
```

### Architecture

```
Host (macOS or Linux)
  └── openclaw user (non-admin)
       ├── ~/.openclaw-wa/     ← Profile "wa" (port 18789)
       │    └── Gateway: main + whatsapp + search
       └── ~/.openclaw-sig/    ← Profile "sig" (port 18810)
            └── Gateway: main + signal + search
```

Both gateways run as the same OS user but are fully independent processes with separate configs, workspaces, sessions, and credentials.

### Setup

**1. Create profiles:**

```bash
openclaw --profile wa setup
openclaw --profile sig setup
```

**2. Configure each profile:**

Each profile has its own `openclaw.json`. Start from [`examples/openclaw.json`](examples/config.md) and keep only the relevant channel, agents, and bindings per profile:

- `~/.openclaw-wa/openclaw.json` — WhatsApp channel + agents only
- `~/.openclaw-sig/openclaw.json` — Signal channel + agents only

**3. Port spacing:**

Each gateway needs a unique port. Leave a gap of >= 20 between ports to accommodate CDP port ranges (the browser tool uses `cdpPort` near the gateway port):

| Profile | Gateway port | CDP port |
|---------|-------------|----------|
| `wa` | 18789 | 18800 |
| `sig` | 18810 | 18820 |

**4. Service files:**

Create one LaunchAgent (macOS) or systemd unit (Linux) per profile. Use the same templates from [Phase 6](phases/phase-6-deployment.md#macos-launchagent), adding `--profile` to the program arguments. For the hardened LaunchDaemon alternative, see [Phase 6: LaunchDaemon](phases/phase-6-deployment.md#hardened-alternative-launchdaemon).

**macOS LaunchAgent** (`~/Library/LaunchAgents/ai.openclaw.gateway.wa.plist`):

```bash
tee ~/Library/LaunchAgents/ai.openclaw.gateway.wa.plist > /dev/null << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>ai.openclaw.gateway.wa</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ProgramArguments</key>
    <array>
      <string>/opt/homebrew/bin/node</string>
      <string>/opt/homebrew/lib/node_modules/openclaw/dist/index.js</string>
      <string>--profile</string>
      <string>wa</string>
      <string>gateway</string>
      <string>--port</string>
      <string>18789</string>
    </array>
    <key>StandardOutPath</key>
    <string>/Users/openclaw/.openclaw-wa/logs/gateway.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/openclaw/.openclaw-wa/logs/gateway.err.log</string>
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

> **Secrets:** Replace `YOUR_*_HERE` placeholders with real values — see [Secrets Management](phases/phase-6-deployment.md#secrets-management). Each profile needs its own `OPENCLAW_GATEWAY_TOKEN`.

**systemd** (`/etc/systemd/system/openclaw-gateway-wa.service`):

Same as the [standard systemd unit](phases/phase-6-deployment.md#linux-systemd), adding `--profile wa` before `gateway` in `ExecStart`:

```
ExecStart=/usr/bin/node /usr/lib/node_modules/openclaw/dist/index.js --profile wa gateway --port 18789
```

**5. Git config per profile:**

Profile state directories don't inherit the user's global `~/.gitconfig`. Set `GIT_CONFIG_GLOBAL` in each service file's environment to point at a shared or per-profile git config:

```xml
<key>GIT_CONFIG_GLOBAL</key>
<string>/Users/openclaw/.gitconfig</string>
```

Or create per-profile git configs if profiles need different identities.

**6. Manage services:**

```bash
# Start profiles
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.openclaw.gateway.wa.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.openclaw.gateway.sig.plist

# Stop
launchctl bootout gui/$(id -u)/ai.openclaw.gateway.wa
launchctl bootout gui/$(id -u)/ai.openclaw.gateway.sig

# Status
launchctl print gui/$(id -u)/ai.openclaw.gateway.wa 2>&1 | head -10
launchctl print gui/$(id -u)/ai.openclaw.gateway.sig 2>&1 | head -10
```

### Shared vs per-profile resources

| Resource | Shared | Per-profile |
|----------|--------|-------------|
| Node.js / OpenClaw binary | Shared | — |
| OS user | Shared (same UID) | — |
| Docker daemon | Shared | — |
| `openclaw.json` | — | Per-profile (`~/.openclaw-<name>/`) |
| Workspaces | — | Per-profile |
| Sessions | — | Per-profile |
| Credentials (WhatsApp/Signal) | — | Per-profile |
| Auth profiles | — | Per-profile |
| Memory | — | Per-profile |
| Secrets (env vars in plist) | — | Per-profile |
| `GITHUB_TOKEN` | Can share | Can differ |

> **Security:** Profiles run as the same UID — there's no filesystem boundary between them. A compromised agent in one profile can read the other profile's `~/.openclaw-<name>/` directory. Both profiles also share the Docker daemon if using Docker sandboxing. For UID-level isolation, use [Multi-user](#multi-user) instead. For kernel-level isolation, use [VM variants](#vm-variants).

---

## Multi-User

For stricter channel isolation without VMs, run one gateway per channel under separate OS users. Different UIDs mean a compromised channel can't read the other's config, credentials, or sessions (`chmod 700` home directories).

### When to use

- Compliance or regulatory requirements for UID separation
- Different trust levels per channel (e.g., public-facing vs internal)
- You want filesystem boundaries between gateway instances

### Architecture

```
Host (macOS or Linux)
  ├── openclaw-wa user (non-admin)
  │    └── Gateway (port 18789): main + whatsapp + search
  └── openclaw-sig user (non-admin)
       └── Gateway (port 18790): main + signal + search
```

Each gateway is a small 2–3 agent instance (channel-connected main agent + search, plus optional channel agents).

> **Naming convention:** The names `openclaw-wa`/`openclaw-sig` are channel-based examples. You may prefer identity-based names (e.g., the user's name or the agent's purpose) since channels might change but agent identity persists.

### Create users

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

Follow the standard [Install OpenClaw](phases/phase-6-deployment.md#install-openclaw), [gateway.mode](phases/phase-6-deployment.md#required-config-gatewaymode), [log directory](phases/phase-6-deployment.md#log-directory), and [file permissions](phases/phase-6-deployment.md#file-permissions) steps for each user — substituting `openclaw-wa`/`openclaw-sig` for `openclaw` and using the appropriate home directory.

> **Homebrew shared binaries:** In a multi-user setup, all users share `/opt/homebrew`. See the [Homebrew warning](phases/phase-6-deployment.md#installation-scope) for mitigation.

### Port assignment

Each gateway needs a unique port:

| User | Port | Label (macOS) | Service (Linux) |
|------|------|---------------|-----------------|
| `openclaw-wa` | 18789 | `ai.openclaw.gateway.wa` | `openclaw-gateway-wa` |
| `openclaw-sig` | 18810 | `ai.openclaw.gateway.sig` | `openclaw-gateway-sig` |

> **Port spacing:** Leave a gap of >= 20 between gateway ports to accommodate CDP port ranges — see the [port spacing reference](#port-spacing-reference) table below.

### Service files

Create one LaunchAgent (macOS) or systemd unit (Linux) per user. Use the same templates from the [LaunchAgent](phases/phase-6-deployment.md#macos-launchagent) / [systemd](phases/phase-6-deployment.md#linux-systemd) sections, changing per instance:

- `User` (systemd) or `UserName` (LaunchDaemon only) → channel-specific user (`openclaw-wa` or `openclaw-sig`). LaunchAgent doesn't need this — it runs in the user's own domain.
- `--port` and `OPENCLAW_GATEWAY_PORT` → assigned port
- `Label` / service name → channel-specific (see table above)
- `HOME`, `OPENCLAW_HOME`, log paths → user's home directory

### Config per user

Each user gets their own `openclaw.json` with only the relevant channel, agents, and bindings. Start from [`examples/openclaw.json`](examples/config.md) and remove everything that belongs to the other channel.

> **Tool deny/allow split:** When a gateway has mixed tool needs (main agent denies web tools, search agent allows them), deny web tools at the **agent level** on the main agent — not globally. Global `tools.deny` overrides agent-level `tools.allow`, so a global deny on `web_search` breaks the search agent even if it has `web_search` in its `tools.allow`. For details on how `allow` and `deny` lists interact, see [Phase 5 — Deny web tools per-agent](phases/phase-5-web-search.md#1-deny-web-tools-per-agent).

> **Simplified workspace sync:** Workspace git sync (configured in [Phase 4](phases/phase-4-multi-agent.md#workspace-git-sync)) automatically commits agent workspace changes to git — useful for auditing and rollback. Since each channel-connected agent is the main agent of its own gateway (with full exec access), it can run `git` commands directly. The [delegation-based workspace git sync](phases/phase-4-multi-agent.md#workspace-git-sync) — needed when channel agents lack exec in a single-gateway setup — is unnecessary here. Each agent manages its own workspace repo without `sessions_send`.

> **Trade-off:** Multiple gateways, configs, service files, and secrets to manage — but user-level isolation between channels without VM overhead. A root exploit still compromises all users (shared kernel). Both users share the Docker daemon if using Docker sandboxing.

---

## VM Variants

For kernel-level isolation between gateway instances, run one VM per channel. The VM boundary means a fully compromised channel can't affect the other.

### Two macOS VMs

Uses both macOS VM slots (Apple limits macOS VMs to 2 per host):

```
macOS Host (personal use, untouched)
  ├── VM 1 — "openclaw-wa" (3 agents: main + whatsapp + search)
  └── VM 2 — "openclaw-sig" (3 agents: main + signal + search)
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

Follow the same [dedicated user + LaunchAgent](phases/phase-6-deployment.md#launchagent-inside-vm) setup inside each VM. Use [`examples/openclaw.json`](examples/config.md) as a starting point — remove the signal agent/channel/binding from the WhatsApp VM and vice versa.

> **Trade-off:** Two separate gateways, two configs, double the resource usage, uses both VM slots. Main benefit: a compromise of one VM doesn't affect the other channel.

### Multiple Linux VMs

Unlike macOS VMs (limited to 2 per host), Linux VMs have no artificial limit. Run one VM per channel for maximum isolation:

```bash
multipass launch --name openclaw-wa --cpus 2 --memory 2G --disk 20G
multipass launch --name openclaw-sig --cpus 2 --memory 2G --disk 20G
```

Follow the same [dedicated user + systemd + Docker](phases/phase-6-deployment.md#dedicated-user-inside-linux-vm) setup inside each VM.

### Multi-VM secrets automation

Automate secrets deployment across VMs with a deploy script. Uses `lume ssh` — for Parallels, replace with `prlctl exec` or regular `ssh user@<vm-ip>`:

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
PLIST=/Users/openclaw/Library/LaunchAgents/ai.openclaw.gateway.plist

for VM in openclaw-wa openclaw-sig; do
  OC_UID=$($SSH_CMD "$VM" -- id -u openclaw)
  for SECRET in "${SECRETS[@]}"; do
    KEY="${SECRET%%=*}"
    VALUE="${SECRET#*=}"
    $SSH_CMD "$VM" -- sudo -u openclaw /usr/libexec/PlistBuddy \
      -c "Set :EnvironmentVariables:$KEY $VALUE" "$PLIST"
  done
  $SSH_CMD "$VM" -- sudo launchctl bootout "gui/$OC_UID/ai.openclaw.gateway" 2>/dev/null
  $SSH_CMD "$VM" -- sudo launchctl bootstrap "gui/$OC_UID" "$PLIST"
  $SSH_CMD "$VM" -- chmod 600 "$PLIST"
done
```

For Linux VMs, push secrets to the systemd environment file instead:
```bash
multipass exec openclaw-vm -- sudo tee /etc/openclaw/secrets.env > /dev/null << 'EOF'
OPENCLAW_GATEWAY_TOKEN=your-gateway-token
ANTHROPIC_API_KEY=sk-ant-...
BRAVE_API_KEY=BSA...
GITHUB_TOKEN=github_pat_...
EOF
multipass exec openclaw-vm -- sudo chmod 600 /etc/openclaw/secrets.env
multipass exec openclaw-vm -- sudo systemctl restart openclaw-gateway
```

> **No shared directory needed** — secrets are pushed via SSH, so the VM isolation boundary stays intact.

---

## Security Comparison

| | **Profiles** | **Multi-user** | **VM variants** |
|--|---|---|---|
| Isolation boundary | Process-level (same UID) | OS user boundary | Kernel-level (VM) |
| Filesystem separation | Separate dirs, same user | `chmod 700` per home dir | VM boundary |
| Credential isolation | Convention-based | UID-enforced | VM-enforced |
| Cross-instance compromise | Trivial (same UID) | Requires root exploit | Requires VM escape |
| Docker daemon | Shared | Shared | Per-VM (or shared on host) |
| Resource overhead | Minimal | Minimal | 2-16 GB RAM per VM |
| Setup complexity | Low | Medium | High |
| Operational overhead | Low (one user) | Medium (multiple users, plists, secrets) | High (VMs + host management) |

### Which to choose?

- **Profiles** — default choice. Separate state with minimal setup. Good enough when channels are equally trusted and you want operational simplicity.
- **Multi-user** — when you need UID-enforced filesystem boundaries. Regulatory requirements, different trust levels between channels, or defense-in-depth against local privilege escalation.
- **VM variants** — when you need kernel-level isolation between channels. Maximum security posture, at the cost of significantly more infrastructure to manage.

### Port spacing reference

Leave a gap of >= 20 between gateway ports to accommodate CDP port ranges:

| Instance | Gateway port | CDP port | Notes |
|----------|-------------|----------|-------|
| First | 18789 | 18800 | Default |
| Second | 18810 | 18820 | +21 gap |
| Third | 18831 | 18840 | +21 gap |

---

## Deployment Checklist

Per gateway instance, regardless of approach:

- [ ] Separate state directory (profile), OS user, or VM
- [ ] Separate LaunchAgent/systemd unit (or LaunchDaemon for hardened/VM) with unique label/name and port
- [ ] Separate `openclaw.json` with only the relevant channels and agents
- [ ] Separate secrets (unique `OPENCLAW_GATEWAY_TOKEN` per instance)
- [ ] File permissions locked down (`chmod 700` home directory, `chmod 600` sensitive files)
- [ ] Port spacing verified (>= 20 gap for CDP ranges)
- [ ] Health check passing per instance

For automated Docker isolation setup on macOS, see the [setup scripts](https://github.com/IT-HUSET/openclaw-guide/tree/main/scripts/docker-isolation/).
