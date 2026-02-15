---
title: "Phase 2 — Memory & Search"
description: "Two-layer memory architecture, semantic search, pre-compaction flush."
weight: 20
---

Your agent works. Now give it memory. This phase covers how OpenClaw stores and retrieves persistent knowledge — from automatic daily logs to semantic search across your agent's full history.

---

## How Memory Works

Each session, the agent wakes up fresh — continuity lives entirely in workspace files. What loads depends on session type:

**Every session:** `AGENTS.md` (operating procedures), `SOUL.md` (identity, values), `TOOLS.md` (environment notes)

**Main session adds:** `USER.md` (about the human), today + yesterday's `memory/YYYY-MM-DD.md` daily notes, and `MEMORY.md` (curated long-term memory, if present)

**Subagent sessions** (groups, shared contexts) load only `AGENTS.md` and `TOOLS.md` — no personal context, no memory files.

> **Write it down.** "Mental notes" don't survive session restarts. If the agent needs to remember something, it must write it to a file. When told "remember this" → daily log or `MEMORY.md`. When a lesson is learned → `AGENTS.md` or relevant file.

### Workspace Files

These files are auto-created by `openclaw setup` (except where noted) and collectively form the agent's persistent identity:

**SOUL.md** — who the agent is. Personality, values, vibe, and boundaries. Not a rules file — it's existential. The agent can evolve it over time and should tell the user when it does.

```markdown
## Core Truths
Be genuinely helpful, not performatively helpful. Skip the "Great question!"
Have opinions. Disagree when it's warranted. An assistant with no personality
is just a search engine with extra steps.

## Boundaries
Private things stay private. Period.
When in doubt, ask before acting externally.
```

**AGENTS.md** — how the agent operates. The main instruction set: startup ritual, workflows, safety rules, group chat etiquette, heartbeat procedures. This is where operational guidelines live.

```markdown
## Safety
- Don't exfiltrate private data. Ever.
- Don't run destructive commands without asking.
- trash > rm (recoverable beats gone forever)
```

**USER.md** — about the human. Name, timezone, pronouns, preferences, and freeform context. Built up over time as the agent learns. *"You're learning about a person, not building a dossier."*

```markdown
- Name: Tobias
- What to call them: Tobi
- Timezone: Europe/Stockholm
- Notes: Prefers concise responses. Working on home automation with HA.
```

**TOOLS.md** — environment-specific notes. Camera names, SSH hosts, TTS voices, device nicknames — local facts that skills need. Skills define *how* tools work; this file defines *your* specifics.

```markdown
### Cameras
- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### TTS
- Preferred voice: "Nova" (warm, slightly British)
```

**IDENTITY.md** — agent metadata. Name, creature type, vibe, emoji, avatar. Filled in during the first conversation via `BOOTSTRAP.md`.

```markdown
- Name: Clawd
- Creature: AI familiar
- Vibe: sharp, warm, slightly chaotic
- Emoji: 🐾
```

**HEARTBEAT.md** — proactive task checklist. Periodically updated by the agent to indicate it's still running — useful for monitoring agent liveness. Read every ~30 minutes during heartbeat polls. The agent checks items, does useful background work (email, calendar, memory maintenance), and replies `HEARTBEAT_OK` if nothing needs attention. Keep it short to limit token burn.

```markdown
- Check email for anything urgent
- If workspace has uncommitted changes: stage, commit, push
- Every few days: review recent daily logs, update MEMORY.md
```

**BOOTSTRAP.md** — first-run onboarding. A conversational script that guides the agent through discovering its identity and learning about the human. Creates `IDENTITY.md` and `USER.md`, guides `SOUL.md` editing. **Self-deletes when done.** Not auto-created if workspace already exists or `skipBootstrap: true`.

**BOOT.md** — startup automation hooks. Short explicit instructions executed when the agent starts (requires `hooks.internal.enabled`). E.g., "Check calendar and send morning briefing."

