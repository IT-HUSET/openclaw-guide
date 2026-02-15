---
title: "Session Management"
description: "Session keys, routing, lifecycle, compaction, pruning, and debugging."
weight: 105
---

How OpenClaw routes messages to conversations, manages session lifecycle, and compresses context. This is a deep-dive companion to the [phase guides](phases/_index.md) — see [Phase 2](phases/phase-2-memory.md) for memory flush, [Phase 3](phases/phase-3-security.md) for DM isolation security, and [Phase 4](phases/phase-4-multi-agent.md) for multi-agent routing.

> **Official docs:** [Session Management](https://docs.openclaw.ai/concepts/session) · [Compaction](https://docs.openclaw.ai/concepts/compaction) · [Session Pruning](https://docs.openclaw.ai/concepts/session-pruning)

---

## Session Keys

Every conversation is identified by a deterministic **session key** — a string that routes incoming messages to the right context. The key format depends on the message source.

### Direct Messages

DM session keys are controlled by `session.dmScope`:

| `dmScope` | Key format | Behavior |
|-----------|-----------|----------|
| `main` (default) | `agent:<agentId>:main` | All DMs share one conversation |
| `per-peer` | `agent:<agentId>:dm:<peerId>` | Isolate by sender, across channels |
| `per-channel-peer` | `agent:<agentId>:<channel>:dm:<peerId>` | Isolate by sender + channel *(recommended)* |
| `per-account-channel-peer` | `agent:<agentId>:<channel>:<accountId>:dm:<peerId>` | Full isolation per account + channel + sender |

> **Security:** The default `main` scope shares context across all senders. If Alice and Bob both message your agent, Bob can ask "What were we talking about?" and get Alice's context. Set `dmScope` to `per-channel-peer` for multi-user deployments. See [Phase 3: Security Baseline](phases/phase-3-security.md#security-baseline).

The `main` in the default key format is a fixed value. The config field `session.mainKey` exists for historical reasons but is ignored at runtime — it always resolves to `"main"`. Don't set it.

### Groups, Rooms, and Threads

Group-type sessions always isolate — no `dmScope` needed:

| Source | Key format |
|--------|-----------|
| Group chat | `agent:<agentId>:<channel>:group:<groupId>` |
| Room / channel | `agent:<agentId>:<channel>:channel:<channelId>` |
| Telegram topic | `agent:<agentId>:<channel>:group:<groupId>:topic:<threadId>` |

### Other Sources

| Source | Key format |
|--------|-----------|
| Cron job | `cron:<jobId>` |
| Webhook | `hook:<uuid>` |
| Node (paired device) | `node-<nodeId>` |

---

## Identity Links

When a user messages from multiple channels (e.g., WhatsApp + Telegram), they normally get separate sessions (under `per-peer` or stricter scopes). **Identity links** collapse these into one session by mapping provider-specific peer IDs to a canonical identity:

```json5
{
  session: {
    dmScope: "per-peer",
    identityLinks: {
      "alice": ["whatsapp:+15551234567", "telegram:123456789"],
      "bob": ["signal:+15559876543", "discord:987654321012345678"]
    }
  }
}
```

With this config, Alice's WhatsApp and Telegram DMs share the same session. The canonical name (`"alice"`) replaces the peer ID in the session key: `agent:<agentId>:dm:alice`.

> **Finding channel-specific identifiers:** WhatsApp JIDs, Signal UUIDs, and other peer IDs appear in gateway logs when a user first messages the agent. Use `openclaw logs --follow` and look for `identity` or `peer` fields.

> **Note:** Identity links only affect DM session routing. Group sessions are always keyed by group ID, not sender.

---

## Session Lifecycle

### Reset Policies

Sessions don't persist forever. Reset policies control when a session expires and a fresh one begins.

**Daily reset** (default): Sessions expire after the last activity crosses the daily boundary. Default reset time is **4:00 AM** local (gateway host timezone).

**Idle reset** (optional): Sliding window — session expires after N minutes of inactivity.

When both are configured, **whichever expires first** wins.

```json5
{
  session: {
    reset: {
      mode: "daily",
      atHour: 4,            // Reset at 4 AM (0-23)
      idleMinutes: 120      // Also reset after 2h idle
    }
  }
}
```

### Per-Type and Per-Channel Overrides

Override reset policies for specific session types or channels:

```json5
{
  session: {
    reset: {
      mode: "daily",
      atHour: 4
    },
    // Override by session type
    resetByType: {
      group: { idleMinutes: 60 },     // Groups reset faster
      thread: { idleMinutes: 30 }     // Threads even faster
    },
    // Override by channel (takes precedence over resetByType)
    resetByChannel: {
      discord: { idleMinutes: 45 }
    }
  }
}
```

### Manual Reset

Users can reset their session with chat commands:

| Command | Effect |
|---------|--------|
| `/new` | Fresh session |
| `/new <model>` | Fresh session with a different model |
| `/reset` | Same as `/new` |

Custom reset triggers can be added via `session.resetTriggers`.

### Cron Sessions

Cron jobs always mint a **fresh session ID** per run — no idle reuse, no carryover from previous runs. Use `sessionTarget: "isolated"` to keep cron output separate from the user's chat history:

```json5
{
  cron: {
    jobs: [{
      jobId: "daily-summary",
      schedule: { kind: "cron", expr: "0 8 * * *" },
      sessionTarget: "isolated",
      payload: { kind: "agentTurn", message: "Write a morning briefing." },
      delivery: { mode: "none" }
    }]
  }
}
```

---

## Session Storage

Sessions are stored in two layers on the filesystem:

```
~/.openclaw/agents/<agentId>/sessions/
├── sessions.json           ← Session state (mutable)
└── <sessionId>.jsonl       ← Transcript (append-only)
```

### Session Store (`sessions.json`)

Key/value map of `sessionKey → SessionEntry`. Each entry tracks:

| Field | Description |
|-------|-------------|
| `sessionId` | Current transcript file ID |
| `updatedAt` | Last activity timestamp |
| `compactionCount` | Number of auto-compactions |
| `memoryFlushAt` | Last pre-compaction memory flush |
| `memoryFlushCompactionCount` | Compaction count when flush ran |
| `inputTokens`, `outputTokens`, `totalTokens` | Rolling token counters |
| `contextTokens` | Estimated current context usage |

This file is mutable — safe to edit or delete individual entries (the agent creates a new entry on next message).

### Transcript (`<sessionId>.jsonl`)

Append-only JSON Lines file with tree structure (`id` + `parentId`). Stores the full conversation: user messages, assistant responses, tool calls/results, and compaction summaries.

The first line is a session header. Subsequent lines are entries that form a tree (branching happens on retries/edits). To rebuild the model's context, OpenClaw walks the tree from root to the most recent leaf.

```
main ─── turn1 ─── turn2 ─── turn3
                       └──── turn2-retry ─── turn3b
```

Each entry has an `id` and `parentId`. When the user retries or edits a message, a new branch forks from the parent entry. The active branch is always the most recent leaf.

> **Gateway is source of truth.** In remote mode, session files live on the remote host. UI clients query the gateway API, not local files.

---

## Compaction

When a conversation grows beyond the model's context window, OpenClaw **compacts** it — summarizing older messages into a persistent `compaction` entry in the transcript. Future turns see the summary plus messages after the compaction point.

### How It Triggers

Auto-compaction runs in two scenarios:

1. **Overflow recovery** — the model returns a context overflow error → compact → retry
2. **Threshold maintenance** — after a successful turn when `contextTokens > contextWindow - reserveTokens`

### Configuration

```json5
{
  agents: {
    defaults: {
      compaction: {
        mode: "safeguard",              // "default" or "safeguard" (chunked summarization)
        reserveTokensFloor: 24000,      // Safety floor — minimum headroom
        memoryFlush: {
          enabled: true,
          softThresholdTokens: 6000     // Flush memory before compaction
        }
      }
    }
  }
}
```

**Reserve tokens floor:** OpenClaw enforces a safety minimum (default 20,000 tokens). If your configured `reserveTokens` is lower, OpenClaw bumps it up. This prevents compaction spam by leaving enough headroom for multi-turn housekeeping.

**Pre-compaction memory flush:** Runs a silent agentic turn to save important context to memory files *before* compaction permanently compresses the conversation. One flush per compaction cycle. See [Phase 2: Pre-Compaction Memory Flush](phases/phase-2-memory.md#pre-compaction-memory-flush) for full details.

### Manual Compaction

Use `/compact` in chat to trigger compaction immediately. Optionally pass instructions:

```
/compact Focus on the technical decisions and action items
```

---

## Session Pruning

Pruning is a separate mechanism from compaction. It trims **old tool results** from the in-memory context before sending to the LLM — but never rewrites the JSONL transcript.

| | Compaction | Pruning |
|--|-----------|---------|
| **What it does** | Summarizes old messages | Trims oversized tool results |
| **Persists?** | Yes — written to JSONL | No — transient per API request (exists only for the duration of a single chat completion call) |
| **Triggered by** | Context pressure | Cache TTL expiry |
| **Affects** | Entire conversation history | Only tool result blocks |

### How Pruning Works

- **Mode:** `cache-ttl` — runs when the last Anthropic API call is older than `ttl` (default 5 minutes)
- **Soft-trim:** keeps head + tail of oversized results, removes middle
- **Hard-clear:** replaces entire result with a placeholder
- **Protected:** last N assistant messages are never pruned (`keepLastAssistants: 3` default)
- **Never touches:** user/assistant message text or image blocks

> **Scope:** Pruning only applies to Anthropic API calls (and OpenRouter-routed Anthropic models). Other providers are unaffected.

---

## Multi-Agent Sessions

Each agent has its own session store:

```
~/.openclaw/agents/
├── main/sessions/           ← main agent's sessions
├── whatsapp/sessions/       ← whatsapp agent's sessions
└── search/sessions/         ← search agent's sessions
```

Session keys include the agent ID, so there's no collision between agents. The [binding system](phases/phase-4-multi-agent.md#channel-routing-with-bindings) routes incoming messages to the right agent — most-specific match wins (peer → guild → channel → default).

> **Never share `agentDir` between agents** — causes auth collisions and session corruption. To share credentials, manually copy `auth-profiles.json`.

---

## Inspection & Debugging

### CLI Commands

```bash
# List active sessions
openclaw sessions list

# JSON output with activity filter
openclaw sessions --json --active 60    # Sessions active in last 60 min

# Query from running gateway
openclaw gateway call sessions.list --params '{}'

# Reset all sessions
openclaw sessions reset
```

### Chat Commands

| Command | Shows |
|---------|-------|
| `/status` | Model, tokens, cost, compaction count, context usage |
| `/context list` | System prompt, injected files, biggest context contributors |
| `/context detail` | Full context breakdown |
| `/compact [instructions]` | Manual compaction |
| `/stop` | Abort current run, clear queue, stop sub-agents |

### Reading Transcripts

Session transcripts (`.jsonl`) can be opened directly for debugging. Each line is a JSON object:

```bash
# Find sessions with specific content
grep -l 'some-keyword' ~/.openclaw/agents/*/sessions/*.jsonl

# View recent entries in a session (replace with actual ID from `openclaw sessions list`)
tail -5 ~/.openclaw/agents/main/sessions/sess_abc123def456.jsonl | jq .
```

> **Gotcha:** Broken tool results persist in session history. If a plugin returns malformed content blocks, the error replays on every subsequent message. Fix: delete the affected `.jsonl` file — the next message creates a fresh session.

---

## Quick Reference

### Minimal Config (Single User)

```json5
{
  session: {
    dmScope: "main"        // All DMs share one session (safe for single-user)
  }
}
```

### Multi-User Config

```json5
{
  session: {
    dmScope: "per-channel-peer",
    identityLinks: {
      "alice": ["whatsapp:+15551234567", "telegram:123456789"]
    }
  }
}
```

### Full Session Config

```json5
{
  session: {
    dmScope: "per-channel-peer",
    reset: {
      mode: "daily",
      atHour: 4,
      idleMinutes: 120
    },
    identityLinks: {
      "alice": ["whatsapp:+15551234567", "telegram:123456789"]
    }
  },
  agents: {
    defaults: {
      compaction: {
        mode: "safeguard",
        reserveTokensFloor: 24000,
        memoryFlush: {
          enabled: true,
          softThresholdTokens: 6000
        }
      }
    }
  }
}
```
