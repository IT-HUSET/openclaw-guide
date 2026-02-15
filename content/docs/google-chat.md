---
title: "Google Chat Channel Setup"
description: "Connect OpenClaw to Google Chat via GCP service account, webhook exposure, and multi-org configuration."
weight: 90
---

Connect OpenClaw to Google Chat via HTTP webhooks. Unlike WhatsApp (QR pairing) or Signal (CLI linking), Google Chat uses a GCP service account and webhook endpoint — your gateway needs a public HTTPS URL.

---

## Prerequisites

- **Phase 1 completed** (working agent)
- A **Google Workspace** domain (Chat apps require Workspace — free Gmail accounts can't use them)
- **Google Workspace admin access** (to enable Chat apps at the org level)
- A **public HTTPS URL** for the webhook endpoint (Tailscale Funnel recommended — see [Phase 6](phases/phase-6-deployment.md))
- A **GCP project** with the Google Chat API enabled

> **Personal Google accounts** (gmail.com) can't use Google Chat apps. This channel requires Google Workspace (Business, Enterprise, Education, etc.).

---

## How It Works

```
Google Chat → HTTPS POST /googlechat → OpenClaw Gateway → AI Provider → Response → Google Chat
```

Google Chat sends webhook POSTs to your gateway. Each request includes an `Authorization: Bearer <token>` header signed by `chat@system.gserviceaccount.com`. OpenClaw verifies the token against your configured audience before processing.

Key differences from WhatsApp/Signal:
- **Webhook-based** — requires a publicly reachable HTTPS endpoint (WhatsApp/Signal connect outbound)
- **Service account auth** — no QR code or CLI linking; uses a GCP service account JSON key
- **Audience verification** — two modes: `app-url` (webhook URL) or `project-number` (GCP project number)
- **Space-based sessions** — session keys use `agent:<agentId>:googlechat:dm:<spaceId>` or `agent:<agentId>:googlechat:group:<spaceId>`
- **Plugin required** — `plugins.entries.googlechat.enabled: true` must be set (WhatsApp/Signal also need their plugin enabled)

---

## Step 1: GCP Project Setup

### Create service account

1. Go to [Google Chat API Credentials](https://console.cloud.google.com/apis/api/chat.googleapis.com/credentials)
2. Enable the **Google Chat API** if not already enabled
3. **Create Credentials > Service Account**
   - Name: e.g., `openclaw-chat`
   - Leave permissions and principals blank
4. In the service account list, click the one you created
5. **Keys** tab > **Add Key > Create new key > JSON**
6. Store the downloaded file on your gateway host:

```bash
# Docker isolation (production — macOS; on Linux, replace /Users/openclaw/ with /home/openclaw/)
sudo -u openclaw mkdir -p /Users/openclaw/.openclaw/credentials/googlechat
sudo mv ~/Downloads/openclaw-chat-*.json \
  /Users/openclaw/.openclaw/credentials/googlechat/service-account.json
sudo chown openclaw:staff /Users/openclaw/.openclaw/credentials/googlechat/service-account.json
sudo chmod 600 /Users/openclaw/.openclaw/credentials/googlechat/service-account.json

# Quick start (personal user)
mkdir -p ~/.openclaw/credentials/googlechat
mv ~/Downloads/openclaw-chat-*.json ~/.openclaw/credentials/googlechat/service-account.json
chmod 600 ~/.openclaw/credentials/googlechat/service-account.json
```

### Create Chat app

1. Go to [Google Chat Configuration](https://console.cloud.google.com/apis/api/chat.googleapis.com/hangouts-chat)
2. Fill in **Application info**:
   - **App name**: e.g., `OpenClaw` (users search this exact name to find the bot)
   - **Avatar URL**: e.g., `https://openclaw.ai/logo.png`
   - **Description**: e.g., `AI Assistant`
3. Enable **Interactive features**
4. Under **Functionality**: check **Join spaces and group conversations**
5. Under **Connection settings**: select **HTTP endpoint URL**
6. Under **Triggers**: select **Use a common HTTP endpoint URL for all triggers** and set to your gateway's public webhook URL (e.g., `https://<node>.ts.net/googlechat`)
7. Under **Visibility**: check **Make this Chat app available to specific people and groups in \<Your Domain\>** and add your email (type it into the text field and press Enter)
8. Click **Save**
9. **Refresh the page**, find **App status**, set to **Live - available to users**, and **Save** again

> **The bot is a private app.** It won't appear in the Marketplace browse list. Users must search for it by exact name in Google Chat's "+" menu.

---

## Step 2: Workspace Admin Setup

A Google Workspace administrator must enable Chat apps for the organization:

1. Go to **[admin.google.com](https://admin.google.com)** > **Apps > Google Workspace > Google Chat**
2. Under **Chat apps**, ensure they're **enabled** for the top-level organizational unit (OU)
3. If using sub-OUs, make sure the users who need the bot are in an OU where Chat apps are allowed

> **No Marketplace publishing required.** Internal-only apps with "Specific people and groups" visibility work without Marketplace review.
>
> **App installation policies:** If the org has a Marketplace allowlist, the OpenClaw Chat app may need to be explicitly allowlisted by the admin — or it can operate under Google's 5-user development app exemption. Some Chat API features also require top-level OU access to be enabled. Coordinate with the Workspace admin if you encounter installation issues.

---

## Step 3: Webhook Exposure

Google Chat webhooks require a public HTTPS endpoint. **Only expose the `/googlechat` path** — keep the dashboard and API on your private network.

### Tailscale Funnel (Recommended)

```bash
# Expose only the webhook path publicly
tailscale funnel --bg --set-path /googlechat http://127.0.0.1:18789/googlechat

# If gateway is bound to Tailscale IP:
tailscale funnel --bg --set-path /googlechat http://100.x.x.x:18789/googlechat

# Verify
tailscale funnel status
```

Your public webhook URL: `https://<node-name>.<tailnet>.ts.net/googlechat`

Keep the dashboard tailnet-only:
```bash
tailscale serve --bg --https 8443 http://127.0.0.1:18789
```

> This configuration persists across reboots. To remove: `tailscale funnel reset` and `tailscale serve reset`.

### Caddy (Alternative)

Only proxy the webhook path:

```
your-domain.com {
    reverse_proxy /googlechat* localhost:18789
}
```

### Cloudflare Tunnel (Alternative)

Route only `/googlechat` → `http://localhost:18789/googlechat`. Default rule: 404.

---

## Step 4: Gateway Configuration

### Single-agent setup (Phase 1)

Add to `~/.openclaw/openclaw.json`:

```json5
{
  "channels": {
    "googlechat": {
      "enabled": true,
      "serviceAccountFile": "~/.openclaw/credentials/googlechat/service-account.json",
      "audienceType": "app-url",
      "audience": "https://<node-name>.<tailnet>.ts.net/googlechat",
      "dm": {
        "policy": "pairing",
        "allowFrom": ["user@yourdomain.com"]
      },
      "groupPolicy": "allowlist",
      "groups": { "*": { "requireMention": true } },
      "mediaMaxMb": 20
    }
  },
  "plugins": {
    "entries": {
      "googlechat": { "enabled": true }
    }
  }
}
```

> **Both `channels.googlechat` and `plugins.entries.googlechat` are required.** Missing either causes a 405 error on the webhook endpoint.

### Multi-agent setup (Phase 4+)

Add a dedicated Google Chat agent alongside the existing WhatsApp/Signal agents:

```json5
{
  "agents": {
    "list": [
      // ... existing agents (main, whatsapp, signal, search, browser, googlechat) ...
      {
        // GOOGLE CHAT AGENT — same pattern as WhatsApp/Signal agents
        // No exec/process/web — delegates to search/browser/main.
        "id": "googlechat",
        "workspace": "/Users/openclaw/.openclaw/workspaces/googlechat",
        "agentDir": "/Users/openclaw/.openclaw/agents/googlechat/agent",
        "tools": {
          "deny": ["web_search", "web_fetch", "browser", "exec", "process"],
          "elevated": { "enabled": false }
        },
        "subagents": { "allowAgents": ["main", "search", "browser"] }
      }
    ]
  },

  "bindings": [
    { "agentId": "whatsapp", "match": { "channel": "whatsapp" } },
    { "agentId": "signal", "match": { "channel": "signal" } },
    { "agentId": "googlechat", "match": { "channel": "googlechat" } }
  ]
}
```

The Google Chat agent follows the same pattern as WhatsApp/Signal agents: no web tools, no exec, delegates to search/browser/main via `sessions_send`. Docker sandbox (from `agents.defaults`) applies automatically.

### Credential resolution order

OpenClaw resolves Google Chat credentials in this order (standard OpenClaw credential resolution):
1. `serviceAccount` — inline JSON string in config
2. `serviceAccountFile` — path to JSON file
3. `GOOGLE_CHAT_SERVICE_ACCOUNT` — env var (JSON string)
4. `GOOGLE_CHAT_SERVICE_ACCOUNT_FILE` — env var (file path)

For production, use `serviceAccountFile` or the env var — keeps secrets out of `openclaw.json`.

### Config options reference

| Key | Default | Description |
|-----|---------|-------------|
| `enabled` | `false` | Enable the channel |
| `serviceAccountFile` | — | Path to service account JSON key |
| `audienceType` | `"app-url"` | Token verification mode: `"app-url"` or `"project-number"` |
| `audience` | — | Webhook URL or GCP project number (matches `audienceType`) |
| `webhookPath` | `"/googlechat"` | HTTP path the gateway registers for incoming webhooks |
| `botUser` | — | App's user resource name (e.g., `"users/1234567890"`); helps mention detection |
| `dm.policy` | `"pairing"` | DM access: `"pairing"`, `"allowlist"`, `"open"`, `"disabled"` |
| `dm.allowFrom` | `[]` | Allowed senders: `"users/<id>"` or `"user@domain.com"` |
| `groupPolicy` | `"allowlist"` | Space access: `"allowlist"`, `"open"`, `"disabled"` |
| `groups` | `{}` | Per-space config (keys: `"spaces/<id>"` or `"*"`) |
| `actions.reactions` | `false` | Enable reactions (requires user OAuth — see known issues) |
| `typingIndicator` | `"message"` | Typing indicator: `"none"`, `"message"`, `"reaction"` |
| `mediaMaxMb` | `20` | Max attachment size in MB |

---

## Step 5: Verify

1. Start/restart the gateway:
   ```bash
   openclaw start                    # Foreground (development)
   # or restart the LaunchDaemon/systemd service (production)
   ```

2. Check channel status:
   ```bash
   openclaw channels status
   # Should show: Google Chat default: enabled, configured, ...
   ```

3. Add the bot in Google Chat:
   - Open [Google Chat](https://chat.google.com/)
   - Click **+** next to **Direct Messages**
   - Search for your app name (exact match required — it's a private app)
   - Select and click **Add** or **Chat**
   - Send "Hello"

4. Approve pairing (if using `pairing` DM policy):
   ```bash
   openclaw pairing list googlechat
   openclaw pairing approve googlechat <CODE>
   ```

5. Run diagnostics:
   ```bash
   openclaw doctor                       # Config issues
   openclaw channels status --probe      # Auth + connectivity check
   ```

---

## Known Issues

| Issue | Impact | Status |
|-------|--------|--------|
| **DM routing ignores bindings** ([#9198](https://github.com/nicepkg/openclaw/issues/9198)) | Google Chat DMs always route to the default agent, ignoring `bindings` config. Space (group) routing works correctly. | Open — blocks multi-agent |
| **OAuth limitations** ([#9764](https://github.com/nicepkg/openclaw/issues/9764)) | Service account auth can't do reactions, media uploads, or proactive DMs. These require user OAuth (not yet supported). | Open |
| **Per-space rate limit** | 1 write/sec (60/min standard). The 600/min figure in some docs applies only to data import operations. | By design |

> **DM routing bug is critical for multi-agent setups.** If you run multiple channel agents (whatsapp + signal + googlechat), Google Chat DMs route to whichever agent has `default: true` — not to the `googlechat` agent specified in bindings. Space messages route correctly. Monitor #9198 for a fix.

---

## Multi-Organization Setup

Google Chat apps are scoped to a single Workspace domain. To serve multiple organizations, create a separate GCP project and Chat app per domain.

### Architecture

```
GCP Project A (org-a.com)              GCP Project B (org-b.com)
  └── Chat App "OpenClaw"                └── Chat App "OpenClaw"
        │                                       │
        └──────────────┐    ┌──────────────────┘
                       ▼    ▼
                 Same OpenClaw Gateway
                 (shared webhook endpoint)
```

Both Chat apps point to the **same** gateway webhook URL. OpenClaw routes by space ID, not by GCP project — sessions are naturally isolated per space.

### Per-org setup

For each organization:

1. **Create a GCP project** in that org's Google Cloud console
2. **Create service account + Chat app** (repeat [Step 1](#step-1-gcp-project-setup))
3. **Workspace admin enables Chat apps** (repeat [Step 2](#step-2-workspace-admin-setup))
4. **Store each org's service account key** separately:
   ```
   ~/.openclaw/credentials/googlechat/
   ├── org-a-service-account.json
   └── org-b-service-account.json
   ```

### Current limitations

OpenClaw's `channels.googlechat` config supports a **single service account**. For multi-org with different service accounts:

- **Single org active at a time:** Switch `serviceAccountFile` between orgs (not practical for simultaneous use)
- **Separate gateway instances:** Run one gateway per org, each with its own service account and port. See [Multi-Gateway Deployments](multi-gateway.md) for setup options.
- **Shared service account:** If both orgs trust the same GCP project, a single service account works — but this requires cross-org GCP access.

Monitor OpenClaw docs for native multi-tenant Google Chat support.

---

## Security Considerations

### Webhook authentication

Google Chat signs every webhook POST with a bearer token. OpenClaw verifies this automatically using `audienceType` + `audience`. Two modes:

| `audienceType` | `audience` value | When to use |
|---|---|---|
| `app-url` | Your webhook URL (e.g., `https://node.ts.net/googlechat`) | Default — matches the URL Google sends to |
| `project-number` | GCP project number (e.g., `123456789`) | If your URL changes frequently |

### Service account key security

The JSON key file grants identity to your Chat app. Protect it:

```bash
sudo chmod 600 ~/.openclaw/credentials/googlechat/service-account.json
```

For production, prefer the env var approach:
```bash
# In LaunchDaemon plist or systemd env file:
GOOGLE_CHAT_SERVICE_ACCOUNT_FILE=/Users/openclaw/.openclaw/credentials/googlechat/service-account.json
```

### Public endpoint hardening

- **Only expose `/googlechat`** — never expose the full gateway
- **Tailscale Funnel** keeps the rest of your gateway private
- **Caddy/Cloudflare** can add rate limiting at the reverse proxy layer
- Google Chat's own bearer token authentication prevents unauthorized POSTs

### Channel-guard compatibility

The [channel-guard plugin](extensions/channel-guard.md) scans inbound channel messages for prompt injection. Google Chat messages flow through the same `message_received` hook as WhatsApp/Signal — channel-guard works with Google Chat if the channel bridge is configured.

---

## Troubleshooting

### 405 Method Not Allowed

Google Cloud Logs shows `status code: 405`:

1. **Channel not configured** — verify:
   ```bash
   openclaw config get channels.googlechat
   ```
   If "Config path not found", add the channel configuration.

2. **Plugin not enabled** — verify:
   ```bash
   openclaw plugins list | grep googlechat
   ```
   If "disabled", add `plugins.entries.googlechat.enabled: true` to config.

3. **Gateway not restarted** after adding config:
   ```bash
   openclaw gateway restart          # Development
   # or restart LaunchDaemon/systemd  # Production
   ```

### No messages arriving

- Verify the Chat app's webhook URL matches your public URL exactly
- Check `openclaw channels status --probe` for auth errors or missing audience
- Confirm the Chat app status is **Live** (not Draft) in GCP Console
- Run `openclaw logs --follow | grep -E '(googlechat|error|webhook)'` while sending a test message to filter for Google Chat activity

### Mention gating blocks replies in spaces

Set `botUser` to the app's user resource name:
```json5
{
  "channels": {
    "googlechat": {
      "botUser": "users/1234567890"
    }
  }
}
```

Find the bot's user ID in gateway logs or via the Google Chat API.

### Auth errors

- **"audience mismatch"** — your `audience` config doesn't match the webhook URL in GCP Console
- **"token verification failed"** — wrong service account file or the Chat API isn't enabled
- Run `openclaw channels status --probe` for detailed auth diagnostics

---

## Next Steps

→ **[Phase 3: Security](phases/phase-3-security.md)** — apply security baseline to your Google Chat deployment

Or:
- [Phase 4: Channels & Multi-Agent](phases/phase-4-multi-agent.md) — add a dedicated Google Chat agent
- [Phase 5: Web Search Isolation](phases/phase-5-web-search.md) — safe internet access for your agent
- [Phase 6: Deployment](phases/phase-6-deployment.md) — production service with webhook exposure
- [Reference](reference.md) — config cheat sheet, gotchas
