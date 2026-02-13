---
title: "Phase 4 — Multi-Agent Setup"
description: "Multiple agents, routing, workspace isolation, dedicated channels."
weight: 40
---

Run multiple agents with different roles, channels, and permissions. Each agent gets its own workspace, credentials, and tool restrictions.

**Prerequisite:** [Phase 3 (Security)](phase-3-security.md) — this phase builds on the security baseline, tool deny policies, and AGENTS.md safety rules established there.

---

> **VM isolation:** macOS VMs — skip the `sandbox` config blocks (no Docker). Linux VMs — keep the `sandbox` blocks (Docker works inside the VM). Both run the same 6-agent gateway.

---

## Workspace Layout Change

Phase 1 created a single workspace at `~/.openclaw/workspace/`. With multiple agents, each gets its own workspace under `~/.openclaw/workspaces/<name>/`.

Move your existing workspace before proceeding:

```bash
mkdir -p ~/.openclaw/workspaces
mv ~/.openclaw/workspace ~/.openclaw/workspaces/main
```

Then update `openclaw.json` to point the main agent at the new path:
```json
{ "workspace": "~/.openclaw/workspaces/main" }
```

> **Note:** If you prefer to keep the original `~/.openclaw/workspace/` path for your main agent, that works too — just set `workspace` accordingly in the agent config. The key is that each agent points to a *different* workspace directory.

---

## When You Need Multiple Agents

**Yes:**
- Operator agent (full access via Control UI / CLI) separate from channel-facing agents
- Channel agents should not have `exec` — they're the most exposed to prompt injection. Delegate privileged operations to the main agent via `sessions_send`
- Different security postures per context (strict for groups, relaxed for trusted DMs)
- Credential isolation (different API keys per agent)
- Web search/browser isolation via delegation (see [Phase 5](phase-5-web-search.md))

**No:**
- You just want different behavior per group — use AGENTS.md instructions instead
- You want a different model per conversation — use `/model` in chat
- You only have one channel — a single agent with good tool restrictions is enough

---

## Core Concepts

```
Agent = Workspace + agentDir + Session Store + Tools
```

| Component | What it is | Path |
|-----------|-----------|------|
| **Workspace** | Agent's home — SOUL.md, AGENTS.md, memory, files | `~/.openclaw/workspaces/<name>/` |
| **agentDir** | Per-agent state — auth profiles, model registry | `~/.openclaw/agents/<id>/agent/` |
| **Session store** | Chat history per conversation | `~/.openclaw/agents/<id>/sessions/` |
| **Tools** | What the agent can do (allow/deny lists) | Defined in `openclaw.json` |

**Critical rule:** Never share `agentDir` between agents. Each agent needs its own auth-profiles.json — sharing causes auth collisions and session corruption.

---

## Creating Channel Agents

The recommended architecture separates your operator agent (full access, no channel) from channel-facing agents (restricted, sandboxed):

- **Main agent** — direct access via Control UI / CLI, no sandbox, full tools; handles privileged operations on behalf of channel agents
- **Channel agents** — one per messaging channel, no exec/process, sandboxed with Docker (Docker isolation or Linux VMs) or tool-policy-only (macOS VM isolation); delegate privileged operations to main via `sessions_send`
- **Search agent** — added in [Phase 5](phase-5-web-search.md)
- **Browser agent** — added in [Phase 5](phase-5-web-search.md)

### 1. Create workspace and agent directories

```bash
# Channel agent workspace and state
mkdir -p ~/.openclaw/workspaces/whatsapp
mkdir -p ~/.openclaw/workspaces/whatsapp/memory
mkdir -p ~/.openclaw/agents/whatsapp/agent
mkdir -p ~/.openclaw/agents/whatsapp/sessions
```

Repeat for each channel (e.g., `signal`).

### 2. Bootstrap workspace files

