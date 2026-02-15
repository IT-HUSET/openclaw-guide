# Docker Isolation Setup Scripts

Automates the [recommended Docker isolation deployment](../../content/docs/phases/phase-6-deployment.md#docker-isolation) for a dedicated macOS machine. Supports single-gateway (one user, all channels) and multi-gateway (separate user per channel for stronger isolation).

## Architecture

### Single gateway (default)

```
Host (macOS, dedicated machine)
  └── Dedicated `openclaw` user (non-admin, chmod 700 home)
       └── Single OpenClaw gateway (port 18789)
            ├── main (unsandboxed, full access)
            ├── whatsapp (Docker sandbox, no network)
            ├── signal (Docker sandbox, no network)
            ├── search (isolated — web_search only, no filesystem)
            └── browser (isolated — browser only, no filesystem)
```

### Multi-gateway (channel separation)

```
Host (macOS, dedicated machine)
  ├── Dedicated `openclaw-wa` user (non-admin, chmod 700 home)
  │    └── Gateway instance "wa" (port 18789)
  │         ├── main (unsandboxed, full access)
  │         ├── whatsapp (Docker sandbox, no network)
  │         ├── search (isolated)
  │         └── browser (isolated)
  │
  └── Dedicated `openclaw-sig` user (non-admin, chmod 700 home)
       └── Gateway instance "sig" (port 18790)
            ├── main (unsandboxed, full access)
            ├── signal (Docker sandbox, no network)
            ├── search (isolated)
            └── browser (isolated)
```

Multi-gateway provides stronger isolation: each channel runs under a separate OS user with its own gateway, config, credentials, and API tokens. A compromised WhatsApp agent cannot access Signal credentials (or vice versa).

## Prerequisites

- macOS 14+ (Apple Silicon or Intel)
- Admin user access (for `sudo`)
- API keys ready: Anthropic (required), Brave or OpenRouter (search), GitHub PAT (optional)
- A phone with WhatsApp and/or Signal

## Quick Start

```bash
# 1. Install prerequisites, plan instances, create dedicated user(s), enable firewall
bash scripts/docker-isolation/01-setup-host.sh

# 2. Configure gateway(s), directories, workspaces, LaunchDaemon plist(s)
sudo bash scripts/docker-isolation/02-setup-gateway.sh

# 3. Inject secrets, start daemon(s), verify
sudo bash scripts/docker-isolation/03-deploy-secrets.sh
```

Script 01 asks whether to run single or multi-gateway. The choice is saved to `.instances` and consumed by scripts 02 and 03 automatically.

## Instance Planning

During script 01, you'll be asked:

```
How many gateway instances?

  1) Single gateway (recommended) — one user, all channels, multi-agent
  2) Multiple gateways — separate user per channel for stronger isolation
```

**Single gateway** creates one `openclaw` user with all agents — the simplest setup.

**Multiple gateways** prompts for each instance:
- **Name** — short identifier (e.g. `wa`, `sig`)
- **Channel** — WhatsApp, Signal, or Both
- **Port** — gateway port (auto-increments from 18789)
- **Browser agent** — optional per instance

The plan is confirmed before proceeding, and saved to `scripts/docker-isolation/.instances`.

### Per-instance values

| Value | Single | Multi (per instance) |
|-------|--------|---------------------|
| OS user | `openclaw` | `openclaw-{name}` |
| Home dir | `/Users/openclaw` | `/Users/openclaw-{name}` |
| Gateway port | 18789 | 18789, 18790, ... |
| Browser CDP port | 18800 | 18800, 18801, ... |
| Plist label | `ai.openclaw.gateway` | `ai.openclaw.gateway.{name}` |
| Gateway token | one | unique per instance |
| Config | full multi-agent JSON5 | filtered JSON per instance |

## Environment Variables

Override defaults by exporting before running (single-instance fallback only — ignored when `.instances` exists):

| Variable | Default | Used by |
|----------|---------|---------|
| `OPENCLAW_USER` | `openclaw` | All scripts |
| `GATEWAY_PORT` | `18789` | 02, 03 |
| `PLIST_PATH` | `/Library/LaunchDaemons/ai.openclaw.gateway.plist` | 03 |

## What Gets Created

### Single instance

```
/Users/openclaw/                          # chmod 700
  └── .openclaw/                          # chmod 700
       ├── openclaw.json                  # Config (from examples/, JSON5 with comments)
       ├── disable-launchagent
       ├── logs/
       ├── credentials/{whatsapp,signal}/
       ├── agents/{main,whatsapp,signal,search,browser}/agent/
       ├── workspaces/{main,whatsapp,signal,search,browser}/
       ├── identity/
       └── devices/

/Library/LaunchDaemons/ai.openclaw.gateway.plist
```

### Multi-instance (example: wa + sig)

```
/Users/openclaw-wa/.openclaw/             # Only whatsapp channel + agents
/Users/openclaw-sig/.openclaw/            # Only signal channel + agents

/Library/LaunchDaemons/ai.openclaw.gateway.wa.plist
/Library/LaunchDaemons/ai.openclaw.gateway.sig.plist

scripts/docker-isolation/.instances       # Instance definitions
```

Multi-instance configs are generated from `examples/openclaw.json` — filtered to include only the relevant agents, channels, bindings, and plugins per instance. Comments are stripped (configs are auto-generated, not hand-maintained).

## Plugins

Scripts install three plugins from `extensions/` per instance:

- **web-guard** — pre-fetch prompt injection scanning for `web_fetch`
- **channel-guard** — prompt injection scanning for incoming channel messages
- **image-gen** — image generation via OpenRouter (needs `OPENROUTER_API_KEY`)

The ONNX model (~370MB, shared by web-guard and channel-guard) downloads on first gateway start.

## After Setup

### Channel Pairing

**WhatsApp:** The gateway shows a QR code in logs on first start. Scan with WhatsApp > Linked Devices.
```bash
# Single instance
sudo tail -f /Users/openclaw/.openclaw/logs/gateway.log
# Multi-instance
sudo tail -f /Users/openclaw-wa/.openclaw/logs/gateway.log
```

**Signal:** Link as a secondary device:
```bash
# Single instance
sudo -u openclaw signal-cli link -n "OpenClaw"
# Multi-instance
sudo -u openclaw-sig signal-cli link -n "OpenClaw"
```

### Customize SOUL.md

```bash
# Single instance
sudo -u openclaw vi /Users/openclaw/.openclaw/workspaces/main/SOUL.md
# Multi-instance
sudo -u openclaw-wa vi /Users/openclaw-wa/.openclaw/workspaces/main/SOUL.md
sudo -u openclaw-sig vi /Users/openclaw-sig/.openclaw/workspaces/main/SOUL.md
```

### Workspace Git Sync

Initialize git repos in workspaces that hold persistent state (typically `main` — search and browser agents are sandboxed with no persistent workspace worth tracking):

```bash
# Single instance
OC_USER=openclaw
WS_DIR="/Users/$OC_USER/.openclaw/workspaces/main"

sudo -u "$OC_USER" git -C "$WS_DIR" init
sudo -u "$OC_USER" git -C "$WS_DIR" config user.name "OpenClaw"
sudo -u "$OC_USER" git -C "$WS_DIR" config user.email "openclaw@localhost"

sudo -u "$OC_USER" tee "$WS_DIR/.gitignore" > /dev/null << 'EOF'
.DS_Store
.env
**/*.key
**/*.pem
**/secrets*
EOF

sudo -u "$OC_USER" git -C "$WS_DIR" add .
sudo -u "$OC_USER" git -C "$WS_DIR" commit -m "Initial workspace"

# Optional: push to private remote (requires GITHUB_TOKEN in environment)
sudo -u "$OC_USER" git -C "$WS_DIR" remote add origin https://github.com/YOUR_ORG/openclaw-workspace-main.git
sudo -u "$OC_USER" git -C "$WS_DIR" push -u origin main
```

For multi-instance setups, repeat for each instance user (e.g. `OC_USER=openclaw-wa`).

See [Phase 4: Workspace Git Sync](../../content/docs/phases/phase-4-multi-agent.md#workspace-git-sync) for scheduled sync setup (HEARTBEAT.md or cron).

### Log Rotation

Add to `/etc/newsyslog.d/openclaw.conf`:
```
# Single instance
/Users/openclaw/.openclaw/logs/gateway.log     openclaw:staff  644  7  1024  *  J
/Users/openclaw/.openclaw/logs/gateway.err.log openclaw:staff  644  7  1024  *  J

# Multi-instance — add per user
/Users/openclaw-wa/.openclaw/logs/gateway.log     openclaw-wa:staff  644  7  1024  *  J
/Users/openclaw-wa/.openclaw/logs/gateway.err.log openclaw-wa:staff  644  7  1024  *  J
/Users/openclaw-sig/.openclaw/logs/gateway.log     openclaw-sig:staff  644  7  1024  *  J
/Users/openclaw-sig/.openclaw/logs/gateway.err.log openclaw-sig:staff  644  7  1024  *  J
```

## Troubleshooting

**Daemon not starting:**
```bash
# Single instance
sudo launchctl print system/ai.openclaw.gateway 2>&1 | head -20
sudo tail -50 /Users/openclaw/.openclaw/logs/gateway.err.log
sudo -u openclaw openclaw doctor

# Multi-instance (replace {name} with instance name)
sudo launchctl print system/ai.openclaw.gateway.{name} 2>&1 | head -20
sudo tail -50 /Users/openclaw-{name}/.openclaw/logs/gateway.err.log
sudo -u openclaw-{name} openclaw doctor
```

**Docker sandbox not working:**
```bash
docker info
# Re-bootstrap OrbStack helper per user
sudo launchctl bootstrap gui/$(id -u openclaw) /Library/LaunchAgents/com.orbstack.helper.plist
# Multi-instance
sudo launchctl bootstrap gui/$(id -u openclaw-wa) /Library/LaunchAgents/com.orbstack.helper.plist
```

**Port already in use:**
```bash
sudo lsof -i :18789
# Multi-instance — check all ports
sudo lsof -i :18789 -i :18790
```

**Key rotation (re-run script 03):**
```bash
sudo bash scripts/docker-isolation/03-deploy-secrets.sh
# Stops all daemons, prompts for new secrets, generates new tokens, restarts
```

**Verify multi-instance setup:**
```bash
# Check users exist
id openclaw-wa && id openclaw-sig

# Check plists exist
ls /Library/LaunchDaemons/ai.openclaw.gateway.*.plist

# Check daemons running
sudo launchctl print system/ai.openclaw.gateway.wa
sudo launchctl print system/ai.openclaw.gateway.sig

# Check ports listening
sudo lsof -i :18789 -i :18790

# Check plugins installed
sudo -u openclaw-wa openclaw plugins list
sudo -u openclaw-sig openclaw plugins list
```

## Config Source

Full annotated multi-agent config: [`examples/openclaw.json`](../../examples/openclaw.json)

Security trade-off analysis: [Security: Deployment Isolation Options](../../content/docs/phases/phase-3-security.md#deployment-isolation-options)
