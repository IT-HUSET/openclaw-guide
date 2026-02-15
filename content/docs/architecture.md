---
title: "OpenClaw Architecture"
description: "Core components, module dependencies, networking, message flows."
weight: 110
---

System architecture reference for [OpenClaw](https://docs.openclaw.ai) — covering core components, module dependencies, networking, and message flows.

> **Companion to the guide.** This document explains *how the system works internally*. For setup and configuration, see the [phase guides](phases/_index.md).

---

## System Overview

OpenClaw is a single-process Node.js gateway that connects LLM-powered agents to messaging channels, with tool execution, sandboxing, multi-agent routing, and a browser-based control UI — all multiplexed on one port.

```mermaid
%%{init: { "theme": "base", "themeVariables": { "fontFamily": "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial", "primaryColor": "#1F4E79", "primaryBorderColor": "#93C5FD", "primaryTextColor": "#F8FAFC", "lineColor": "#94A3B8", "secondaryColor": "#334155", "tertiaryColor": "#334155", "clusterBkg": "transparent", "clusterBorder": "#64748B", "background": "transparent" } }}%%
graph TB
    subgraph Users["End Users"]
        WA["WhatsApp"]
        SIG["Signal"]
        TG["Telegram"]
        DC["Discord"]
        SL["Slack"]
        OTHER["IRC / iMessage / ..."]
    end

    subgraph GW["OpenClaw Gateway :18789"]
        direction TB
        CH["Channel<br/>Connectors"]
        RT["Session Router<br/>& Queue"]
        AR["Agent Runtime"]
        TS["Tool System"]
        SS["Session Store"]
        MEM["Memory"]
        UI["Control UI<br/>(Vite + Lit)"]
        WS["WebSocket<br/>Protocol v3"]
        API["HTTP API<br/>/v1/chat/completions"]
    end

    subgraph Providers["LLM Providers"]
        ANT["Anthropic"]
        OAI["OpenAI"]
        GEM["Google Gemini"]
        OR["OpenRouter"]
        XAI["xAI / Groq / ..."]
    end

    subgraph Exec["Execution"]
        HOST["Host OS"]
        SBX["Docker<br/>Sandbox"]
        BRW["Browser<br/>(CDP)"]
        NODES["Paired Devices<br/>(macOS/iOS)"]
    end

    subgraph Storage["Filesystem"]
        CFG["~/.openclaw/<br/>openclaw.json"]
        WSP["Workspace/<br/>AGENTS.md, SOUL.md"]
        SESS["sessions/<br/>*.jsonl"]
        CREDS["credentials/"]
    end

    Users --> CH
    CH --> RT
    RT --> AR
    AR --> TS
    AR --> SS
    AR --> MEM
    AR <--> Providers
    TS --> HOST
    TS --> SBX
    TS --> BRW
    TS --> NODES
    SS --> SESS
    GW --> Storage
    UI --> WS
    API --> AR

    classDef gateway fill:#1F4E79,stroke:#93C5FD,color:#F8FAFC,stroke-width:1.5px
    classDef user fill:#1F6A5A,stroke:#86EFAC,color:#F8FAFC,stroke-width:1.5px
    classDef provider fill:#5B3E8C,stroke:#C4B5FD,color:#F8FAFC,stroke-width:1.5px
    classDef exec fill:#1E637D,stroke:#7DD3FC,color:#F8FAFC,stroke-width:1.5px
    classDef storage fill:#334155,stroke:#94A3B8,color:#F8FAFC,stroke-width:1.5px

    class WA,SIG,TG,DC,SL,OTHER user
    class CH,RT,AR,TS,SS,MEM,UI,WS,API gateway
    class ANT,OAI,GEM,OR,XAI provider
    class HOST,SBX,BRW,NODES exec
    class CFG,WSP,SESS,CREDS storage
```

### Key Characteristics

- **Single process** — one Node.js process handles all agents, channels, sessions, and the control UI
- **Single port** — HTTP, WebSocket, and the control UI all multiplex on port `18789`
- **Multi-agent** — multiple isolated agents with separate workspaces, sessions, and auth profiles
- **Progressive security** — sandboxing, tool restrictions, and network isolation are opt-in layers

---

## Core Components

### Component Map

```mermaid
%%{init: { "theme": "base", "themeVariables": { "fontFamily": "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial", "primaryColor": "#1F4E79", "primaryBorderColor": "#93C5FD", "primaryTextColor": "#F8FAFC", "lineColor": "#94A3B8", "secondaryColor": "#334155", "tertiaryColor": "#334155", "clusterBkg": "transparent", "clusterBorder": "#64748B", "background": "transparent" } }}%%
graph LR
    subgraph Core["Gateway Core"]
        CFG_SYS["Config System<br/>(JSON5 + hot reload)"]
        AUTH["Auth<br/>(token / password /<br/>Tailscale / device)"]
        RPC["RPC Framework<br/>(req/res/event)"]
    end

    subgraph Agents["Agent Layer"]
        RUNTIME["Agent Runtime"]
        BOOTSTRAP["Bootstrap Loader<br/>(AGENTS.md, SOUL.md,<br/>TOOLS.md, IDENTITY.md)"]
        CTX["Context Manager<br/>(pruning, compaction,<br/>memory flush)"]
    end

    subgraph Channels["Channel Layer"]
        WA_C["WhatsApp<br/>(Baileys)"]
        TG_C["Telegram<br/>(grammY)"]
        DC_C["Discord<br/>(Bot API)"]
        SL_C["Slack<br/>(Bolt SDK)"]
        SIG_C["Signal<br/>(signal-cli)"]
        MORE["15+ plugin<br/>channels"]
    end

    subgraph Sessions["Session Layer"]
        ROUTER["Binding Router"]
        QUEUE["Lane-Aware Queue<br/>(FIFO, debounce)"]
        STORE["Session Store<br/>(JSONL transcripts)"]
        SCOPE["Scope Resolver<br/>(main / per-peer /<br/>per-channel-peer)"]
    end

    subgraph Tools["Tool Layer"]
        BUILTIN["Built-in Tools<br/>(exec, read, write,<br/>edit, web_search, ...)"]
        BROWSER["Browser Control<br/>(CDP, multi-profile)"]
        SANDBOX["Sandbox Engine<br/>(Docker containers)"]
        PLUGINS["Plugin System<br/>(jiti, npm-installable)"]
    end

    subgraph Auto["Automation"]
        HOOKS["Hooks<br/>(event-driven)"]
        CRON["Cron Jobs"]
        WEBHOOKS["Webhooks"]
        HEARTBEAT["Heartbeats"]
    end

    Core --> Agents
    Core --> Channels
    Core --> Sessions
    Agents --> Tools
    Agents --> Sessions
    Channels --> Sessions
    Tools --> Auto

    classDef core fill:#1F4E79,stroke:#93C5FD,color:#F8FAFC,stroke-width:1.5px
    classDef agent fill:#1F6A5A,stroke:#86EFAC,color:#F8FAFC,stroke-width:1.5px
    classDef channel fill:#5B3E8C,stroke:#C4B5FD,color:#F8FAFC,stroke-width:1.5px
    classDef session fill:#334155,stroke:#94A3B8,color:#F8FAFC,stroke-width:1.5px
    classDef tool fill:#1E637D,stroke:#7DD3FC,color:#F8FAFC,stroke-width:1.5px
    classDef auto fill:#3730A3,stroke:#A5B4FC,color:#F8FAFC,stroke-width:1.5px

    class CFG_SYS,AUTH,RPC core
    class RUNTIME,BOOTSTRAP,CTX agent
    class WA_C,TG_C,DC_C,SL_C,SIG_C,MORE channel
    class ROUTER,QUEUE,STORE,SCOPE session
    class BUILTIN,BROWSER,SANDBOX,PLUGINS tool
    class HOOKS,CRON,WEBHOOKS,HEARTBEAT auto
```

### Component Details

| Component | Role | Key Config |
|-----------|------|------------|
| **Gateway Core** | Process lifecycle, config, auth, RPC | `gateway.port`, `gateway.bind`, `gateway.auth` |
| **Agent Runtime** | LLM interaction, tool orchestration, context management | `agents.list[]`, `agents.defaults.model` |
| **Channel Connectors** | Protocol adapters for each messaging platform | `channels.<type>.accounts` |
| **Session Router** | Maps inbound messages to agent + session key via bindings | `bindings[]`, DM scope config |
| **Queue** | Lane-aware FIFO with debounce, concurrency caps | `messages.queue.*` |
| **Tool System** | Tool dispatch with policy enforcement and sandboxing | `tools.allow/deny`, `sandbox.*` |
| **Plugin System** | TypeScript extensions loaded at runtime via jiti | `~/.openclaw/extensions/`, workspace `.openclaw/extensions/` |
| **Automation** | Hooks, cron, webhooks, heartbeats for event-driven behavior | `hooks/`, `cron[]`, `gateway.webhooks` |
| **Control UI** | Browser dashboard (Vite + Lit SPA) on same port | `http://127.0.0.1:18789/` |

---

## Module Dependencies

```mermaid
%%{init: { "theme": "base", "themeVariables": { "fontFamily": "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial", "primaryColor": "#1F4E79", "primaryBorderColor": "#93C5FD", "primaryTextColor": "#F8FAFC", "lineColor": "#94A3B8", "secondaryColor": "#334155", "tertiaryColor": "#334155", "clusterBkg": "transparent", "clusterBorder": "#64748B", "background": "transparent" } }}%%
graph TD
    CONFIG["Config System<br/>(JSON5, file watcher,<br/>hot reload)"]
    AUTH_MOD["Auth Module<br/>(token, password,<br/>Tailscale, device identity)"]
    GW_CORE["Gateway Core<br/>(HTTP + WS server)"]
    CHAN_MGR["Channel Manager"]
    AGENT_MGR["Agent Manager"]
    SESS_MGR["Session Manager"]
    QUEUE_MGR["Queue Manager"]
    TOOL_MGR["Tool Manager"]
    SANDBOX_MGR["Sandbox Manager"]
    PLUGIN_MGR["Plugin Manager"]
    MODEL_MGR["Model Provider<br/>Manager"]
    HOOK_MGR["Hook Manager"]
    MEM_MGR["Memory Manager"]
    BROWSER_MGR["Browser Manager"]
    NODE_MGR["Node Manager<br/>(Device Pairing)"]
    UI_MOD["Control UI"]

    CONFIG --> GW_CORE
    CONFIG --> AUTH_MOD
    CONFIG --> CHAN_MGR
    CONFIG --> AGENT_MGR
    CONFIG --> TOOL_MGR

    AUTH_MOD --> GW_CORE

    GW_CORE --> UI_MOD
    GW_CORE --> CHAN_MGR
    GW_CORE --> AGENT_MGR
    GW_CORE --> NODE_MGR

    CHAN_MGR --> SESS_MGR
    SESS_MGR --> QUEUE_MGR
    QUEUE_MGR --> AGENT_MGR

    AGENT_MGR --> MODEL_MGR
    AGENT_MGR --> TOOL_MGR
    AGENT_MGR --> MEM_MGR
    AGENT_MGR --> HOOK_MGR

    TOOL_MGR --> SANDBOX_MGR
    TOOL_MGR --> BROWSER_MGR
    TOOL_MGR --> PLUGIN_MGR
    TOOL_MGR --> NODE_MGR

    PLUGIN_MGR --> TOOL_MGR
    PLUGIN_MGR --> HOOK_MGR

    classDef core fill:#1F4E79,stroke:#93C5FD,color:#F8FAFC,stroke-width:1.5px
    classDef agent fill:#1F6A5A,stroke:#86EFAC,color:#F8FAFC,stroke-width:1.5px
    classDef channel fill:#5B3E8C,stroke:#C4B5FD,color:#F8FAFC,stroke-width:1.5px
    classDef tool fill:#1E637D,stroke:#7DD3FC,color:#F8FAFC,stroke-width:1.5px

    class CONFIG,AUTH_MOD,GW_CORE,UI_MOD core
    class AGENT_MGR,MODEL_MGR,MEM_MGR agent
    class CHAN_MGR,SESS_MGR,QUEUE_MGR channel
    class TOOL_MGR,SANDBOX_MGR,BROWSER_MGR,PLUGIN_MGR,NODE_MGR,HOOK_MGR tool
```

### External Dependencies

```mermaid
%%{init: { "theme": "base", "themeVariables": { "fontFamily": "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial", "primaryColor": "#1F4E79", "primaryBorderColor": "#93C5FD", "primaryTextColor": "#F8FAFC", "lineColor": "#94A3B8", "secondaryColor": "#334155", "tertiaryColor": "#334155", "clusterBkg": "transparent", "clusterBorder": "#64748B", "background": "transparent" } }}%%
graph LR
    subgraph Required
        NODE["Node.js 22+"]
    end

    subgraph "LLM Providers (at least one)"
        ANTH["Anthropic<br/>ANTHROPIC_API_KEY"]
        OPENAI["OpenAI<br/>OPENAI_API_KEY"]
        GEMINI["Google Gemini<br/>GEMINI_API_KEY"]
        OPENR["OpenRouter<br/>OPENROUTER_API_KEY"]
    end

    subgraph "Channels (as needed)"
        BAILEYS["Baileys<br/>(WhatsApp, QR pair)"]
        GRAMMY["grammY<br/>(Telegram bot token)"]
        DISCORDJS["Discord.js<br/>(bot token)"]
        BOLT["Bolt SDK<br/>(Slack tokens)"]
        SIGCLI["signal-cli<br/>(Signal daemon)"]
    end

    subgraph "Optional Infrastructure"
        DOCKER["Docker / OrbStack<br/>(sandboxing)"]
        TS_CLI["Tailscale<br/>(remote access)"]
        BRAVE["Brave Search API<br/>(web_search tool)"]
        FIRE["Firecrawl<br/>(anti-bot fallback)"]
        ELEVEN["ElevenLabs<br/>(TTS)"]
    end

    OC["OpenClaw<br/>Gateway"] --> Required
    OC --> ANTH & OPENAI & GEMINI & OPENR
    OC --> BAILEYS & GRAMMY & DISCORDJS & BOLT & SIGCLI
    OC --> DOCKER & TS_CLI & BRAVE & FIRE & ELEVEN

    classDef coredep fill:#1F4E79,stroke:#93C5FD,color:#F8FAFC,stroke-width:1.5px
    classDef providerdep fill:#5B3E8C,stroke:#C4B5FD,color:#F8FAFC,stroke-width:1.5px
    classDef channeldep fill:#1F6A5A,stroke:#86EFAC,color:#F8FAFC,stroke-width:1.5px
    classDef optdep fill:#1E637D,stroke:#7DD3FC,color:#F8FAFC,stroke-width:1.5px

    class OC,NODE coredep
    class ANTH,OPENAI,GEMINI,OPENR providerdep
    class BAILEYS,GRAMMY,DISCORDJS,BOLT,SIGCLI channeldep
    class DOCKER,TS_CLI,BRAVE,FIRE,ELEVEN optdep
```

---

## Networking

### Port Architecture

OpenClaw multiplexes everything on a single port:

```mermaid
%%{init: { "theme": "base", "themeVariables": { "fontFamily": "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial", "primaryColor": "#1F4E79", "primaryBorderColor": "#93C5FD", "primaryTextColor": "#F8FAFC", "lineColor": "#94A3B8", "secondaryColor": "#334155", "tertiaryColor": "#334155", "clusterBkg": "transparent", "clusterBorder": "#64748B", "background": "transparent" } }}%%
graph TB
    subgraph PORT["TCP :18789 (configurable)"]
        direction TB
        HTTP["HTTP<br/>• Control UI (GET /)<br/>• REST API (GET/POST /api/*)<br/>• Webhooks (POST /hooks/*)<br/>• OpenAI-compat (/v1/chat/completions)"]
        WSS["WebSocket<br/>• Protocol v3 (JSON frames)<br/>• Operator clients<br/>• Node connections<br/>• Real-time events"]
    end

    CLI["CLI Client"] -->|WS| WSS
    BROWSER_UI["Browser"] -->|HTTP| HTTP
    BROWSER_UI -->|WS| WSS
    DEVICE["Paired Device"] -->|WS| WSS
    EXT_SVC["External Service"] -->|HTTP| HTTP

    subgraph ADDITIONAL["Additional Ports (optional)"]
        CDP_PORT["CDP :9222<br/>(browser control)"]
        CDP_RANGE["CDP :18800-18899<br/>(multi-profile browsers)"]
        VNC_PORT["VNC :5900<br/>(sandboxed browser)"]
        NOVNC["noVNC :6080<br/>(sandboxed browser web)"]
    end

    classDef ingress fill:#1F4E79,stroke:#93C5FD,color:#F8FAFC,stroke-width:1.5px
    classDef client fill:#1F6A5A,stroke:#86EFAC,color:#F8FAFC,stroke-width:1.5px
    classDef aux fill:#5B3E8C,stroke:#C4B5FD,color:#F8FAFC,stroke-width:1.5px

    class HTTP,WSS ingress
    class CLI,BROWSER_UI,DEVICE,EXT_SVC client
    class CDP_PORT,CDP_RANGE,VNC_PORT,NOVNC aux
```

### Bind Modes

| Mode | Listens On | Auth Required | Use Case |
|------|-----------|---------------|----------|
| `loopback` | `127.0.0.1` | Optional | Local-only (default) |
| `tailnet` | Tailscale IP | **Yes** | Tailnet access without Serve |
| `lan` | `0.0.0.0` | **Yes** | LAN access |
| `custom` | Explicit interface/IP | **Yes** | Advanced/network-specific binds |
| `auto` | Prefers `127.0.0.1` | Depends | Auto-detect |

### Remote Access Patterns

```mermaid
%%{init: { "theme": "base", "themeVariables": { "fontFamily": "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial", "primaryColor": "#1F4E79", "primaryBorderColor": "#93C5FD", "primaryTextColor": "#F8FAFC", "lineColor": "#94A3B8", "secondaryColor": "#334155", "tertiaryColor": "#334155", "clusterBkg": "transparent", "clusterBorder": "#64748B", "background": "transparent" } }}%%
graph LR
    subgraph Local["Local Machine"]
        CLI_L["CLI / Browser"]
    end

    subgraph Host["OpenClaw Host"]
        GW["Gateway<br/>127.0.0.1:18789"]
        TS_D["Tailscale<br/>Daemon"]
    end

    subgraph Tailscale["Tailscale Network"]
        SERVE["Tailscale Serve<br/>(HTTPS proxy)"]
        FUNNEL["Tailscale Funnel<br/>(public HTTPS)"]
    end

    CLI_L -->|"SSH tunnel<br/>-L 18789:127.0.0.1:18789"| GW
    CLI_L -->|"HTTPS (tailnet)"| SERVE
    CLI_L -->|"HTTPS (public)"| FUNNEL
    SERVE -->|"HTTP proxy"| GW
    FUNNEL -->|"HTTP proxy"| GW
    TS_D --> SERVE
    TS_D --> FUNNEL

    classDef client fill:#1F6A5A,stroke:#86EFAC,color:#F8FAFC,stroke-width:1.5px
    classDef host fill:#1F4E79,stroke:#93C5FD,color:#F8FAFC,stroke-width:1.5px
    classDef tailnet fill:#5B3E8C,stroke:#C4B5FD,color:#F8FAFC,stroke-width:1.5px

    class CLI_L client
    class GW,TS_D host
    class SERVE,FUNNEL tailnet
```

**Tailscale Serve** (recommended for remote access): gateway binds to loopback, Tailscale proxies HTTPS to your tailnet. Tailscale Serve automatically adds identity headers (`Tailscale-User-Login`, `Tailscale-User-Name`) to proxied requests when the connecting client is authenticated via Tailscale — no additional configuration required. OpenClaw uses these for passwordless auth.

**Tailscale Funnel**: public HTTPS endpoint (ports 443, 8443, 10000). Requires `gateway.auth.mode: "password"`.

**SSH tunnel**: simplest fallback — `ssh -N -L 18789:127.0.0.1:18789 user@host`.

### WebSocket Protocol v3

```mermaid
%%{init: { "theme": "base", "themeVariables": { "fontFamily": "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial", "primaryColor": "#1F4E79", "primaryBorderColor": "#93C5FD", "primaryTextColor": "#F8FAFC", "lineColor": "#94A3B8", "secondaryColor": "#334155", "tertiaryColor": "#334155", "clusterBkg": "transparent", "clusterBorder": "#64748B", "background": "transparent" } }}%%
sequenceDiagram
    participant C as Client
    participant S as Gateway

    Note over C,S: Connection Handshake
    C->>S: WebSocket upgrade
    S-->>C: event: connect.challenge {nonce, timestamp} (optional)
    C->>S: req: connect {auth, role, scopes, minProtocol, maxProtocol, deviceIdentity?}
    S->>C: res: hello-ok {protocol, policy, deviceToken?}

    Note over C,S: Agent Run
    C->>S: req: agent {message, sessionKey?}
    S->>C: res: {ok: true, payload: {status: "accepted", runId}}
    loop Streaming
        S->>C: event: agent {type: thinking | text | tool_call | tool_output}
    end
    S->>C: event: agent {type: done, runId, usage?}

    Note over C,S: Other Operations
    C->>S: req: sessions.list
    S->>C: res: {sessions: [...]}
    C->>S: req: channels.status
    S->>C: res: {channels: [...]}
```

**Frame types:**
- **Request**: `{type:"req", id, method, params}` — client-initiated RPC call
- **Response**: `{type:"res", id, ok, payload|error}` — server reply
- **Event**: `{type:"event", event, payload, seq?, stateVersion?}` — server-pushed notification

---

## Message Flow

### Inbound: User to Agent

Full lifecycle of an incoming message (WhatsApp example):

```mermaid
%%{init: { "theme": "base", "themeVariables": { "fontFamily": "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial", "primaryColor": "#1F4E79", "primaryBorderColor": "#93C5FD", "primaryTextColor": "#F8FAFC", "lineColor": "#94A3B8", "secondaryColor": "#334155", "tertiaryColor": "#334155", "clusterBkg": "transparent", "clusterBorder": "#64748B", "background": "transparent" } }}%%
sequenceDiagram
    participant U as User (WhatsApp)
    participant B as Baileys Library
    participant CH as Channel Handler
    participant AC as Access Control
    participant SR as Session Router
    participant Q as Queue
    participant AG as Agent Runtime
    participant LLM as LLM Provider
    participant T as Tool System

    U->>B: WhatsApp message
    B->>CH: Decoded message (sender, body, media)

    Note over CH,AC: Access Control
    CH->>AC: DM/group policy check
    AC-->>AC: Pairing / allowlist / open?
    AC-->>CH: ✓ Allowed

    Note over CH,SR: Session Routing
    CH->>SR: Route message
    SR-->>SR: Match bindings (peer→guild→team→account→channel→default)
    SR-->>SR: Resolve session key (scope: main|per-peer|per-channel-peer)
    SR->>Q: Enqueue {agentId, sessionKey, message}

    Note over Q: Debounce & Queue
    Q-->>Q: Debounce window (1000ms default)
    Q-->>Q: Coalesce rapid text messages
    Q-->>Q: Lane-aware FIFO (per-session serialization)
    Q-->>Q: Global concurrency cap check

    Note over Q,AG: Agent Turn
    Q->>AG: Dispatch turn
    AG-->>AG: Load transcript (JSONL)
    AG-->>AG: Inject bootstrap (first turn: AGENTS.md, SOUL.md, ...)
    AG-->>AG: Context pruning (soft-trim old tool results)
    AG-->>AG: Pre-compaction memory flush (if near token limit)
    AG->>LLM: System prompt + conversation + user message

    loop Tool Use
        LLM->>AG: Tool call request
        AG->>T: Policy check → dispatch
        T-->>T: Sandbox routing (host / Docker)
        T->>AG: Tool result
        AG->>LLM: Tool result + continue
    end

    LLM->>AG: Final text response
    AG->>CH: Response chunks (4000 char limit for WhatsApp)
    CH->>B: Formatted message
    B->>U: WhatsApp reply

    Note over AG: Persistence
    AG-->>AG: Append turn to JSONL transcript
    AG-->>AG: Update session store metadata
```

### Outbound: Agent Response Delivery

```mermaid
%%{init: { "theme": "base", "themeVariables": { "fontFamily": "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial", "primaryColor": "#1F4E79", "primaryBorderColor": "#93C5FD", "primaryTextColor": "#F8FAFC", "lineColor": "#94A3B8", "secondaryColor": "#334155", "tertiaryColor": "#334155", "clusterBkg": "transparent", "clusterBorder": "#64748B", "background": "transparent" } }}%%
graph TD
    RESP["Agent Response"] --> CHUNK["Text Chunker<br/>(per-channel limits)"]
    CHUNK --> PREFIX["Response Prefix<br/>({model}, {identity.name})"]
    PREFIX --> FMT["Channel Formatter"]

    FMT --> WA_F["WhatsApp<br/>• 4000 char chunks<br/>• Media uploads<br/>• Reactions"]
    FMT --> TG_F["Telegram<br/>• Streaming drafts<br/>• Markdown/HTML<br/>• Inline buttons"]
    FMT --> DC_F["Discord<br/>• 2000 char chunks<br/>• Embeds<br/>• Code blocks"]
    FMT --> SL_F["Slack<br/>• 2000 char chunks<br/>• Block Kit<br/>• Threads"]

    WA_F --> RETRY["Retry Policy<br/>(attempts, delay, jitter)"]
    TG_F --> RETRY
    DC_F --> RETRY
    SL_F --> RETRY

    classDef pipeline fill:#1F4E79,stroke:#93C5FD,color:#F8FAFC,stroke-width:1.5px
    classDef channel fill:#1F6A5A,stroke:#86EFAC,color:#F8FAFC,stroke-width:1.5px
    classDef retry fill:#5B3E8C,stroke:#C4B5FD,color:#F8FAFC,stroke-width:1.5px

    class RESP,CHUNK,PREFIX,FMT pipeline
    class WA_F,TG_F,DC_F,SL_F channel
    class RETRY retry
```

---

## Multi-Agent Routing

### Binding Resolution

When a message arrives, OpenClaw matches it against bindings with deterministic precedence:

```mermaid
%%{init: { "theme": "base", "themeVariables": { "fontFamily": "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial", "primaryColor": "#1F4E79", "primaryBorderColor": "#93C5FD", "primaryTextColor": "#F8FAFC", "lineColor": "#94A3B8", "secondaryColor": "#334155", "tertiaryColor": "#334155", "clusterBkg": "transparent", "clusterBorder": "#64748B", "background": "transparent" } }}%%
graph TD
    MSG["Incoming Message<br/>(channel, accountId,<br/>peer, guildId, teamId)"] --> P1

    P1{"Match on<br/>peer?"}
    P1 -->|Yes| AGENT_P["→ Matched Agent"]
    P1 -->|No| P2

    P2{"Match on<br/>guildId?"}
    P2 -->|Yes| AGENT_G["→ Matched Agent"]
    P2 -->|No| P3

    P3{"Match on<br/>teamId?"}
    P3 -->|Yes| AGENT_T["→ Matched Agent"]
    P3 -->|No| P4

    P4{"Match on<br/>accountId?"}
    P4 -->|Yes| AGENT_A["→ Matched Agent"]
    P4 -->|No| P5

    P5{"Match on<br/>channel?"}
    P5 -->|Yes| AGENT_C["→ Matched Agent"]
    P5 -->|No| P6

    P6["Default Agent<br/>(first in agents.list)"]

    classDef input fill:#1F4E79,stroke:#93C5FD,color:#F8FAFC,stroke-width:1.5px
    classDef decision fill:#1E637D,stroke:#7DD3FC,color:#F8FAFC,stroke-width:1.5px
    classDef match fill:#1F6A5A,stroke:#86EFAC,color:#F8FAFC,stroke-width:1.5px

    class MSG input
    class P1,P2,P3,P4,P5 decision
    class AGENT_P,AGENT_G,AGENT_T,AGENT_A,AGENT_C,P6 match
```

**Precedence**: peer (most specific) → guild → team → account → channel → default (least specific). First match wins.

### Agent Isolation Model

Each agent gets its own isolated runtime environment:

```mermaid
%%{init: { "theme": "base", "themeVariables": { "fontFamily": "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial", "primaryColor": "#1F4E79", "primaryBorderColor": "#93C5FD", "primaryTextColor": "#F8FAFC", "lineColor": "#94A3B8", "secondaryColor": "#334155", "tertiaryColor": "#334155", "clusterBkg": "transparent", "clusterBorder": "#64748B", "background": "transparent" } }}%%
graph TB
    subgraph GW["Gateway Process"]
        ROUTER["Binding Router"]
    end

    subgraph A1["Agent: main"]
        WSP1["Workspace:<br/>~/.openclaw/workspaces/main"]
        SESS1["Sessions:<br/>agents/main/sessions/"]
        AUTH1["Auth Profiles:<br/>agents/main/agent/auth-profiles.json"]
        TOOLS1["Tools: full profile"]
    end

    subgraph A2["Agent: search"]
        WSP2["Workspace:<br/>~/.openclaw/workspaces/search"]
        SESS2["Sessions:<br/>agents/search/sessions/"]
        AUTH2["Auth Profiles:<br/>agents/search/agent/auth-profiles.json"]
        TOOLS2["Tools: web_search,<br/>web_fetch only"]
    end

    subgraph A3["Agent: browser"]
        WSP3["Workspace:<br/>~/.openclaw/workspaces/browser"]
        SESS3["Sessions:<br/>agents/browser/sessions/"]
        AUTH3["Auth Profiles:<br/>agents/browser/agent/auth-profiles.json"]
        TOOLS3["Tools: browser only"]
        SBX3["Sandbox: Docker<br/>(network: host)"]
    end

    ROUTER --> A1
    ROUTER --> A2
    ROUTER --> A3

    classDef router fill:#1F4E79,stroke:#93C5FD,color:#F8FAFC,stroke-width:1.5px
    classDef workspace fill:#1F6A5A,stroke:#86EFAC,color:#F8FAFC,stroke-width:1.5px
    classDef state fill:#334155,stroke:#94A3B8,color:#F8FAFC,stroke-width:1.5px
    classDef policy fill:#5B3E8C,stroke:#C4B5FD,color:#F8FAFC,stroke-width:1.5px
    classDef sandbox fill:#1E637D,stroke:#7DD3FC,color:#F8FAFC,stroke-width:1.5px

    class ROUTER router
    class WSP1,WSP2,WSP3 workspace
    class SESS1,SESS2,SESS3,AUTH1,AUTH2,AUTH3 state
    class TOOLS1,TOOLS2,TOOLS3 policy
    class SBX3 sandbox
```

**What's isolated per agent:**
- Workspace directory (files, AGENTS.md, SOUL.md)
- Session store and transcripts
- Auth profiles (API keys, OAuth tokens)
- Tool allow/deny lists
- Sandbox configuration
- Memory store

---

## Sandbox Execution

### Docker Sandbox Architecture

```mermaid
%%{init: { "theme": "base", "themeVariables": { "fontFamily": "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial", "primaryColor": "#1F4E79", "primaryBorderColor": "#93C5FD", "primaryTextColor": "#F8FAFC", "lineColor": "#94A3B8", "secondaryColor": "#334155", "tertiaryColor": "#334155", "clusterBkg": "transparent", "clusterBorder": "#64748B", "background": "transparent" } }}%%
graph TB
    subgraph HOST["Host OS"]
        GW_H["Gateway Process"]
        DOCKER["Docker / OrbStack"]
    end

    subgraph CONTAINER["Docker Container"]
        EXEC_C["exec tool<br/>(shell commands)"]
        FS_C["Mounted workspace<br/>(/agent — ro or rw)"]
        NET_C["Network:<br/>none / host / custom"]
    end

    GW_H -->|"tool call"| DOCKER
    DOCKER -->|"create/exec"| CONTAINER
    CONTAINER -->|"result"| DOCKER
    DOCKER -->|"tool result"| GW_H

    subgraph BROWSER_C["Browser Sandbox Container"]
        CHROMIUM["Chromium"]
        CDP_C["CDP :9222"]
        VNC_C["VNC :5900"]
        NOVNC_C["noVNC :6080"]
    end

    GW_H -->|"browser tool"| BROWSER_C

    classDef host fill:#1F4E79,stroke:#93C5FD,color:#F8FAFC,stroke-width:1.5px
    classDef container fill:#1F6A5A,stroke:#86EFAC,color:#F8FAFC,stroke-width:1.5px
    classDef browser fill:#5B3E8C,stroke:#C4B5FD,color:#F8FAFC,stroke-width:1.5px

    class GW_H,DOCKER host
    class EXEC_C,FS_C,NET_C container
    class CHROMIUM,CDP_C,VNC_C,NOVNC_C browser
```

> **Browser egress risk:** The browser sandbox container requires full network access (`network: host`) for web browsing. A compromised browser agent could exfiltrate data to arbitrary hosts. Consider DNS filtering, proxy rules, or host firewall rules to limit this risk.

### Sandbox Modes

| Mode | Behavior |
|------|----------|
| `off` | All tools execute on host (default) |
| `non-main` | Sandbox for non-main sessions only |
| `all` | All tool execution in containers |

### Sandbox Scopes

| Scope | Container Lifecycle |
|-------|-------------------|
| `session` | One container per session (destroyed on session end) |
| `agent` | One container shared across all sessions for an agent |
| `shared` | One container shared across all agents |

### Sandbox Config Options

| Option | Values | Default |
|--------|--------|---------|
| `workspaceAccess` | `none`, `ro`, `rw` | `none` |
| `docker.network` | `none`, `host`, custom | `none` |
| `docker.readOnlyRoot` | `true`, `false` | `false` |
| `docker.image` | image name | `openclaw-sandbox:bookworm-slim` |

---

## Session Lifecycle

```mermaid
%%{init: { "theme": "base", "themeVariables": { "fontFamily": "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial", "primaryColor": "#1F4E79", "primaryBorderColor": "#93C5FD", "primaryTextColor": "#F8FAFC", "lineColor": "#94A3B8", "secondaryColor": "#334155", "tertiaryColor": "#334155", "clusterBkg": "transparent", "clusterBorder": "#64748B", "background": "transparent" } }}%%
stateDiagram-v2
    [*] --> Created: First message arrives
    Created --> Active: Agent turn begins

    Active --> Active: Subsequent messages
    Active --> MemoryFlush: Near token limit
    MemoryFlush --> Active: Memories saved

    Active --> Reset_Daily: Auto-reset (4am default)
    Active --> Reset_Idle: Idle timeout
    Active --> Reset_Manual: /new or /reset command

    Reset_Daily --> [*]
    Reset_Idle --> [*]
    Reset_Manual --> [*]

    note right of Active
        Session key format:
        agent:{agentId}:{scope}:{identifiers}

        Transcript: JSONL append-only
        Metadata: sessions.json
    end note
```

### Session Key Formats

| DM Scope | Key Pattern | Example |
|----------|-------------|---------|
| `main` | `agent:<id>:main` | `agent:main:main` |
| `per-peer` | `agent:<id>:dm:<peerId>` | `agent:main:dm:+46700000000` |
| `per-channel-peer` | `agent:<id>:<ch>:dm:<peerId>` | `agent:main:whatsapp:dm:+46700000000` |
| `per-account-channel-peer` | `agent:<id>:<ch>:<acct>:dm:<peerId>` | `agent:main:whatsapp:personal:dm:+46700000000` |

### Queue Processing

```mermaid
%%{init: { "theme": "base", "themeVariables": { "fontFamily": "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial", "primaryColor": "#1F4E79", "primaryBorderColor": "#93C5FD", "primaryTextColor": "#F8FAFC", "lineColor": "#94A3B8", "secondaryColor": "#334155", "tertiaryColor": "#334155", "clusterBkg": "transparent", "clusterBorder": "#64748B", "background": "transparent" } }}%%
graph LR
    IN["Inbound<br/>Messages"] --> DEB["Debounce<br/>(2000ms)"]
    DEB --> COAL["Coalesce<br/>rapid texts"]
    COAL --> LANE["Lane<br/>Assignment"]
    LANE --> FIFO["Per-Session<br/>FIFO"]
    FIFO --> CAP["Concurrency<br/>Cap Check"]
    CAP --> DISPATCH["Dispatch to<br/>Agent Runtime"]

    subgraph "Queue Modes"
        STEER["steer — inject into<br/>current run"]
        FOLLOW["followup — wait for<br/>turn to end"]
        COLLECT["collect — coalesce<br/>all queued"]
    end

    classDef pipeline fill:#1F4E79,stroke:#93C5FD,color:#F8FAFC,stroke-width:1.5px
    classDef modes fill:#5B3E8C,stroke:#C4B5FD,color:#F8FAFC,stroke-width:1.5px

    class IN,DEB,COAL,LANE,FIFO,CAP,DISPATCH pipeline
    class STEER,FOLLOW,COLLECT modes
```

---

## Tool System

### Tool Policy Layers

Tool calls pass through multiple policy layers before execution (simplified — see [Reference: Tool Policy Precedence](reference.md#tool-policy-precedence) for the full 8-layer cascade):

```mermaid
%%{init: { "theme": "base", "themeVariables": { "fontFamily": "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial", "primaryColor": "#1F4E79", "primaryBorderColor": "#93C5FD", "primaryTextColor": "#F8FAFC", "lineColor": "#94A3B8", "secondaryColor": "#334155", "tertiaryColor": "#334155", "clusterBkg": "transparent", "clusterBorder": "#64748B", "background": "transparent" } }}%%
graph TD
    CALL["Tool Call<br/>from LLM"] --> L1
    L1["Layer 1: Global<br/>tools.allow / tools.deny"] -->|pass| L2
    L2["Layer 2: Per-Agent<br/>agent.tools.allow / deny"] -->|pass| L3
    L3["Layer 3: Per-Provider<br/>provider restrictions"] -->|pass| L4
    L4["Layer 4: Sandbox<br/>sandbox tool policy"] -->|pass| L5
    L5["Layer 5: Elevated<br/>tools.elevated.allowFrom"] -->|pass| EXEC

    L1 -->|deny| DENIED["Denied"]
    L2 -->|deny| DENIED
    L3 -->|deny| DENIED
    L4 -->|deny| DENIED

    EXEC{"Sandbox<br/>mode?"} -->|off| HOST["Host Exec"]
    EXEC -->|non-main / all| DOCKER_E["Docker Exec"]

    classDef layer fill:#1F4E79,stroke:#93C5FD,color:#F8FAFC,stroke-width:1.5px
    classDef decision fill:#1E637D,stroke:#7DD3FC,color:#F8FAFC,stroke-width:1.5px
    classDef deny fill:#7F1D1D,stroke:#FCA5A5,color:#FEF2F2,stroke-width:1.5px
    classDef exec fill:#1F6A5A,stroke:#86EFAC,color:#F8FAFC,stroke-width:1.5px

    class CALL,L1,L2,L3,L4,L5 layer
    class EXEC decision
    class DENIED deny
    class HOST,DOCKER_E exec
```

### Built-in Tool Groups

| Group | Tools |
|-------|-------|
| `group:runtime` | `exec`, `bash`, `process` |
| `group:fs` | `read`, `write`, `edit`, `apply_patch` |
| `group:sessions` | `sessions_list`, `sessions_history`, `sessions_send`, `sessions_spawn`, `session_status` |
| `group:memory` | `memory_search`, `memory_get` |
| `group:web` | `web_search`, `web_fetch` |
| `group:ui` | `browser`, `canvas` |
| `group:automation` | `cron`, `gateway` |
| `group:messaging` | `message` |
| `group:nodes` | `nodes` |
| `group:openclaw` | All built-in tools |

### Tool Profiles

| Profile | Includes |
|---------|----------|
| `minimal` | `session_status` |
| `coding` | `group:runtime`, `group:fs`, `group:sessions`, `group:memory` |
| `messaging` | `group:messaging`, `sessions_list`, `sessions_history`, `sessions_send`, `session_status` |
| `full` | `group:openclaw` (all built-in tools) |

---

## Plugin System

```mermaid
%%{init: { "theme": "base", "themeVariables": { "fontFamily": "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial", "primaryColor": "#1F4E79", "primaryBorderColor": "#93C5FD", "primaryTextColor": "#F8FAFC", "lineColor": "#94A3B8", "secondaryColor": "#334155", "tertiaryColor": "#334155", "clusterBkg": "transparent", "clusterBorder": "#64748B", "background": "transparent" } }}%%
graph TB
    subgraph Discovery["Plugin Discovery (load order)"]
        D1["1. Configured load paths<br/>plugins.load.paths[]"]
        D2["2. Workspace<br/>.openclaw/extensions/"]
        D3["3. User<br/>~/.openclaw/extensions/"]
        D4["4. Bundled<br/>(shipped with OpenClaw)"]
        D5["5. Installed packages<br/>(openclaw plugins install)"]
    end

    subgraph Plugin["Plugin Module (TypeScript)"]
        REG["Register"]
    end

    subgraph Capabilities["Plugin Capabilities"]
        RPC_H["RPC Methods"]
        HTTP_H["HTTP Handlers"]
        TOOL_H["Custom Tools"]
        CLI_H["CLI Commands"]
        BG_H["Background Services"]
        SKILL_H["Skills"]
        HOOK_H["Hooks"]
    end

    Discovery --> Plugin
    Plugin --> Capabilities

    JITI["jiti<br/>(TypeScript runtime loader)"] --> Plugin

    classDef discovery fill:#1F4E79,stroke:#93C5FD,color:#F8FAFC,stroke-width:1.5px
    classDef plugin fill:#1F6A5A,stroke:#86EFAC,color:#F8FAFC,stroke-width:1.5px
    classDef capability fill:#5B3E8C,stroke:#C4B5FD,color:#F8FAFC,stroke-width:1.5px
    classDef runtime fill:#1E637D,stroke:#7DD3FC,color:#F8FAFC,stroke-width:1.5px

    class D1,D2,D3,D4,D5 discovery
    class REG plugin
    class RPC_H,HTTP_H,TOOL_H,CLI_H,BG_H,SKILL_H,HOOK_H capability
    class JITI runtime
```

**Bundled plugins (disabled by default):** Google Antigravity OAuth, Gemini CLI OAuth, Qwen OAuth.

---

## Automation & Hooks

```mermaid
%%{init: { "theme": "base", "themeVariables": { "fontFamily": "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial", "primaryColor": "#1F4E79", "primaryBorderColor": "#93C5FD", "primaryTextColor": "#F8FAFC", "lineColor": "#94A3B8", "secondaryColor": "#334155", "tertiaryColor": "#334155", "clusterBkg": "transparent", "clusterBorder": "#64748B", "background": "transparent" } }}%%
graph LR
    subgraph Triggers
        CMD["Commands<br/>(/new, /reset, ...)"]
        SESS_EVT["Session Events<br/>(start, end, compaction)"]
        AGENT_EVT["Agent Events<br/>(turn start/end)"]
        GW_EVT["Gateway Events<br/>(startup, shutdown)"]
        SCHED["Cron Schedule"]
        WH_IN["Inbound Webhook"]
    end

    subgraph Hooks["Hook System"]
        DISC["Hook Discovery<br/>workspace hooks/<br/>~/.openclaw/hooks/<br/>bundled"]
        HANDLER["Hook Handler<br/>(async TypeScript)"]
    end

    subgraph Actions
        MEM_SAVE["Save Memories"]
        LOG["Command Logger"]
        BOOT["Bootstrap Injection"]
        CUSTOM["Custom Logic"]
        AGENT_TURN["Trigger Agent Turn"]
    end

    Triggers --> DISC
    DISC --> HANDLER
    HANDLER --> Actions

    classDef trigger fill:#1F4E79,stroke:#93C5FD,color:#F8FAFC,stroke-width:1.5px
    classDef hook fill:#1F6A5A,stroke:#86EFAC,color:#F8FAFC,stroke-width:1.5px
    classDef action fill:#5B3E8C,stroke:#C4B5FD,color:#F8FAFC,stroke-width:1.5px

    class CMD,SESS_EVT,AGENT_EVT,GW_EVT,SCHED,WH_IN trigger
    class DISC,HANDLER hook
    class MEM_SAVE,LOG,BOOT,CUSTOM,AGENT_TURN action
```

**Bundled hooks:**
- `session-memory` — save session transcript to memory on `/new`
- `command-logger` — log all user commands
- `boot-md` — run `BOOT.md` on gateway startup
- `soul-evil` — (debug) inject adversarial system prompt

---

## Filesystem Layout

```
~/.openclaw/
├── openclaw.json              # Main config (JSON5)
├── workspace/                 # Single-agent workspace (Phase 1-3)
│   ├── AGENTS.md              # Operating procedures
│   ├── SOUL.md                # Identity, personality, values, boundaries
│   ├── TOOLS.md               # Environment-specific notes
│   ├── IDENTITY.md            # Agent name, creature, vibe, emoji
│   ├── USER.md                # About the human
│   ├── HEARTBEAT.md           # Proactive task checklist
│   ├── BOOTSTRAP.md           # First-run onboarding (self-deletes)
│   ├── BOOT.md                # Startup automation hooks
│   ├── memory/                # Persistent memories (markdown)
│   ├── skills/                # Custom skills
│   └── hooks/                 # Workspace-scoped hooks
├── workspaces/                # Multi-agent workspaces (Phase 4+)
│   ├── main/                  # Main agent workspace (same structure as above)
│   ├── whatsapp/              # Channel agent workspace
│   ├── signal/                # Channel agent workspace
│   ├── search/                # Search agent workspace (minimal)
│   └── browser/               # Browser agent workspace (minimal)
├── agents/
│   └── <agentId>/
│       ├── sessions/
│       │   ├── sessions.json  # Session store metadata
│       │   └── <sessionId>.jsonl  # Transcript
│       └── agent/
│           └── auth-profiles.json  # Per-agent auth
├── credentials/
│   └── whatsapp/
│       └── <accountId>/
│           └── creds.json     # WhatsApp credentials
├── extensions/                # User-installed plugins
├── hooks/                     # Global hooks
├── skills/                    # Global skills
└── identity/                  # Device identity keypair
```

---

## References

- [Official Docs](https://docs.openclaw.ai)
- [Configuration Reference](https://docs.openclaw.ai/gateway/configuration-reference)
- [Security](https://docs.openclaw.ai/gateway/security)
- [Sandboxing](https://docs.openclaw.ai/gateway/sandboxing)
- [Multi-Agent](https://docs.openclaw.ai/concepts/multi-agent)
- [Protocol](https://docs.openclaw.ai/gateway/protocol)
- [Tools](https://docs.openclaw.ai/tools)
- [Plugins](https://docs.openclaw.ai/tools/plugin)
- [Sessions](https://docs.openclaw.ai/concepts/session)
- [Queue](https://docs.openclaw.ai/concepts/queue)
- [Channels](https://docs.openclaw.ai/channels)
