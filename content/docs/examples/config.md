---
title: "Recommended Configuration"
description: "Complete annotated OpenClaw config with main/search architecture, Docker sandboxing, egress allowlisting, and all security hardening applied."
weight: 121
---

Complete annotated `openclaw.json` implementing the recommended two-agent architecture: main (sandboxed, channel-facing, full exec + browser on egress-allowlisted network) and search (web only, no filesystem). Core guard plugins enabled (channel-guard, web-guard). Uses JSON5 comments for inline documentation — OpenClaw supports JSON5 natively. For maximum hardening with deterministic guards (file-guard, network-guard, command-guard), see [Hardened Multi-Agent](../hardened-multi-agent.md).

Main runs on `openclaw-egress` — a custom Docker network with host-level firewall rules restricting outbound to pre-approved hosts (npm, git, Playwright CDN, etc.). See [`scripts/network-egress/`](https://github.com/IT-HUSET/openclaw-guide/tree/main/scripts/network-egress/) for setup. For exec-separated architecture with a dedicated computer agent, see [Hardened Multi-Agent](../hardened-multi-agent.md). For a minimal starting point (single channel, two agents, no egress), see [Basic Configuration](basic-config.md).

Three deployment postures are covered: Docker isolation (this config), macOS VM isolation (remove sandbox blocks), and Linux VM isolation (keep sandbox blocks). See [Phase 3 — Security](../phases/phase-3-security.md#deployment-isolation-options) for the full trade-off analysis.

```json5
{
  // ============================================================
  // OpenClaw Configuration — Recommended Multi-Agent Setup
  // ============================================================
  // NOTE: This file uses JSON5 comments (//) for documentation.
  // OpenClaw supports JSON5 natively — no need to strip comments.
  //
  // Two-agent architecture:
  //   Main agent   — channel-facing, sandboxed (Docker, egress-allowlisted network),
  //                  full exec + browser. Delegates web search to search agent.
  //   Search agent — web_search/web_fetch only, no filesystem, no exec.
  //
  // For exec-separated architecture with a dedicated computer agent,
  // see hardened-multi-agent.md.
  //
  // Optional: Dedicated channel agents (defense-in-depth) — commented out below.
  //   Uncomment to route channels to restricted agents instead of main.
  //
  // Prerequisites:
  //   1. Guard plugins installed (channel-guard, web-guard)
  //   2. Docker running
  //
  // OPTIONAL HARDENING PLUGINS (not included here — see hardened-multi-agent.md):
  //   file-guard, network-guard, command-guard — deterministic guards for
  //   path protection, domain allowlisting, and dangerous command blocking.
  //   3. Egress-allowlisted network created (see scripts/network-egress/)
  //
  // DEPLOYMENT OPTIONS:
  //   Docker isolation — Dedicated OS user + Docker (this config): stronger
  //                      internal agent isolation via Docker sandboxing.
  //   VM: macOS VMs — Lume / Parallels: stronger host isolation, no Docker inside VM.
  //                   Remove all "sandbox" blocks; tool policy provides internal isolation.
  //   VM: Linux VMs — Multipass / KVM: strongest combined posture (VM boundary + Docker).
  //                   Keep "sandbox" blocks — Docker works inside Linux VMs.
  //   See Phase 3 — Security for the full trade-off analysis.
  //
  // Replace placeholder values:
  //   +46XXXXXXXXX  → your phone number
  //   user@yourdomain.com → your Google Chat email
  //   <node-name>.<tailnet> → your Tailscale node
  //
  // Environment variables (set in LaunchDaemon/LaunchAgent plist or systemd EnvironmentFile):
  //   OPENCLAW_GATEWAY_TOKEN
  //   ANTHROPIC_API_KEY
  //   BRAVE_API_KEY (or OPENROUTER_API_KEY for Perplexity)
  //   OPENROUTER_API_KEY (required for image-gen plugin; also used by Perplexity)
  //   GITHUB_TOKEN
  //   GOOGLE_CHAT_SERVICE_ACCOUNT_FILE (path to service account JSON key)
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
    // Per-agent tools (exec, browser, web_search, etc.) are controlled in each
    // agent's allow/deny — global deny overrides agent-level allow.
    "deny": ["canvas", "gateway", "nodes"],

    // Disable elevated mode globally — prevents sandbox escape
    "elevated": { "enabled": false },

    // Web search provider config (accessible only to agents that allow web_search)
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
    "allowBundled": ["coding-agent", "github", "healthcheck", "weather", "video-frames"]
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
      // Local provider: no API key, ~500MB disk, full privacy.
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
        "thinking": "low",
        // "maxSpawnDepth": 3,          // Max nesting depth for nested sub-agents (2026.2.16+)
        // "maxChildrenPerAgent": 10    // Max concurrent children per parent agent (2026.2.16+)
      }
      // NOTE: No default sandbox block — each agent defines its own sandbox explicitly.
      // Both core agents use mode:"all" with different network settings,
      // so a shared default would be misleading.
    },
    "list": [
      {
        // MAIN AGENT — channel-facing, full exec + browser on egress-allowlisted network
        // Sandboxed with Docker on openclaw-egress — outbound restricted to pre-approved hosts.
        // Has exec, browser, and filesystem tools. Denies web_search (delegated to search).
        // IMPORTANT: Create network FIRST: docker network create openclaw-egress
        // Gateway startup will fail if network doesn't exist.
        // See scripts/network-egress/ for egress allowlisting setup.
        "id": "main",
        "default": true,
        "workspace": "/Users/openclaw/.openclaw/workspaces/main",
        "agentDir": "/Users/openclaw/.openclaw/agents/main/agent",
        "tools": {
          "allow": ["group:runtime", "group:fs", "group:sessions", "memory_search", "memory_get", "message", "browser", "web_fetch"],
          "deny": ["web_search", "canvas", "group:automation"],
          "elevated": { "enabled": false }
        },
        "subagents": { "allowAgents": ["search"] },
        // Signal has no native @mention — regex patterns for group mention gating.
        "groupChat": {
          "mentionPatterns": ["@openclaw", "hey openclaw"]
        },
        "sandbox": {
          "mode": "all",
          "scope": "agent",
          "workspaceAccess": "rw",
          "docker": { "network": "openclaw-egress" }
        }
      },
      {
        // SEARCH AGENT — isolated web search + content processing
        // Only reachable via sessions_send from main.
        // No channel binding = can't be messaged directly.
        // No filesystem tools — tool policy provides isolation.
        // Unsandboxed — workaround for #9857 (sessions_spawn broken when both agents sandboxed + per-agent tools).
        // Cheaper model — search queries don't need Opus.
        "id": "search",
        "workspace": "/Users/openclaw/.openclaw/workspaces/search",
        "agentDir": "/Users/openclaw/.openclaw/agents/search/agent",
        "model": "anthropic/claude-sonnet-4-5",
        "tools": {
          "allow": ["web_search", "web_fetch", "sessions_send", "session_status"],
          "deny": ["exec", "read", "write", "edit", "apply_patch", "process", "browser", "gateway", "cron"]
        },
        "subagents": { "allowAgents": [] }
      }

      // --- OPTIONAL: Local admin agent (host management) ---
      // Unsandboxed agent for cron jobs, service management, workspace file updates,
      // and host-level tasks. Shares main's workspace for consistent personality/context.
      // Only reachable via Control UI — no channel binding, no agent delegation path.
      // Uncomment to enable. Create agentDir before starting.
      //
      // ,{
      //   "id": "local-admin",
      //   "workspace": "/Users/openclaw/.openclaw/workspaces/main",
      //   "agentDir": "/Users/openclaw/.openclaw/agents/local-admin/agent",
      //   "tools": {
      //     "allow": ["group:fs", "group:runtime", "group:automation", "memory_search", "memory_get"],
      //     "deny": ["group:web", "browser", "message"],
      //     "elevated": { "enabled": false }
      //   },
      //   "subagents": { "allowAgents": [] }
      //   // No sandbox block — runs directly on host as openclaw user
      // }

      // --- OPTIONAL: Dedicated channel agents (defense-in-depth) ---
      // Uncomment to route channels to restricted agents instead of main.
      // Each channel agent has no exec/process — delegates to main/search.
      // Also uncomment the corresponding bindings in the bindings section below.
      // NOTE: Requires fix for openclaw#15176 — channel bindings to non-default
      // agents are broken in 2026.2.12 (session path regression).
      //
      // ,{
      //   "id": "whatsapp",
      //   "workspace": "/Users/openclaw/.openclaw/workspaces/whatsapp",
      //   "agentDir": "/Users/openclaw/.openclaw/agents/whatsapp/agent",
      //   "tools": {
      //     "deny": ["web_search", "web_fetch", "browser", "exec", "process"],
      //     "elevated": { "enabled": false }
      //   },
      //   "subagents": { "allowAgents": ["main", "search"] }
      // },
      // {
      //   "id": "signal",
      //   "workspace": "/Users/openclaw/.openclaw/workspaces/signal",
      //   "agentDir": "/Users/openclaw/.openclaw/agents/signal/agent",
      //   "tools": {
      //     "deny": ["web_search", "web_fetch", "browser", "exec", "process"],
      //     "elevated": { "enabled": false }
      //   },
      //   "subagents": { "allowAgents": ["main", "search"] }
      // },
      // {
      //   "id": "googlechat",
      //   "workspace": "/Users/openclaw/.openclaw/workspaces/googlechat",
      //   "agentDir": "/Users/openclaw/.openclaw/agents/googlechat/agent",
      //   "tools": {
      //     "deny": ["web_search", "web_fetch", "browser", "exec", "process"],
      //     "elevated": { "enabled": false }
      //   },
      //   "subagents": { "allowAgents": ["main", "search"] }
      // }
    ]
  },

  // --- Channel Routing ---
  // All channels route to main (the default agent). Search has no binding —
  // unreachable from channels, only via sessions_send.
  // channel-guard scans inbound messages.
  //
  // OPTIONAL: Dedicated channel agents (defense-in-depth)
  // If you uncommented the channel agents above, add bindings:
  //   { "agentId": "whatsapp", "match": { "channel": "whatsapp" } },
  //   { "agentId": "signal", "match": { "channel": "signal" } },
  //   { "agentId": "googlechat", "match": { "channel": "googlechat" } }
  // NOTE: Requires fix for openclaw#15176 — channel bindings to non-default
  // agents are broken in 2026.2.12 (session path regression).

  // --- Channel Configuration ---
  "channels": {
    "whatsapp": {
      "dmPolicy": "pairing",
      "selfChatMode": false,
      "allowFrom": ["+46XXXXXXXXX"], // REPLACE with real number — placeholder causes silent message drops
      "groupPolicy": "allowlist",
      "groups": { "*": { "requireMention": true } },
      "mediaMaxMb": 50,
      "debounceMs": 0
    },
    "signal": {
      "enabled": true,
      "account": "+46XXXXXXXXX",
      "dmPolicy": "pairing",
      "allowFrom": ["+46XXXXXXXXX"], // REPLACE with real number — placeholder causes silent message drops
      "groupPolicy": "allowlist",
      "mediaMaxMb": 8
    },
    "googlechat": {
      "enabled": true,
      "serviceAccountFile": "${GOOGLE_CHAT_SERVICE_ACCOUNT_FILE}",
      "audienceType": "app-url",
      "audience": "https://<node-name>.<tailnet>.ts.net/googlechat",
      "dm": {
        "policy": "allowlist",
        "allowFrom": ["user@yourdomain.com"] // REPLACE with real email — placeholder causes silent message drops
      },
      "groupPolicy": "allowlist",
      "groups": { "*": { "requireMention": true } },
      "mediaMaxMb": 20
    }
  },

  // --- Browser ---
  // Required for the main agent's browser tool. Uses a managed profile —
  // never your personal Chrome. evaluateEnabled:false blocks raw JS evaluation.
  "browser": {
    "enabled": true,
    "defaultProfile": "openclaw",
    "headless": true,
    "evaluateEnabled": false,
    "profiles": {
      "openclaw": { "cdpPort": 18800, "color": "#FF4500" }
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
      "signal": { "enabled": true },
      "googlechat": { "enabled": true },
      "channel-guard": {
        // Scans inbound channel messages for prompt injection before they reach agents.
        // failOpen:false — block message if scanner fails (safe default).
        "enabled": true,
        "config": {
          "failOpen": false,
          "sensitivity": 0.5,
          "warnThreshold": 0.4,
          "blockThreshold": 0.8
        }
      },
      "web-guard": {
        // Scans web_fetch responses for prompt injection before content reaches agent.
        // Protects main and search agents from poisoned web content.
        "enabled": true,
        "config": {
          "failOpen": false,
          "sensitivity": 0.5,
          "timeoutMs": 10000,
          "maxContentLength": 50000
        }
      },
      // OPTIONAL HARDENING PLUGINS (see hardened-multi-agent.md for full config):
      // "file-guard": { "enabled": true, "config": { ... } },
      // "network-guard": { "enabled": true, "config": { ... } },
      // "command-guard": { "enabled": true, "config": { ... } },
      "image-gen": {
        "enabled": true,
        "config": {
          // Uses $OPENROUTER_API_KEY from env (same key as Perplexity if configured)
          "defaultModel": "openai/gpt-5-image-mini",
          "defaultAspectRatio": "1:1",
          "defaultImageSize": "2K",
          "timeoutMs": 60000
        }
      }
    }
  }
}
```
