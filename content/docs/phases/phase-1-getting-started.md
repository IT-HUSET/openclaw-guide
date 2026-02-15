---
title: "Phase 1 — Getting Started"
description: "Install OpenClaw, start the gateway, and talk to your first agent via the Control UI."
weight: 10
---

Get a working OpenClaw agent in minutes — no channels, no external exposure.

> **This phase installs on your personal user account for learning and evaluation.** Production deployment to a dedicated user or VM is covered in [Phase 6](phase-6-deployment.md).

---

## Prerequisites

- **Node.js 22+** and npm
- **macOS** (primary) or Linux

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

Continuing below installs on your personal user — you can follow Phases 2–5 to learn the platform, then migrate to a dedicated user/VM in Phase 6.

---

## Install

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

## Start the Gateway

```bash
openclaw start
```

The gateway starts on `http://127.0.0.1:18789` — loopback only, nothing exposed to the network.

Open the Control UI in your browser:

```bash
openclaw dashboard
```

This is your agent's browser-based interface. You can chat with it, view sessions, and monitor activity — all locally, with no external connections beyond your AI provider.

---

## Verify It Works

In the Control UI, send a message:

> "Hello, what can you do?"

The agent should respond based on its default AGENTS.md instructions. If you get a response, your setup is working.

Run diagnostics from the terminal:
```bash
openclaw doctor                  # Check for config issues
openclaw health                  # Gateway health check
```

View logs:
```bash
openclaw logs
```

> **Why no channels yet?** This is a security-first guide. The gateway is currently local-only — the only way in is through the Control UI on your machine. Messaging channels (WhatsApp, Signal) open external connections that accept inbound messages, which is a fundamentally different trust boundary. We'll connect channels in [Phase 4](phase-4-multi-agent.md) *after* the security baseline is in place.

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
You (Control UI) → OpenClaw Gateway → AI Provider (Anthropic) → Response → You
```

- **Gateway** is a local Node.js process (port 18789) that bridges messaging channels to AI providers
- **Control UI** is a browser-based dashboard (Vite + Lit SPA) served on the same port — chat, sessions, and monitoring
- **Workspace files** (AGENTS.md, SOUL.md, etc.) are injected as system context (which files depends on session type — see table above)
- **Sessions** are per-conversation chat histories stored as `.jsonl` files
- **Tools** are capabilities the agent can use (file read/write, web search, code execution, etc.)

Right now, the only connection leaving your machine is to the AI provider. No channels, no webhooks, no inbound network traffic.

---

## Next Steps

Your agent works, but it's running with default settings. Next:

→ **[Phase 2: Memory & Search](phase-2-memory.md)** — give your agent persistent memory and semantic search

Then lock it down:

→ **[Phase 3: Security](phase-3-security.md)** — secure defaults before connecting any channels

When you're ready:
- [Phase 4: Channels & Multi-Agent](phase-4-multi-agent.md) — connect WhatsApp/Signal, multiple agents, routing
- [Phase 5: Web Search Isolation](phase-5-web-search.md) — safe internet access
- [Phase 6: Deployment](phase-6-deployment.md) — run as a system service
- [Reference](../reference.md) — config cheat sheet, tool list, gotchas
