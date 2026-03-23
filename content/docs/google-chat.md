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

Google Chat sends webhook POSTs to your gateway. Each request includes an `Authorization: Bearer <token>` header — an OIDC ID token issued by `accounts.google.com` (for apps created via the new GCP Console) or a service account JWT signed by `chat@system.gserviceaccount.com` (legacy). OpenClaw verifies the token against your configured audience before processing.

Key differences from WhatsApp/Signal:
- **Webhook-based** — requires a publicly reachable HTTPS endpoint (WhatsApp/Signal connect outbound)
- **Service account auth** — no QR code or CLI linking; uses a GCP service account JSON key
- **Audience verification** — two modes: `app-url` (webhook URL) or `project-number` (GCP project number)
- **Space-based sessions** — session keys use `agent:<agentId>:googlechat:direct:<spaceId>` or `agent:<agentId>:googlechat:group:<spaceId>`
- **Threaded replies** — in spaces (group chats), replies are always posted in the thread of the original message. No config option to post top-level instead (OpenClaw limitation — the Google Chat API does support it via `messageReplyOption`).
- **Mention-only in spaces** — Google Chat only forwards @mention messages (and slash commands) to HTTP endpoint apps in group spaces. Non-mention messages never reach the webhook — this is a [Google Chat platform constraint](https://developers.google.com/workspace/chat/api/reference/rest/v1/EventType), not an OpenClaw limitation. `requireMention: false` in OpenClaw config has no practical effect for spaces since Google never delivers non-mention messages. All-message monitoring would require the separate [Workspace Events API + Pub/Sub](https://developers.google.com/workspace/events/guides/events-chat) architecture. DMs always arrive regardless.
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
   - GCP will display a read-only **Service Account Email** below the radio button (e.g., `service-205049784124@gcp-sa-gsuiteaddons.iam.gserviceaccount.com`). This is Google's internal signing account and is purely informational — it does not need to be configured in OpenClaw.
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
      // Required for @mention detection in spaces — see "Finding the bot user ID" below
      "botUser": "users/<bot-numeric-id>",
      "dm": {
        "policy": "pairing",
        // Use stable user IDs (users/<id>) once known — email matching is fragile.
        // Start with email, then replace after first DM (ID appears in pairing request + session logs).
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
>
> **Start with DMs, add spaces later.** You can omit `botUser` initially — DMs work without it. Once you have the bot's user ID (see below), add `botUser` and test spaces.

### Multi-agent setup (Phase 4+)

Add a dedicated Google Chat agent alongside the existing WhatsApp/Signal agents:

```json5
{
  "agents": {
    "list": [
      // ... existing agents (main, whatsapp, signal, search, googlechat) ...
      {
        // GOOGLE CHAT AGENT — same pattern as WhatsApp/Signal agents
        // No exec/process/web — delegates to search/main.
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

The Google Chat agent follows the same pattern as WhatsApp/Signal agents: no web tools, no exec, delegates to search/main via `sessions_send`. Docker sandbox (from `agents.defaults`) applies automatically.

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
| `dangerouslyAllowNameMatching` | `false` | Allow email/name matching in `dm.allowFrom` — use only until you have the user's stable sender ID from logs |

---

## Step 5: Verify

1. Start/restart the gateway:
   ```bash
   openclaw start                    # Foreground (development)
   # or restart the LaunchAgent/systemd service (production)
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
   openclaw doctor                 # Config issues
   openclaw status --deep          # Full health check including channel probe + security audit
   ```

6. **Harden `dm.allowFrom`**: After the first DM, replace email with the stable user ID:
   ```bash
   # Find sender ID in session store
   cat ~/.openclaw/agents/main/sessions/sessions.json | python3 -m json.tool | grep -A2 '"from"'
   # Output: "from": "googlechat:users/111261968043283685958"
   # Use the users/<id> part in allowFrom, then remove dangerouslyAllowNameMatching if set
   ```

### Finding the bot user ID

`botUser` is required for @mention detection in spaces ([#25639](https://github.com/openclaw/openclaw/issues/25639)). The bot's numeric user ID is **not** visible in the GCP Console or gateway logs. To find it, send a message as the bot via the Google Chat API and read `sender.name` from the response:

```bash
# One-time setup (use a Python venv to avoid system package conflicts)
python3 -m venv /tmp/gapi && /tmp/gapi/bin/pip install -q google-auth google-api-python-client

# Get bot user ID (replace the space ID with any space the bot is in)
/tmp/gapi/bin/python3 -c "
from google.oauth2 import service_account
from googleapiclient.discovery import build
creds = service_account.Credentials.from_service_account_file(
    '$HOME/.openclaw/credentials/googlechat/service-account.json',
    scopes=['https://www.googleapis.com/auth/chat.bot'])
service = build('chat', 'v1', credentials=creds)
# Send a message to any DM space, read sender.name, then delete it
spaces = service.spaces().list(pageSize=1).execute()
space = spaces['spaces'][0]['name']
msg = service.spaces().messages().create(parent=space, body={'text': '(bot identity probe)'}).execute()
print(f'botUser: {msg[\"sender\"][\"name\"]}')
service.spaces().messages().delete(name=msg['name']).execute()
"
# Output: botUser: users/104817664214523572409
# Add this to channels.googlechat.botUser in your config
```

---

## Known Issues

| Issue | Impact | Status |
|-------|--------|--------|
| **OIDC token 401 regression** ([#35095](https://github.com/openclaw/openclaw/issues/35095)) — **affects 2026.3.2–2026.3.7** | The new GCP Console creates Chat apps that issue Google ID tokens (`iss: accounts.google.com`, signed by `/oauth2/v3/certs`) instead of service account JWTs (`iss: chat@system.gserviceaccount.com`). OpenClaw 2026.3.2–2026.3.7 verifies against the wrong key set, returning 401 for every webhook. Fixed in [#35204](https://github.com/openclaw/openclaw/pull/35204) — **upgrade to 2026.3.8+**. With the fix, `audienceType: "app-url"` with the webhook URL is correct. | Fixed in 2026.3.8 |
| **@mention detection fails without `botUser`** ([#25639](https://github.com/openclaw/openclaw/issues/25639)) | In spaces with `requireMention: true`, @mentions are silently dropped because OpenClaw checks for `users/app` alias but Google Chat sends the bot's numeric user ID. **Workaround:** set `botUser: "users/<numeric-id>"` in `channels.googlechat` config. Get the bot's user ID via the Google Chat API (`spaces.messages.create` response includes `sender.name`). | Open |
| **`requireMention: false` broken** ([#29855](https://github.com/openclaw/openclaw/issues/29855)) | `requireMention: false` has no effect in spaces — messages are still ignored unless @mentioned. Fix merged in PR #29917 but may not be released yet. Note: even when fixed, this only affects OpenClaw's filter — [Google Chat only forwards @mention messages](https://developers.google.com/workspace/chat/api/reference/rest/v1/EventType) to HTTP endpoint apps in spaces, so non-mention messages never arrive regardless. | Open (fix merged) |
| **No all-message reception in spaces** ([#44347](https://github.com/openclaw/openclaw/issues/44347)) | HTTP endpoint apps only receive @mention/DM messages from Google Chat — this is a [platform constraint](https://developers.google.com/workspace/chat/api/reference/rest/v1/EventType). Receiving all space messages would require the [Workspace Events API + Pub/Sub](https://developers.google.com/workspace/events/guides/events-chat) architecture (not supported by OpenClaw). | Open |
| **OAuth limitations** ([#9764](https://github.com/openclaw/openclaw/issues/9764)) | Service account auth can't do reactions, media uploads, or proactive DMs. These require user OAuth (not yet supported). | Open |
| **Per-space rate limit** | 1 write/sec (60/min standard). The 600/min figure in some docs applies only to data import operations. | By design |

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
# In LaunchAgent plist or systemd env file:
GOOGLE_CHAT_SERVICE_ACCOUNT_FILE=/Users/openclaw/.openclaw/credentials/googlechat/service-account.json
```

### Public endpoint hardening

- **Only expose `/googlechat`** — never expose the full gateway
- **Tailscale Funnel** keeps the rest of your gateway private
- **Caddy/Cloudflare** can add rate limiting at the reverse proxy layer
- Google Chat's own bearer token authentication prevents unauthorized POSTs
- If using a custom reverse proxy (not Tailscale Funnel), strip `Tailscale-User-Login` and `Tailscale-User-Name` headers — see [Reverse Proxy Configuration](phases/phase-6-deployment.md#reverse-proxy-configuration)

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
   # or restart LaunchAgent/systemd  # Production
   ```

### No messages arriving

- Verify the Chat app's webhook URL matches your public URL exactly
- Check `openclaw channels status --probe` for auth errors or missing audience
- Confirm the Chat app status is **Live** (not Draft) in GCP Console
- Run `openclaw logs --follow | grep -E '(googlechat|error|webhook)'` while sending a test message to filter for Google Chat activity

### Mention gating blocks replies in spaces

@mention messages arrive at the gateway but are silently dropped as "mention required" ([#25639](https://github.com/openclaw/openclaw/issues/25639)). This happens because OpenClaw checks for the `users/app` alias, but Google Chat sends the bot's numeric user ID in message annotations.

**Fix:** Set `botUser` to the bot's numeric user resource name (see [Finding the bot user ID](#finding-the-bot-user-id)):
```json5
{
  "channels": {
    "googlechat": {
      "botUser": "users/104817664214523572409"
    }
  }
}
```

**Diagnosis:** Check `openclaw logs --follow` for `"drop group message (mention required)"` entries — if you see these when @mentioning the bot, `botUser` is missing or wrong.

### 401 Unauthorized on every message (new GCP Console setup)

If every message returns 401 despite `audience` matching the webhook URL exactly, you are likely hitting the OIDC token regression ([#35095](https://github.com/openclaw/openclaw/issues/35095)) that affects 2026.3.2 when the app was created via the new GCP Console.

To confirm: temporarily capture an incoming webhook request and decode the JWT's `iss` claim. If `iss` is `"https://accounts.google.com"` (not `"chat@system.gserviceaccount.com"`), your app issues OIDC ID tokens. **Upgrade to OpenClaw 2026.3.8+** (fix shipped in [#35204](https://github.com/openclaw/openclaw/pull/35204)).

### Auth errors

- **"audience mismatch"** — your `audience` config doesn't match the webhook URL in GCP Console
- **"token verification failed"** — wrong service account file or the Chat API isn't enabled
- Run `openclaw status --deep` for detailed channel health diagnostics

---

## Next Steps

→ **[Phase 3: Security](phases/phase-3-security.md)** — apply security baseline to your Google Chat deployment

Or:
- [Phase 4: Channels & Multi-Agent](phases/phase-4-multi-agent.md) — add a dedicated Google Chat agent
- [Phase 5: Web Search Isolation](phases/phase-5-web-search.md) — safe internet access for your agent
- [Phase 6: Deployment](phases/phase-6-deployment.md) — production service with webhook exposure
- [Reference](reference.md) — config cheat sheet, gotchas