For the full workspace files table, see [Getting Started: Workspace Files](phase-1-getting-started.md#workspace-files).

---

## The Memory Subsystem

Within the workspace, the two-layer **memory subsystem** handles what the agent knows about past events.

### Layer 1: Daily Memory Files

The agent automatically writes to daily files in `workspace/memory/`:

```
workspace/memory/
├── 2026-02-10.md
├── 2026-02-11.md
└── 2026-02-12.md    ← today
```

Each file contains notes, facts, and context the agent captured during conversations that day. The agent decides what's worth remembering — preferences, decisions, project context, action items.

**Auto-loading:** Today's and yesterday's daily files are automatically loaded into context at session start. Older files are accessible via `memory_search` and `memory_get`.

### Layer 2: Curated MEMORY.md

`workspace/MEMORY.md` is the agent's curated long-term memory — like a human's mental model built from experience. It holds durable facts, preferences, decisions, significant events, opinions, and lessons learned. Think of daily files as a journal and `MEMORY.md` as the wisdom distilled from it.

`MEMORY.md` is **not auto-created** — it's optional. When present, it's loaded in main sessions only. The agent creates and maintains it over time.

```markdown
## Key Decisions
- Switched home automation from Z-Wave to Zigbee (better device support)
- Chose Caddy over Nginx for reverse proxying (auto-TLS, simpler config)

## Lessons Learned
- Always snapshot before upgrading Home Assistant — broke automations twice
- User prefers being told about problems early, even without a fix ready
```

The agent maintains `MEMORY.md` during **heartbeat cycles**: it reviews recent daily logs, extracts significant insights, updates `MEMORY.md` with what's worth keeping, and prunes outdated entries. You can also ask the agent to remember or forget things explicitly.

**Key difference:** Daily files are raw notes within a 2-day auto-loading window. `MEMORY.md` is curated wisdom that persists indefinitely — daily logs feed *into* it over time.

> **Note:** `MEMORY.md` is loaded in **main sessions only** (direct chats with the human), never in shared contexts like groups or Discord — this prevents leaking personal context to strangers. For security-critical instructions, use `SOUL.md` instead.

---

## Memory Search

By default, the agent can only see today's and yesterday's memory files. **Memory search** lets it query the full history using semantic (vector) or hybrid (vector + keyword) search.

### Search Providers

| Provider | Requires | Latency | Privacy |
|----------|----------|---------|---------|
| `local` (GGUF) | ~500MB disk, first-run download | ~50ms | Full — nothing leaves your machine |
| `openai` | `OPENAI_API_KEY` | ~200ms | Embeddings sent to OpenAI |
| `gemini` | `GEMINI_API_KEY` | ~200ms | Embeddings sent to Google |
| `voyage` | `VOYAGE_API_KEY` | ~200ms | Embeddings sent to Voyage AI |

**Recommendation:** Start with `local` for privacy and zero ongoing cost. Switch to a remote provider only if you need higher-quality embeddings for large memory corpora.

### Basic Config

Add to `openclaw.json`:

```json5
{
  agents: {
    defaults: {
      memorySearch: {
        enabled: true,
        provider: "local"            // No API key needed
      }
    }
  }
}
```

For local, OpenClaw downloads a GGUF embedding model (~500MB) on first use. Approve the native build and rebuild (run from OpenClaw's install directory — typically `/opt/homebrew/lib/node_modules/openclaw` on macOS or `/usr/local/lib/node_modules/openclaw` on Linux):

```bash
npx pnpm approve-builds          # Approve node-llama-cpp native build
npx pnpm rebuild node-llama-cpp  # Build native bindings
```

> **Note:** OpenClaw uses pnpm internally but does not install it globally. Use `npx pnpm` to run these commands. If you get "pnpm not found", ensure you're in the OpenClaw installation directory (not your workspace) and that `npx` is on your PATH.

### Hybrid Search

Hybrid search combines **vector similarity** (semantic meaning) with **BM25** (exact keyword matching). This catches both conceptual matches and specific terms the vector model might miss.

```json5
{
  agents: {
    defaults: {
      memorySearch: {
        enabled: true,
        provider: "local",
        query: {
          hybrid: {
            enabled: true,
            vectorWeight: 0.7,       // 70% semantic similarity
            textWeight: 0.3          // 30% BM25 keyword matching
          }
        },
        cache: {
          enabled: true,
          maxEntries: 50000          // Cache chunk embeddings in SQLite
        }
      }
    }
  }
}
```

> **Tip:** The default 70/30 vector/keyword split works well for most use cases. Increase `textWeight` if your memory contains many specific names, codes, or identifiers that benefit from exact matching. Test with `openclaw memory search "your query"` using queries with both semantic and keyword components to verify result quality — adjust weights and re-index if needed.

### Remote Provider Example

```json5
{
  agents: {
    defaults: {
      memorySearch: {
        enabled: true,
        provider: "openai",
        model: "text-embedding-3-small",
        remote: {
          apiKey: "${OPENAI_API_KEY}"
        },
        query: { hybrid: { enabled: true } }
      }
    }
  }
}
```

> **Note:** Remote providers require a separate API key from your AI provider key. The embedding API key is used only for vectorizing memory — it's not the same as your `ANTHROPIC_API_KEY`.

---

## Pre-Compaction Memory Flush

When the context window fills up, OpenClaw compacts the conversation to free space. **Memory flush** saves important context to memory *before* compaction, so nothing is lost. For the full picture of how compaction works (triggers, modes, reserve tokens) and how it differs from session pruning, see [Session Management: Compaction](../sessions.md#compaction).

```json5
{
  agents: {
    defaults: {
      compaction: {
        reserveTokensFloor: 20000,
        memoryFlush: {
          enabled: true,
          softThresholdTokens: 4000,
          systemPrompt: "Session nearing compaction. Store durable memories now.",
          prompt: "Write any lasting notes to memory/YYYY-MM-DD.md; reply with NO_REPLY if nothing to store."
        }
      }
    }
  }
}
```

How it works:

- **Soft threshold:** flush triggers when token estimate crosses `contextWindow - reserveTokensFloor - softThresholdTokens`
- **Silent by default:** prompts include `NO_REPLY` so the user never sees the flush turn
- **One flush per compaction cycle** — tracked in session state
- **Workspace must be writable:** skipped if the agent runs sandboxed with `workspaceAccess: "ro"` or `"none"`

**Why this matters:** Without memory flush, the agent forgets everything from the compacted portion of the conversation. With it, key information survives in memory and can be recalled via `memory_search`.

---

## Memory CLI

Manage memory from the command line:

```bash
# Check memory status — index size, provider, last indexed
openclaw memory status

# Build/rebuild the search index
openclaw memory index

# Rebuild index for a specific agent
openclaw memory index --agent whatsapp

# Search memory from the terminal
openclaw memory search "home automation project"

```

After changing search provider or adding many new memory files, rebuild the index:

```bash
openclaw memory index
```

> **Tip:** The index rebuilds automatically during normal operation, but a manual rebuild is faster when you've bulk-imported memory files or switched providers.

---

## Multi-Agent Memory

> **Single agent?** If you're running a single agent, skip this section — memory isolation only matters with multiple agents. This applies after completing [Phase 4: Multi-Agent Setup](phase-4-multi-agent.md).

Each agent has its own workspace, which means **separate memory stores**. The WhatsApp agent's memory is isolated from the Signal agent's memory.

```
~/.openclaw/workspaces/
├── main/memory/           ← main agent's memory
├── whatsapp/memory/       ← whatsapp agent's memory
└── signal/memory/         ← signal agent's memory
```

### Shared Knowledge via extraPaths

To index shared files across agents without merging workspaces, use `memorySearch.extraPaths`:

```json5
{
  agents: {
    defaults: {
      memorySearch: {
        extraPaths: [
          "/Users/openclaw/.openclaw/shared-knowledge/"   // Indexed for all agents
        ]
      }
    }
  }
}
```

Paths can be absolute or workspace-relative. Directories are scanned recursively for `.md` files. Only Markdown is indexed; symlinks are ignored.

### Indexing Considerations

- Each agent's memory is indexed independently
- Rebuilding one agent's index doesn't affect others
- Search results are scoped to the querying agent's workspace
- If you need cross-agent search, consider a shared workspace (trades isolation for convenience)

---

## Security Considerations

### What Not to Store in Memory

The agent writes to memory automatically. Add guidance in `AGENTS.md` to prevent sensitive data from being persisted:

```markdown
## Memory Guidelines

Never store in memory:
- API keys, tokens, passwords, or credentials
- Full credit card or bank account numbers
- Personal identification numbers (SSN, passport)
- Private keys or certificates
```

### File Permissions

Memory files inherit workspace permissions. Ensure they're restricted:

```bash
chmod -R 700 ~/.openclaw/workspaces/*/memory/
```

For dedicated user setups (see [Phase 6](phase-6-deployment.md)):

```bash
sudo chown -R openclaw:staff ~/.openclaw/workspaces/*/memory/  # macOS
sudo chown -R openclaw:openclaw ~/.openclaw/workspaces/*/memory/ # Linux
```

### Session Transcript Indexing

By default, memory search indexes only `memory/` files. If you enable session transcript indexing (indexing `.jsonl` session files), be aware that **full conversation history becomes searchable** — including any sensitive information exchanged in chat. Keep session transcript indexing disabled unless you have a specific need.

### Git Sync

If your memory files contain sensitive data, either exclude them from git or use a private repository with appropriate access controls. See [Workspace Git Backup](#workspace-git-backup) below for full setup.

---

## Workspace Git Backup

Your workspace — memory files, SOUL.md, AGENTS.md — is the agent's persistent identity. Back it up to a private git repo for recovery, audit trail, and multi-device sync.

> **Following sequentially?** This section references multi-agent concepts from Phase 4. If you're running a single agent, the basic backup setup still applies — just skip the multi-workspace parts.

> **Multi-agent?** This section covers single-agent git backup. For multi-agent setups where channel agents lack exec access and delegate to the main agent, see [Phase 4: Workspace Git Sync](phase-4-multi-agent.md#workspace-git-sync).

### Setup

Initialize git in the workspace and push to a private remote:

```bash
cd ~/.openclaw/workspace
git init

cat > .gitignore << 'EOF'
.DS_Store
.env
**/*.key
**/*.pem
**/secrets*
auth-profiles.json
EOF

git add .
git commit -m "Initial workspace"

# Create private repo + push (GitHub CLI)
gh repo create openclaw-workspace --private --source . --remote origin --push
```

> **Private repos only.** Workspaces contain agent personality, user context, and memory — never use public repositories.

### Automating sync

OpenClaw provides two mechanisms for periodic automation. Use one or both.

#### Option A: HEARTBEAT.md (simplest)

Heartbeat runs every ~30 minutes in the main session. Adding a git sync item to `HEARTBEAT.md` is the simplest approach — it batches with other periodic checks (inbox, calendar) at no extra API cost.

Add to `~/.openclaw/workspace/HEARTBEAT.md`:

```markdown
# Heartbeat checklist

- If workspace has uncommitted changes: stage, commit with descriptive message, pull --rebase, push. Abort on conflicts.
```

The agent reads this each heartbeat and decides whether action is needed. If nothing changed, it skips the sync and replies `HEARTBEAT_OK`.

**Trade-off:** Heartbeat timing drifts slightly and can be skipped if the queue is busy. For guaranteed scheduling, add a cron job.

#### Option B: Cron job (precise scheduling)

Cron runs at exact times, persists across gateway restarts, and can use an isolated session to avoid cluttering main chat history.

Add to `openclaw.json`:

```json5
{
  cron: {
    jobs: [{
      jobId: "workspace-git-sync",
      schedule: { kind: "cron", expr: "0 */6 * * *" },  // Every 6 hours
      sessionTarget: "isolated",
      payload: {
        kind: "agentTurn",
        message: "Sync workspace to git: check for uncommitted changes, stage, commit with descriptive message, pull --rebase, push. Abort on conflicts — never force-push."
      },
      delivery: { mode: "none" }   // Silent — no channel delivery
    }]
  }
}
```

Or via CLI:

```bash
openclaw cron add \
  --name "Workspace sync" \
  --cron "0 */6 * * *" \
  --session isolated \
  --message "Sync workspace to git: check for uncommitted changes, stage, commit with descriptive message, pull --rebase, push. Abort on conflicts." \
  --no-announce
```

**Combining both:** Use HEARTBEAT.md for opportunistic sync during regular checks, and a cron job as a guaranteed fallback every 6-12 hours.

### Safety rules

Add git safety guardrails to the appropriate workspace files:

**AGENTS.md** — operational rules (loaded every session):

```markdown
## Git Safety

- Always pull --rebase before pushing
- Use descriptive commit messages (e.g. "Sync: memory updates, SOUL.md edits")
- If rebase conflicts occur: abort the rebase, report the conflict
- Never commit files matching: *.key, *.pem, .env, secrets*, auth-profiles.json
```

**SOUL.md** — identity-level boundaries:

```markdown
## Boundaries
- Never run git push --force or git reset --hard
- Never commit secrets or credentials to any repository
```

> **Why two files?** AGENTS.md defines *how you operate* — workflows, procedures, safety guidelines. SOUL.md defines *who you are* — identity, personality, values, boundaries. The agent reads both every session.

### GitHub authentication

Set a fine-grained PAT with minimal scope:

1. GitHub → Settings → Developer settings → Fine-grained personal access tokens
2. Scope to **only your workspace repo(s)**
3. Permission: **Contents: Read and write** (nothing else)
4. Set expiration (90 days recommended)

Make the token available to the gateway:

```bash
# In your LaunchDaemon plist / systemd env file / shell profile:
export GITHUB_TOKEN=github_pat_...
```

Both `gh` CLI and `git push` over HTTPS read from this env var. For interactive use, a personal access token works. For the gateway service (Phase 6), use a machine user token or deploy key instead. See [Phase 6: GitHub Token Setup](phase-6-deployment.md#github-token-setup) for production deployment details.

### Verification

```bash
# Check workspace git status
cd ~/.openclaw/workspace && git status && git remote -v

# Test a manual sync
git add . && git commit -m "Test sync" && git pull --rebase && git push

# If using cron, verify the job exists
openclaw cron list
```

After the first automated heartbeat or cron run, check that commits appear in your private repo.

---

## QMD Backend (Experimental)

QMD is a local-first search sidecar that combines BM25 + vectors + reranking. Markdown stays the source of truth; OpenClaw shells out to QMD for retrieval.

```json5
{
  memory: {
    backend: "qmd",                  // Default: built-in SQLite indexer
    qmd: {
      includeDefaultMemory: true,
      update: { interval: "5m" },
      limits: { maxResults: 6, timeoutMs: 4000 }
    }
  }
}
```

QMD requires a separate install:

```bash
bun install -g https://github.com/tobi/qmd   # Or grab a release binary
brew install sqlite                            # macOS — needs extension support
```

The `qmd` binary must be on the gateway's `PATH`. QMD runs fully locally via Bun + `node-llama-cpp` and auto-downloads GGUF models on first use.

**When to consider QMD:**
- Large memory corpus (hundreds of daily files)
- Need BM25 + vector + reranking combined
- Want session transcript indexing (`memory.qmd.sessions.enabled`)
- If QMD fails or the binary is missing, OpenClaw falls back to the built-in SQLite indexer

> **Limitations:** QMD is experimental — may not survive OpenClaw updates, has no official documentation, and behavior may change without notice. Test thoroughly before relying on it in production.

For most users, the default built-in backend is sufficient.

---

## Verification

After configuring memory search, verify everything works:

- [ ] `openclaw memory status` shows your provider and index state
- [ ] `openclaw memory index` completes without errors
- [ ] `openclaw memory search "test"` returns results (if you have memory files)
- [ ] Send a message via chat, check that `memory/YYYY-MM-DD.md` is created
- [ ] Pre-compaction flush: in a long conversation, verify memory is written before compaction (check logs: `openclaw logs | grep "memory flush"`)
- [ ] For local provider: `npx pnpm approve-builds` and `npx pnpm rebuild node-llama-cpp` completed successfully

---

## Next Steps

Your agent now has persistent memory and semantic search.

→ **[Phase 3: Security](phase-3-security.md)** — lock down your agent with secure defaults

Or jump to:
- [Phase 4: Channels & Multi-Agent](phase-4-multi-agent.md) — connect channels, run multiple agents with different roles
- [Reference](../reference.md) — config cheat sheet, memory CLI commands