Copy from your main workspace (moved in the [Workspace Layout Change](#workspace-layout-change) step above) and customize:

```bash
cp ~/.openclaw/workspaces/main/SOUL.md ~/.openclaw/workspaces/whatsapp/SOUL.md
cp ~/.openclaw/workspaces/main/AGENTS.md ~/.openclaw/workspaces/whatsapp/AGENTS.md
cp ~/.openclaw/workspaces/main/IDENTITY.md ~/.openclaw/workspaces/whatsapp/IDENTITY.md
cp ~/.openclaw/workspaces/main/USER.md ~/.openclaw/workspaces/whatsapp/USER.md
cp ~/.openclaw/workspaces/main/TOOLS.md ~/.openclaw/workspaces/whatsapp/TOOLS.md
cp ~/.openclaw/workspaces/main/HEARTBEAT.md ~/.openclaw/workspaces/whatsapp/HEARTBEAT.md
```

Or use the setup command:
```bash
openclaw setup --workspace ~/.openclaw/workspaces/whatsapp
```

Edit `AGENTS.md` and `IDENTITY.md` to give each agent a different personality/role.

### 3. Copy auth profile

Each agent needs its own credentials file:

```bash
cp ~/.openclaw/agents/main/agent/auth-profiles.json \
   ~/.openclaw/agents/whatsapp/agent/auth-profiles.json
```

If this agent should use different API keys (e.g., separate billing), edit the copied file.

### 4. Add to config

```json
{
  "agents": {
    "defaults": {
      "compaction": { "mode": "safeguard" },
      "maxConcurrent": 4,
      "subagents": { "maxConcurrent": 8 },
      "sandbox": {
        "mode": "non-main",
        "scope": "agent",
        "workspaceAccess": "rw"
      }
    },
    "list": [
      {
        "id": "main",
        "default": true,
        "workspace": "~/.openclaw/workspaces/main",
        "sandbox": { "mode": "off" }
      },
      {
        "id": "whatsapp",
        "workspace": "~/.openclaw/workspaces/whatsapp",
        "agentDir": "~/.openclaw/agents/whatsapp/agent",
        "tools": {
          "deny": ["exec", "process", "browser", "canvas", "gateway"],
          "elevated": { "enabled": false }
        },
        "subagents": { "allowAgents": ["main", "search", "browser"] }
      }
    ]
  }
}
```

Key design decisions:
- **Main agent** has `sandbox.mode: "off"` — it's your direct operator interface, handles privileged operations (git sync, builds) on behalf of channel agents
- **Channel agents** deny `exec` and `process` — the most dangerous tools for a channel-facing agent. They delegate privileged operations to main via `sessions_send` (see [Privileged Operation Delegation](#privileged-operation-delegation))
- **`subagents.allowAgents`** includes `"main"` — allows channel agents to reach the main agent for delegation, plus `search`/`browser` for web access
- **Channel agents** inherit the default sandbox (`non-main`) — Docker runs with no network, preventing exfiltration via any remaining tools
- **`elevated.enabled: false`** on channel agents prevents authorized senders from escaping the sandbox via `/elevated`
- The first agent with `"default": true` handles any messages that don't match a binding

### 5. Initialize git (recommended)

See [Workspace Git Sync](#workspace-git-sync) for full setup — initialize each workspace as a git repo, push to private repos, and let the main agent handle sync via cron + on-demand delegation.

---

## Channel Routing with Bindings

Bindings route incoming messages to specific agents. Most-specific match wins.

```json
{
  "bindings": [
    { "agentId": "whatsapp", "match": { "channel": "whatsapp" } },
    { "agentId": "signal", "match": { "channel": "signal" } }
  ]
}
```

Each channel routes to its dedicated agent. The main agent has no binding — it's only accessible via Control UI / CLI. Unbound channels fall through to the default agent (`main`).

### Binding Precedence

From most to least specific:

1. **Peer match** — exact DM or group ID → highest priority
2. **guildId** — Discord server
3. **teamId** — Slack workspace
4. **accountId** — specific account on a channel
5. **Channel** — all messages on a channel type
6. **Default agent** — fallback

### Examples

Route by channel:
```json
{ "agentId": "work", "match": { "channel": "slack" } }
```

Route a specific WhatsApp group:
```json
{ "agentId": "main", "match": { "channel": "whatsapp", "peer": { "kind": "group", "id": "GROUP_JID" } } }
```

Route a specific DM:
```json
{ "agentId": "signal", "match": { "channel": "signal", "peer": { "kind": "direct", "id": "+46XXXXXXXXX" } } }
```

---

## Workspace Isolation

### What's Shared

| Shared across agents | Isolated per agent |
|---------------------|-------------------|
| `openclaw.json` (config) | Workspace files (SOUL.md, AGENTS.md, etc.) |
| Channel credentials | `auth-profiles.json` (API keys) |
| Gateway process | Session transcripts |
| Device identity | Memory storage |
| Global tool policies | Agent-specific tool deny/allow |

### What This Means

- Agents can't read each other's workspaces (different filesystem paths)
- Agents can't see each other's sessions (separate session stores)
- Agents can't use each other's API keys (separate auth-profiles.json)
- But: global config changes affect all agents
- But: channel credentials are shared (same WhatsApp/Signal account)

> **Credentials vs workspace data (Docker isolation).** Docker protects *credentials* — `openclaw.json` and `auth-profiles.json` are outside the container, inaccessible to sandboxed agents. But *workspace data* (SOUL.md, USER.md, MEMORY.md, conversation history in `memory/`) is mounted with `workspaceAccess: "rw"` and fully readable inside the container. Workspace data — identity, preferences, conversation history — is often more sensitive than API keys (which can be rotated). Mitigated by Docker `network: none`: even if an agent reads workspace data, it has no outbound network path to exfiltrate it.

---

## Per-Agent Tool Restrictions

Each agent should only have the tools it needs:

```json
{
  "agents": {
    "list": [
      {
        "id": "main"
      },
      {
        "id": "whatsapp",
        "tools": {
          "deny": ["exec", "process", "browser", "canvas", "gateway"],
          "elevated": { "enabled": false }
        },
        "subagents": { "allowAgents": ["main", "search", "browser"] }
      }
    ]
  }
}
```

Channel agents deny `exec` and `process` — the highest-risk tools for exfiltration. They delegate privileged operations (git sync, builds) to the main agent via `sessions_send`. The `elevated.enabled: false` prevents escaping the sandbox. See [Privileged Operation Delegation](#privileged-operation-delegation) for the delegation pattern.

### Tool Groups

Use group shorthands to deny/allow entire categories:

| Group | Tools included |
|-------|---------------|
| `group:runtime` | `exec`, `bash`, `process` |
| `group:fs` | `read`, `write`, `edit`, `apply_patch` |
| `group:sessions` | `sessions_list`, `sessions_history`, `sessions_send`, `sessions_spawn`, `session_status` |
| `group:memory` | `memory_search`, `memory_get` |
| `group:web` | `web_search`, `web_fetch` |
| `group:ui` | `browser`, `canvas` |
| `group:automation` | `cron`, `gateway` |
| `group:messaging` | `message` |

Example — a read-only agent:
```json
{
  "id": "readonly",
  "tools": {
    "allow": ["group:fs", "group:memory", "group:sessions"],
    "deny": ["write", "edit", "apply_patch", "exec", "process", "browser", "gateway"]
  }
}
```

---

## Credential Isolation

### How it works

Each agent requires its own `agentDir` — sharing causes session corruption. The gateway reads each agent's `auth-profiles.json` to make API calls on its behalf.

Sandboxed agents (channel agents, search) cannot read their own `auth-profiles.json` — the file is on the host, outside the Docker container. This is the primary protection against credential exfiltration.

All agents need valid model credentials to function — including the search agent, which uses the LLM to process search results.

### Setup

```
~/.openclaw/agents/
├── main/agent/auth-profiles.json       # Main agent (unsandboxed — can read this)
├── whatsapp/agent/auth-profiles.json   # Same credentials (sandboxed — can't read)
├── signal/agent/auth-profiles.json     # Same credentials (sandboxed — can't read)
├── search/agent/auth-profiles.json     # Same credentials (sandboxed — can't read)
└── browser/agent/auth-profiles.json    # Same credentials (sandboxed — can't read)
```

Channel, search, and browser agents can share the same credential content — copy from main:

```bash
cp ~/.openclaw/agents/main/agent/auth-profiles.json \
   ~/.openclaw/agents/whatsapp/agent/auth-profiles.json
```

### File Permissions

```bash
chmod 600 ~/.openclaw/agents/*/agent/auth-profiles.json
```

---

## Inter-Agent Communication Control

By default, any agent with `sessions_send` or `sessions_spawn` can message any other agent. Restrict this with two mechanisms:

### Subagent spawning restrictions

Control which agents can spawn which other agents as subagents:

```json
{
  "agents": {
    "list": [
      {
        "id": "main",
        "subagents": { "allowAgents": ["search", "browser"] }
      },
      {
        "id": "whatsapp",
        "subagents": { "allowAgents": ["main", "search", "browser"] }
      },
      {
        "id": "search",
        "subagents": { "allowAgents": [] }
      },
      {
        "id": "browser",
        "subagents": { "allowAgents": [] }
      }
    ]
  }
}
```

`allowAgents: []` prevents the agent from spawning anything — important for isolation agents like `search` that should never delegate further.

### Agent-to-agent tool (optional)

For direct agent-to-agent messaging (beyond `sessions_send`), there's a global opt-in tool:

```json
{
  "tools": {
    "agentToAgent": {
      "enabled": true,
      "allow": ["main", "whatsapp", "signal", "googlechat", "search", "browser"],
      "maxPingPongTurns": 2
    }
  }
}
```

This is more permissive than `sessions_send` — only enable it if agents need to communicate bidirectionally. `maxPingPongTurns` prevents infinite reply loops.

> For most setups, `sessions_send` + `subagents.allowAgents` is sufficient. The `agentToAgent` tool is for advanced multi-agent workflows.

---

## Tool Policy Precedence

OpenClaw evaluates tool access in two steps:

**Step 1: What's available?** Global `tools.deny` removes tools from the default set for all agents.

**Step 2: What does this agent get?** Each agent's `tools.allow` and `tools.deny` are evaluated independently. However, global `deny` overrides agent-level `allow` — a tool denied globally cannot be re-enabled at the agent level.

This is why [web search isolation](phase-5-web-search.md) uses per-agent deny: web tools (`web_search`, `web_fetch`, `browser`) are denied on each agent that shouldn't have them, rather than globally. This lets the search agent's `allow` list work.

**Key rules:**
- `deny` always wins over `allow` at the same level
- If `allow` is non-empty, everything not listed is blocked
- Global `deny` overrides agent-level `allow` — deny per-agent for tools some agents need
- Tool policy is a hard stop — chat commands like `/exec` cannot override

> For the full 8-layer evaluation cascade, see [Reference](../reference.md#tool-policy-precedence).

---

## Worked Example: Operator + Channel Agents

Using the agent config from [Creating Channel Agents](#creating-channel-agents) above:

- **Main agent** (operator) — full access via Control UI / CLI, no sandbox, no channel binding; handles privileged operations (git sync, builds) on behalf of channel agents
- **WhatsApp agent** — daily work, research, planning; no exec/process; sandboxed with Docker (no network); delegates web search to search agent, privileged operations to main
- **Signal agent** — same capabilities as WhatsApp; separate workspace and credentials
- `gateway` and `canvas` denied globally; web tools (`web_search`, `web_fetch`, `browser`) denied per-agent; channel agents also deny `exec`, `process`, `elevated`
- Each channel is explicitly bound to its agent; main catches any unbound messages

For the complete annotated config (6 agents including web search and browser automation), see [`examples/openclaw.json`](../examples/config.md).

---

## Privileged Operation Delegation

Channel agents have `exec` and `process` denied — they can't run shell commands. This is deliberate: channel-facing agents are the most exposed to prompt injection, and `exec` is the highest-risk tool for exfiltration.

Instead, channel agents delegate privileged operations to the main agent via `sessions_send`:

```
Channel Agent (no exec) → sessions_send("main", "Build the Xcode project at ~/project")
                               │
                               ▼
                         Main Agent (unsandboxed) → exec("xcodebuild ...")
                               │
                               ▼
                         Results announced back to channel agent
```

This works because:
- `sessions_send` is available to channel agents (not in their deny list)
- `"main"` is in their `subagents.allowAgents`
- The main agent has full exec access and no sandbox

**Important:** Delegation is prompt-based, not ACL-enforced. The main agent decides whether to execute based on its AGENTS.md instructions. See [Workspace Git Sync](#workspace-git-sync) for a worked example.

> **Security: `sessions_send` is the dominant residual risk.** A prompt-injected channel agent can send arbitrary requests to the main agent (unsandboxed, full exec) via `sessions_send`. No deployment boundary addresses this — it's intra-process communication. The main agent's AGENTS.md is the last line of defense. Write restrictive instructions: explicitly list what the main agent should and should not do on behalf of other agents. See [Security: Accepted Risks](phase-3-security.md#accepted-risks) for the full analysis.

---

## Workspace Git Sync

Track workspace changes in git for backup, audit trail, and multi-device sync. In a multi-agent setup, only the main agent has exec access — channel agents request sync via `sessions_send` delegation.

> **Single-agent setup?** See [Phase 2: Workspace Git Backup](phase-2-memory.md#workspace-git-backup) for the simpler single-workspace pattern with HEARTBEAT.md or cron.

### Setup: initialize workspaces as git repos

```bash
for ws in ~/.openclaw/workspaces/*/; do
  cd "$ws"
  git init
  cat > .gitignore << 'EOF'
.DS_Store
.env
**/*.key
**/*.pem
**/secrets*
EOF
  git add .
  git commit -m "Initial workspace"
done
```

Push each to a **private** repository:
```bash
cd ~/.openclaw/workspaces/main
gh repo create openclaw-workspace-main --private --source . --remote origin --push
```

### Scheduled sync (cron)

The main agent runs git sync every 6 hours via a cron job:

```json5
{
  "cron": {
    "jobs": [{
      "jobId": "workspace-git-sync",
      "agentId": "main",          // Only main agent (has exec)
      "schedule": { "kind": "cron", "expr": "0 */6 * * *" },
      "sessionTarget": "isolated",
      "payload": {
        "kind": "agentTurn",
        "message": "Run workspace git sync: for each workspace in ~/.openclaw/workspaces/*, check for uncommitted changes, commit with a descriptive message, pull --rebase, and push. Report any conflicts or failures."
      },
      "delivery": { "mode": "none" }   // Silent — no channel delivery
    }]
  }
}
```

### On-demand sync (channel agent → main)

A user can ask their channel agent to trigger a sync:

```
User (WhatsApp): "Sync my workspace to git"
    ↓
WhatsApp Agent: sessions_send("main", "Sync the whatsapp workspace to git")
    ↓
Main Agent: exec("cd ~/.openclaw/workspaces/whatsapp && git add . && git commit -m '...' && git pull --rebase && git push")
    ↓
Main Agent: announces result back to WhatsApp Agent
```

### Workspace file instructions

**Main agent — AGENTS.md** (`~/.openclaw/workspaces/main/AGENTS.md`):

```markdown
## Git Sync Delegation

You handle git operations for all workspaces on behalf of channel agents that lack exec access.

### Scheduled sync
When triggered by the workspace-git-sync cron job:
1. Iterate over each directory in ~/.openclaw/workspaces/*/
2. Skip if no .git directory or no uncommitted changes
3. Stage all changes, commit with a descriptive message (e.g. "Sync: memory updates, SOUL.md edits")
4. Run git pull --rebase, then git push
5. If rebase conflicts occur: abort the rebase, report the conflict, do NOT force-push
6. If a workspace has no git remote configured, skip it and report
7. Stop on any error — do not continue to the next workspace

### On-demand sync (from channel agents)
When a channel agent requests git sync via sessions_send:
- Only sync the requesting agent's workspace (or all if explicitly asked)
- Follow the same commit → pull --rebase → push flow
- Report results back to the requesting session
```

**Main agent — SOUL.md** (`~/.openclaw/workspaces/main/SOUL.md`):

```markdown
## Boundaries
- Never run git push --force or git reset --hard
- Never commit secrets or credentials to any repository
```

**Channel agents — AGENTS.md** (`~/.openclaw/workspaces/whatsapp/AGENTS.md`, and signal):

```markdown
## Workspace Git Sync

You do not have exec access. To sync your workspace to git:
- Use sessions_send to ask the main agent: "Sync the <your-agent-id> workspace to git"
- The main agent will commit, pull, and push on your behalf
- Sync also runs automatically every 6 hours via cron on the main agent

Do not attempt to run git commands directly — they will fail.
```

### Security notes

- **Token:** The `GITHUB_TOKEN` env var is available to the main agent's exec environment (set in the LaunchDaemon/systemd unit). Channel agents can't access it (no exec).
- **Scope:** Use a fine-grained PAT scoped to only your workspace repos with **Contents: Read and write** permission. See [Deployment: GitHub token setup](phase-6-deployment.md#github-token-setup) for step-by-step instructions.
- **Audit:** Commit history provides an audit trail of workspace changes, including self-modifications to SOUL.md/AGENTS.md.
- **Private repos only:** Workspaces contain agent personality, user context, and memory — always use private repositories.
- **Conflict resolution:** The main agent aborts on rebase conflicts rather than force-pushing. Manual intervention required — this is intentional.

---

## Verification Checklist

After completing multi-agent setup, verify:

- [ ] Each agent has its own workspace directory under `~/.openclaw/workspaces/<name>/`
- [ ] Each agent has its own `agentDir` with a valid `auth-profiles.json`
- [ ] `openclaw doctor` reports no config errors
- [ ] Main agent responds via Control UI / CLI
- [ ] Channel agents respond to WhatsApp/Signal messages
- [ ] Channel agents cannot use denied tools (try asking the WhatsApp agent to run a shell command — it should refuse)
- [ ] `sessions_send` delegation works (ask a channel agent to delegate something to main)
- [ ] Bindings route correctly — WhatsApp messages go to the whatsapp agent, Signal to signal
- [ ] Workspace git sync cron job is registered: `openclaw cron list`

---

## Next Steps

→ **[Phase 5: Web Search Isolation](phase-5-web-search.md)** — the key differentiator: safe internet access via a dedicated search agent

Or:
- [Phase 6: Deployment](phase-6-deployment.md) — VM isolation (macOS VMs, Linux VMs), LaunchDaemon/LaunchAgent/systemd, firewall, Tailscale
- [Reference](../reference.md) — full tool list, config keys, gotchas
