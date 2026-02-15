---
title: "Basic Configuration"
description: "Minimal OpenClaw config with security baseline, single channel, and web search isolation — a clean starting point."
weight: 120
---

Minimal secure `openclaw.json` covering the security baseline (Phase 3), a single WhatsApp channel routing to the main agent (Phase 4), and isolated web search delegation (Phase 5). Two agents only: main + search. Uses JSON5 comments for inline documentation — OpenClaw supports JSON5 natively.

For computer agent with browser, multiple channels (Signal, Google Chat), dedicated channel agents, and image generation — see [Recommended Configuration](config.md).

Three deployment postures are covered: Docker isolation (this config), macOS VM isolation (remove sandbox blocks), and Linux VM isolation (keep sandbox blocks). See [Phase 3 — Security](../phases/phase-3-security.md#deployment-isolation-options) for the full trade-off analysis.

```json5
{
  // ============================================================
  // OpenClaw Configuration — Basic Setup
  // ============================================================
  // NOTE: This file uses JSON5 comments (//) for documentation.
  // OpenClaw supports JSON5 natively — no need to strip comments.
  //
  // Minimal secure setup covering:
  // - Security baseline (Phase 3)
  // - Two agents: main + search (Phases 4-5)
  // - Single channel: WhatsApp (Phase 4)
  // - Web search delegation (Phase 5)
  //
  // NOT included (see recommended example for these):
  // - Computer agent with browser (see recommended example)
  // - Dedicated channel agents (defense-in-depth — channels route to main here)
  // - Signal / Google Chat channels
  // - Image generation plugin
  //
  // DEPLOYMENT OPTIONS:
  //   Docker isolation — Dedicated OS user + Docker/OrbStack (this config): stronger
  //                      internal agent isolation via Docker sandboxing.
  //   VM: macOS VMs — Lume / Parallels: stronger host isolation, no Docker inside VM.
  //                   Remove all "sandbox" blocks; tool policy provides internal isolation.
  //   VM: Linux VMs — Multipass / KVM: strongest combined posture (VM boundary + Docker).
  //                   Keep "sandbox" blocks — Docker works inside Linux VMs.
  //   See Phase 3 — Security for the full trade-off analysis.
  //
  // Replace placeholder values:
  //   +46XXXXXXXXX  → your phone number
  //   Workspace paths → your actual paths
  //
  // Environment variables (set in LaunchDaemon/LaunchAgent plist or systemd EnvironmentFile):
  //   OPENCLAW_GATEWAY_TOKEN
  //   ANTHROPIC_API_KEY
  //   BRAVE_API_KEY (or OPENROUTER_API_KEY for Perplexity)
  // See Phase 6 — Deployment > Secrets Management for details.
  // ============================================================

  // --- Chat Commands ---
  // Disable dangerous chat commands. These allow users to
  // run shell commands, edit config, or restart the gateway
  // from within a chat message.
  "commands": {
    "native": "auto",
    "nativeSkills": "auto",
    "bash": false,       // Blocks !command shell access
    "config": false,     // Blocks /config writes
    "debug": false,      // Blocks /debug runtime overrides
    "restart": false     // Blocks /restart
  },

  // --- Global Tool Restrictions ---
  "tools": {
    // Only deny tools globally that NO agent should ever have.
    // web_search, web_fetch, browser are denied per-agent (not here) —
    // global deny overrides agent-level allow, which would break the search agent.
    "deny": ["canvas", "gateway"],

    // Disable elevated mode — prevents sandbox escape
    "elevated": { "enabled": false },

    // Web search provider config (accessible only to agents that allow the tool)
    "web": {
      "search": {
        "enabled": true,
        "provider": "brave",
        "apiKey": "${BRAVE_API_KEY}"

        // Alternative: Perplexity via OpenRouter
        // "provider": "perplexity",
        // "perplexity": {
        //   "apiKey": "${OPENROUTER_API_KEY}",
        //   "baseUrl": "https://openrouter.ai/api/v1",
        //   "model": "perplexity/sonar-pro"
        // }
      }
    }
  },

  // --- Skills ---
  // Only allow known-good bundled skills. No skill installer configured
  // means no new skills can be added from ClawHub.
  "skills": {
    "allowBundled": ["coding-agent", "github", "healthcheck", "weather"]
  },

  // --- Session Isolation ---
  "session": {
    // Each sender on each channel gets their own isolated session
    "dmScope": "per-channel-peer",

    // Inter-agent communication settings
    "agentToAgent": {
      "maxPingPongTurns": 5
    }
  },

  // --- Agents ---
  "agents": {
    "defaults": {
      // Pre-compaction memory flush — saves important context to memory before compacting.
      // Without this, the agent forgets everything from the compacted conversation portion.
      // Flush triggers silently when token estimate nears the reserve floor.
      "compaction": {
        "mode": "safeguard",
        "reserveTokensFloor": 20000,
        "memoryFlush": {
          "enabled": true,
          "softThresholdTokens": 4000,
          "systemPrompt": "Session nearing compaction. Store durable memories now.",
          "prompt": "Write any lasting notes to memory/YYYY-MM-DD.md; reply with NO_REPLY if nothing to store."
        }
      },

      // Memory search — semantic + keyword hybrid search across memory files.
      // Local provider: no API key, ~500MB disk, full privacy (nothing leaves your machine).
      // Remote alternatives: "openai", "gemini", "voyage" (require separate API keys).
      // See Phase 2 — Memory for full provider comparison.
      "memorySearch": {
        "enabled": true,
        "provider": "local",
        "query": {
          "hybrid": {
            "enabled": true,
            "vectorWeight": 0.7,
            "textWeight": 0.3
          }
        },
        "cache": {
          "enabled": true,
          "maxEntries": 50000
        }
      },
      "maxConcurrent": 4,
      "subagents": {
        "maxConcurrent": 8,
        "model": "anthropic/claude-sonnet-4-5",
        "thinking": "low"
      },
      // Default sandbox (Docker isolation / Linux VMs): non-main sessions run in Docker with no network.
      // macOS VM isolation: remove this block — no Docker available inside macOS VM.
      // Linux VM isolation: keep this block — Docker works inside Linux VMs.
      "sandbox": {
        "mode": "non-main",
        "scope": "agent",
        "workspaceAccess": "rw"
      }
    },
    "list": [
      {
        // MAIN AGENT — operator access via Control UI / CLI
        // Full tool access except web tools. WhatsApp routes here automatically
        // (no bindings needed — main is the default agent).
        // Web access delegated to search agent via sessions_send.
        "id": "main",
        "default": true,
        "workspace": "/Users/openclaw/.openclaw/workspaces/main",
        "tools": {
          "deny": ["web_search", "web_fetch", "browser"]
        },
        "subagents": { "allowAgents": ["search"] }
      },
      {
        // SEARCH AGENT — isolated web search + content processing
        // Only reachable via sessions_send from main agent.
        // No channel binding = can't be messaged directly.
        // No filesystem tools — nothing to read or exfiltrate.
        // Docker isolation / Linux VMs: Sandboxed — can't read auth-profiles.json (on host, outside container).
        // macOS VM isolation: No sandbox — tool policy provides isolation (only API keys at risk within VM).
        "id": "search",
        "workspace": "/Users/openclaw/.openclaw/workspaces/search",
        "agentDir": "/Users/openclaw/.openclaw/agents/search/agent",
        "model": "anthropic/claude-sonnet-4-5",
        "tools": {
          "allow": ["web_search", "web_fetch", "sessions_send", "session_status"],
          "deny": ["exec", "read", "write", "edit", "apply_patch", "process", "browser", "gateway", "cron"]
        },
        "subagents": { "allowAgents": [] },
        "sandbox": {
          "mode": "all",
          "scope": "agent",
          "workspaceAccess": "none"
        }
      }
    ]
  },

  // --- Channel Configuration ---
  // No bindings section — unbound channels auto-route to the default agent (main).
  // For dedicated channel agents with restricted tools (defense-in-depth),
  // see the recommended example.
  "channels": {
    "whatsapp": {
      "dmPolicy": "pairing",
      "selfChatMode": false,
      "allowFrom": ["+46XXXXXXXXX"], // REPLACE with real number — placeholder causes silent message drops
      "groupPolicy": "allowlist",
      "groups": { "*": { "requireMention": true } },
      "mediaMaxMb": 50,
      "debounceMs": 0
    }
  },

  // --- Gateway ---
  "gateway": {
    "port": 18789,
    "mode": "local",
    "bind": "loopback",
    "auth": {
      "mode": "token",
      "token": "${OPENCLAW_GATEWAY_TOKEN}"
    }
  },

  // --- Network Discovery ---
  "discovery": {
    "mdns": { "mode": "minimal" }
  },

  // --- Logging ---
  "logging": {
    "redactSensitive": "tools",
    "redactPatterns": ["pplx-[A-Za-z0-9]+"]
  },

  // --- Plugins ---
  "plugins": {
    "entries": {
      "whatsapp": { "enabled": true },
      "web-guard": {
        "enabled": true,
        "config": {
          "failOpen": false,
          "timeoutMs": 10000,
          "maxContentLength": 50000,
          "sensitivity": 0.5
        }
      },
      "channel-guard": {
        "enabled": true,
        "config": {
          "failOpen": false,
          "sensitivity": 0.5,
          "warnThreshold": 0.4,
          "blockThreshold": 0.8
        }
      },
      "agent-guard": {
        "enabled": true,
        "config": {
          "failOpen": false,
          "sensitivity": 0.5,
          "warnThreshold": 0.4,
          "blockThreshold": 0.8,
          "guardAgents": [],
          "skipTargetAgents": []
        }
      }
    }
  }
}
```
