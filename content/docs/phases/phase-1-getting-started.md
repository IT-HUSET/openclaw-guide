---
title: "Phase 1 — Getting Started"
description: "Install OpenClaw, connect WhatsApp, and verify your first agent."
weight: 10
---

Get a working OpenClaw agent in minutes. 

> **IMPORTANT NOTE:**   
> This phase installs on your personal user account for _**learning and evaluation**_ — **production deployment** to a dedicated user or VM is covered in **[Phase 6](phase-6-deployment.md)**.

---

## Prerequisites

- **Node.js 22+** and npm
- **macOS** (primary) or Linux
- A phone with WhatsApp (simplest channel to start with)

> **Linux:** Install Node.js via your package manager or [nvm](https://github.com/nvm-sh/nvm). All commands below work identically.
> On Ubuntu/Debian: `curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs`

---

## Deployment Decision

Before installing, decide where OpenClaw will run:

| Path | Where you install | When to choose |
|------|-------------------|----------------|
| **Quick start** (below) | Your personal user account | Evaluating, developing, learning |
| **Production** ([Phase 6](phase-6-deployment.md)) | Dedicated user or VM | Dedicated machine, always-on service |

> **Setting up a dedicated machine (e.g. Mac Mini)?** Skip straight to [Phase 6: Deployment](phase-6-deployment.md) — it covers installation in the right place for each isolation model. Installing here first means moving files later. For the recommended Docker isolation setup, the [`scripts/docker-isolation/`](https://github.com/IT-HUSET/openclaw-guide/tree/main/scripts/docker-isolation/) scripts automate the entire process.

Continuing below installs on your personal user — you can follow Phases 3–5 to learn the platform, then migrate to a dedicated user/VM in Phase 6.

---

## Install OpenClaw (Quick Start)

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

The installer runs `npm install -g openclaw`, placing it in the global npm prefix:
- **macOS (Homebrew Node):** binary at `/opt/homebrew/bin/openclaw`, package in `/opt/homebrew/lib/node_modules/openclaw`
- **Linux:** typically `/usr/local/bin/openclaw` and `/usr/local/lib/node_modules/openclaw`

All users in the `staff` group (macOS default) can run the binary — relevant if you later create a dedicated `openclaw` user (see [Phase 6](phase-6-deployment.md)).

Verify:
```bash
openclaw --version
```

---

## First-Time Setup

```bash
openclaw setup
```

This creates `~/.openclaw/` with:
- `openclaw.json` — main configuration file
- `workspace/` — your agent's home (AGENTS.md, SOUL.md, etc.)
- `agents/main/` — default agent state and session store
- `identity/` — device identity for gateway auth

Follow the interactive prompts to:
1. Choose your AI provider (Anthropic recommended)
2. Enter your API key
3. Configure basic settings

---

## Connect WhatsApp

WhatsApp is the easiest channel to start with — just scan a QR code.

### 1. Add minimal WhatsApp config

Edit `~/.openclaw/openclaw.json` and add:

```json
{
  "channels": {
    "whatsapp": {
      "dmPolicy": "allowlist",
      "allowFrom": ["+YOUR_PHONE_NUMBER"]
    }
  }
}
```

Replace `+YOUR_PHONE_NUMBER` with your phone number in E.164 format (e.g., `+15551234567`).

### 2. Link WhatsApp

```bash
openclaw channels login
```

This shows a QR code. Scan it with **WhatsApp > Linked Devices > Link a Device**.

> **Tip:** If the QR code expires, run `openclaw channels login` again.

### 3. Start the gateway

```bash
openclaw start
```

---

## Verify It Works

Send a message to your agent via WhatsApp:

> "Hello, what can you do?"

The agent should respond based on its default AGENTS.md instructions. If you get a response, your setup is working.

Run diagnostics:
```bash
openclaw doctor                  # Check for config issues
openclaw health                  # Gateway health check
```

View logs:
```bash
openclaw logs
```

---

## Directory Structure

After setup, your OpenClaw installation looks like this:

```
~/.openclaw/
├── openclaw.json                    # Main config — all settings live here
├── workspace/                       # Agent's home directory
│   ├── AGENTS.md                    # Operating procedures (always loaded)
│   ├── SOUL.md                      # Identity, personality, values, boundaries
│   ├── USER.md                      # About the human (main session only)
│   ├── IDENTITY.md                  # Agent name, creature type, vibe, emoji
│   ├── TOOLS.md                     # Environment-specific notes
│   ├── HEARTBEAT.md                 # Proactive task checklist
│   ├── BOOTSTRAP.md                 # First-run onboarding (self-deletes)
│   └── memory/                      # Persistent memory storage
├── agents/
│   └── main/
│       ├── agent/
│       │   └── auth-profiles.json   # API credentials for this agent
│       └── sessions/                # Chat history (one .jsonl per session)
├── credentials/
│   └── whatsapp/                    # WhatsApp session data
└── identity/
    ├── device.json                  # Device identity
    └── device-auth.json             # Gateway auth tokens
```

---

## Workspace Files

These markdown files in `workspace/` shape your agent's behavior:

| File | Purpose | When loaded |
|------|---------|-------------|
| **AGENTS.md** | Operating procedures — startup ritual, workflows, safety guidelines | Every session |
| **SOUL.md** | Identity, personality, values, boundaries | Every session |
| **USER.md** | About the human — name, timezone, preferences, context | Main session only |
| **IDENTITY.md** | Agent metadata — name, creature type, vibe, emoji, avatar | Referenced as needed |
| **TOOLS.md** | Environment-specific notes — camera names, SSH hosts, device nicknames | Every session |
| **HEARTBEAT.md** | Proactive task checklist | Heartbeat cycle (~30 min) |
| **MEMORY.md** | Curated long-term memory — durable facts, decisions, lessons. Not auto-created; the agent creates it over time. See [Phase 2](phase-2-memory.md) | Main session only |
| **BOOTSTRAP.md** | First-run onboarding script — self-deletes when done | First run only |
| **BOOT.md** | Startup automation hooks (requires `hooks.internal.enabled`) | On startup |

Subagent sessions (groups, shared contexts) only load `AGENTS.md` and `TOOLS.md` — no personal context.

Edit these files to customize your agent. Start with `AGENTS.md` and `SOUL.md` — they have the most impact.

---

## What Just Happened

Here's the architecture in brief:

```
You (WhatsApp) → OpenClaw Gateway → AI Provider (Anthropic) → Response → You
```

- **Gateway** is a local Node.js process (default port 18789) that bridges messaging channels to AI providers
- **Workspace files** (AGENTS.md, SOUL.md, etc.) are injected as system context (which files depends on session type — see table above)
- **Sessions** are per-conversation chat histories stored as `.jsonl` files
- **Tools** are capabilities the agent can use (file read/write, web search, code execution, etc.)

The gateway runs on your machine and connects outbound to WhatsApp servers and your AI provider. Nothing is exposed to the internet.

---

## Next Steps

Your agent works, but it's running with default settings. Next:

→ **[Phase 2: Memory & Search](phase-2-memory.md)** — give your agent persistent memory and semantic search

Then lock it down:

→ **[Phase 3: Security](phase-3-security.md)** — secure defaults before going further

When you're ready:
- [Phase 4: Multi-Agent](phase-4-multi-agent.md) — run multiple agents with different roles
- [Phase 5: Web Search Isolation](phase-5-web-search.md) — safe internet access
- [Phase 6: Deployment](phase-6-deployment.md) — run as a system service (includes migration from this quick-start setup)
- [Reference](../reference.md) — config cheat sheet, tool list, gotchas
