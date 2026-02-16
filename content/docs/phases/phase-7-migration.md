---
title: "Phase 7 — Migration"
description: "Moving an OpenClaw deployment to a new machine — config, credentials, memory, channels, services."
weight: 70
---

Move an existing OpenClaw deployment to a new host without losing config, memory, channel sessions, or scheduled tasks. This guide covers both same-OS and cross-platform migrations.

> **Prerequisites:** You should have a working deployment on the source machine (any phase) and a target machine with the base OS ready. The target doesn't need OpenClaw installed yet — this guide covers that.

---

## Migration Overview

An OpenClaw deployment consists of these components:

| Component | Location | Transferable? | Notes |
|-----------|----------|---------------|-------|
| **Config** | `~/.openclaw/openclaw.json` | Yes | Update paths for new host |
| **Workspaces** | `~/.openclaw/workspaces/<agent>/` | Yes | SOUL.md, memory files, research |
| **WhatsApp credentials** | `~/.openclaw/credentials/whatsapp/` | Yes | Baileys store (hundreds of files) |
| **Signal credentials** | `~/.openclaw/credentials/signal/` | No | Must re-pair on new host |
| **Auth profiles** | `~/.openclaw/agents/<id>/agent/auth-profiles.json` | Yes | Copy to each agent |
| **Identity files** | `~/.openclaw/identity/` | Yes | Agent identity/keys |
| **Session history** | `~/.openclaw/agents/<id>/sessions/*.jsonl` | Optional | Large; start fresh if possible |
| **Google Chat credentials** | `~/.openclaw/credentials/googlechat/` | Yes | Service account JSON — update path + webhook URL |
| **Search workspace** | `~/.openclaw/workspaces/search/` | Yes | Same as main agent workspaces |
| **Search agentDir** | `~/.openclaw/agents/search/` | Yes | Sessions, auth profiles |
| **Extensions** | `~/.openclaw/extensions/` | Yes | Plugin source + node_modules |
| **Memory search index** | Internal (architecture-dependent) | No | Rebuild on target: `openclaw memory index` |
| **Secrets** | Plist env vars / `secrets.env` | Manual | Re-enter on target (never copy plists with secrets over network) |
| **Service files** | LaunchDaemon/systemd | Recreate | Paths and users differ per host |
| **Cron jobs / scheduled tasks** | `/etc/newsyslog.d/`, `/etc/logrotate.d/`, crontab | Recreate | Log rotation, session pruning, temp cleanup |

---

## Step 1 — Prepare the Source

### Stop the gateway

```bash
# macOS (LaunchDaemon)
sudo launchctl bootout system/ai.openclaw.gateway

# macOS (LaunchAgent)
sudo launchctl bootout gui/$(id -u openclaw)/ai.openclaw.gateway

# Linux (systemd)
sudo systemctl stop openclaw-gateway
```

### Create a backup

```bash
# Full .openclaw directory backup
sudo tar czf openclaw-backup-$(date +%Y%m%d).tar.gz -C /Users/openclaw .openclaw

# Or for Linux
sudo tar czf openclaw-backup-$(date +%Y%m%d).tar.gz -C /home/openclaw .openclaw
```

> **Session files can be large.** If you don't need conversation history, exclude them: `--exclude='.openclaw/agents/*/sessions'`. Memory files (in workspaces) are separate and much smaller.

### Export secrets inventory

List which secrets your deployment uses — don't copy values over insecure channels:

```bash
# macOS: list env vars from plist (keys only, not values)
sudo /usr/libexec/PlistBuddy -c "Print :EnvironmentVariables" \
  /Library/LaunchDaemons/ai.openclaw.gateway.plist | grep "=" | awk '{print $1}'

# Linux: list env var keys from secrets file
sudo grep -oP '^\w+' /etc/openclaw/secrets.env
```

Common secrets to track:
- `ANTHROPIC_API_KEY`
- `OPENCLAW_GATEWAY_TOKEN` (generate new on target — `openssl rand -hex 32`)
- `BRAVE_API_KEY`
- `OPENROUTER_API_KEY` (for image-gen plugin)
- `GITHUB_TOKEN` (consider generating a new PAT scoped to the new host)
- `GOOGLE_CHAT_SERVICE_ACCOUNT_FILE` (path to service account JSON — host-specific, not a secret itself)
- `JAVA_HOME` (not a secret, but host-specific — verify Java path on target)

### Note cron jobs and scheduled tasks

```bash
# macOS: log rotation config
cat /etc/newsyslog.d/openclaw.conf 2>/dev/null

# macOS: check for any openclaw-related cron entries
sudo crontab -l 2>/dev/null | grep -i openclaw
sudo -u openclaw crontab -l 2>/dev/null

# Linux: log rotation
cat /etc/logrotate.d/openclaw 2>/dev/null

# Linux: cron/timers
sudo crontab -l 2>/dev/null | grep -i openclaw
sudo -u openclaw crontab -l 2>/dev/null
systemctl list-timers | grep openclaw
```

Also check for:
- **Session pruning** — `find ... -mtime +30 -delete` commands for old session files
- **Temp file cleanup** — image-gen plugin saves to `$TMPDIR/openclaw-image-gen/`; may have a cleanup cron
- **Workspace git sync** — automated `git push` schedules for workspace backups
- **Certificate renewal** — if using custom TLS termination

---

## Step 2 — Set Up the Target

### Install dependencies

**macOS (Apple Silicon):**
```bash
# Homebrew + Node.js
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install node

# Docker (OrbStack recommended)
brew install --cask orbstack

# Signal support (if needed)
brew install signal-cli  # requires Java 21
```

**Linux:**
```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs
curl -fsSL https://get.docker.com | sudo sh
```

### Create the dedicated user

Follow the [Dedicated OS User](phase-6-deployment.md#dedicated-os-user) instructions from Phase 6.

> **sysadminctl doesn't create home directories** (macOS). After `sysadminctl -addUser`, you must `sudo mkdir -p /Users/openclaw && sudo chown openclaw:staff /Users/openclaw`.

### Install OpenClaw

```bash
# Global install (admin user)
curl -fsSL https://openclaw.ai/install.sh | bash

# Verify the dedicated user can access it
sudo -u openclaw openclaw --version
```

---

## Step 3 — Transfer Data

### Copy the backup to target

```bash
# Via scp (over Tailscale or local network)
scp openclaw-backup-*.tar.gz user@target-host:/tmp/

# Or via rsync for large backups with resume support
rsync -avz --progress openclaw-backup-*.tar.gz user@target-host:/tmp/
```

> **Secure the backup on target** — it contains credentials. Restrict access immediately after transfer:
> ```bash
> chmod 600 /tmp/openclaw-backup-*.tar.gz
> ```

### Extract to the new user's home

```bash
# macOS — extract as the openclaw user
sudo mkdir -p /Users/openclaw/.openclaw
sudo tar xzf /tmp/openclaw-backup-*.tar.gz -C /Users/openclaw/
sudo chown -R openclaw:staff /Users/openclaw/.openclaw

# Linux
sudo mkdir -p /home/openclaw/.openclaw
sudo tar xzf /tmp/openclaw-backup-*.tar.gz -C /home/openclaw/
sudo chown -R openclaw:openclaw /home/openclaw/.openclaw
```

### Update paths in config

If migrating between different home directories or OS:

```bash
# macOS → macOS (different username)
sudo -u openclaw sed -i '' 's|/Users/old-user|/Users/openclaw|g' \
  /Users/openclaw/.openclaw/openclaw.json

# macOS → Linux
sudo -u openclaw sed -i 's|/Users/old-user|/home/openclaw|g' \
  /home/openclaw/.openclaw/openclaw.json

# Linux → macOS
sudo -u openclaw sed -i '' 's|/home/old-user|/Users/openclaw|g' \
  /Users/openclaw/.openclaw/openclaw.json
```

> **`sed -i` differs by OS.** On macOS, use `sed -i ''` (empty quotes required). On Linux, use `sed -i` (no quotes). The examples above show the correct syntax for each platform.

> **Review the config manually after `sed`.** Automated path replacement can miss embedded paths or catch false positives. Open `openclaw.json` and verify: workspace paths, `agentDir` paths, extension paths, `$include` paths, and any absolute paths in tool configurations all point to valid locations on the target.

---

## Step 4 — Component-Specific Migration

### Config (`openclaw.json`)

- Update all absolute paths to match the target host
- Verify `gateway.mode` is set (gateway refuses to start without it)
- Remove any stale/unrecognized keys — run `openclaw doctor` to check
- If the target has a different OpenClaw version, run `openclaw doctor --fix` for config migrations

### Workspaces (memory, SOUL.md)

Workspaces (`~/.openclaw/workspaces/<agent>/`) contain the most important persistent data:
- **SOUL.md** — agent personality and instructions. Review and customize for the new deployment context (e.g., update host-specific references).
- **Memory files** — semantic memory, conversation summaries, learned facts. Transfer as-is.
- **Research files** — agent-generated research documents. Transfer as-is.

```bash
# Verify workspace files transferred
sudo -u openclaw ls -la /Users/openclaw/.openclaw/workspaces/main/
```

### WhatsApp credentials

WhatsApp uses Baileys for session management. The credential store (often hundreds of files) **does transfer** between hosts:

```bash
# Verify credential files exist
sudo -u openclaw ls /Users/openclaw/.openclaw/credentials/whatsapp/default/ | wc -l
```

> **`registered: False` in `creds.json` is misleading.** This field doesn't reliably indicate connection status. After starting the gateway, check logs for `Listening for personal WhatsApp inbound messages` — that confirms the session is active.

> **Channel config matters too.** Verify `channels.whatsapp.allowFrom` has real phone numbers, not placeholders (`+46XXXXXXXXX`). Placeholder values cause **silent message drops** with no log warning.

### Signal credentials

Signal credentials **do not transfer** between devices. You must re-pair on the new host:

```bash
sudo -u openclaw bash -c 'cd /Users/openclaw && HOME=/Users/openclaw signal-cli link -n "OpenClaw"'
```

Scan the QR code from **Signal > Settings > Linked Devices > Link New Device**. See [Signal Setup](phase-6-deployment.md#signal-setup) for the full process.

> **JAVA_HOME:** After installing signal-cli via Homebrew, verify `JAVA_HOME` points to Java 21. Stale paths from previous Homebrew upgrades are a common cause of signal-cli failures. Set explicitly in your plist: `JAVA_HOME=/opt/homebrew/Cellar/openjdk@21/<version>/libexec/openjdk.jdk/Contents/Home`

### Google Chat credentials

Google Chat uses a GCP service account for authentication. The service account JSON file **does transfer** between hosts, but paths and webhook URLs need updating.

1. **Copy the service account JSON** — included in the backup if stored under `~/.openclaw/credentials/googlechat/`
2. **Update the path** in `GOOGLE_CHAT_SERVICE_ACCOUNT_FILE` env var to match the target host
3. **Update the webhook URL** — if the target has a different hostname or Tailscale node name, the audience in the Google Chat app configuration must change
4. **Re-enable Tailscale Funnel** on the target (if used for webhook exposure):
   ```bash
   tailscale funnel --bg --set-path /googlechat http://127.0.0.1:18789/googlechat
   ```
   > Use path-scoped Funnel (`--set-path`) to avoid exposing the entire gateway API to the internet.
5. **Update the Chat app URL** in the [GCP Console](https://console.cloud.google.com/apis/api/chat.googleapis.com/hangouts-chat) to point to the new host's public URL

See the [Google Chat setup guide](../google-chat.md) for the full configuration process.

### Auth profiles

Auth profiles (`agents/<id>/agent/auth-profiles.json`) must exist for each agent that uses authenticated tools:

```bash
# Verify auth profiles are present for all agents
sudo -u openclaw find /Users/openclaw/.openclaw/agents -name "auth-profiles.json" -ls
```

If migrating from a single-agent to multi-agent setup (or vice versa), ensure each agent directory has a copy.

### Extensions (plugins)

Plugin directories should be named to match their manifest ID (e.g., `web-guard/`, not `openclaw-web-guard/`):

```bash
# Verify plugin directories
sudo -u openclaw ls /Users/openclaw/.openclaw/extensions/

# Expected: channel-guard/ image-gen/ web-guard/ (matching manifest IDs)
```

If `node_modules` weren't included in the backup (they're large), reinstall per plugin:

```bash
for plugin in channel-guard web-guard image-gen; do
  sudo -u openclaw bash -c "cd /Users/openclaw/.openclaw/extensions/$plugin && npm install"
done
```

> **Guard plugins download a ~370 MB DeBERTa ONNX model** on first run. First gateway start after migration may be slow if node_modules weren't transferred.

> **Plugin changes require gateway restart.** Unlike config changes which hot-reload, plugin source is loaded at startup only.

### Memory search index

The memory search index uses architecture-dependent native binaries and may not be portable across hosts. Rebuild it after migration:

```bash
sudo -u openclaw bash -c 'cd /Users/openclaw && HOME=/Users/openclaw openclaw memory index'
```

Memory data files (in workspaces) transfer fine — only the search index needs rebuilding. This command may run for several minutes with no visible progress output — this is normal. Do not interrupt it.

### Session history (optional)

Session files (`agents/<id>/sessions/*.jsonl`) contain full conversation history including tool output. They can be large.

**Recommended:** Start fresh on the new host. Memory files (in workspaces) preserve the agent's knowledge; sessions are just conversation logs.

**If transferring sessions:** Watch for poisoned sessions. A poisoned session is one where prompt injection has been stored in the conversation history — the injected content replays on every subsequent turn, potentially steering the agent's behavior indefinitely. Sessions with malformed data (e.g., broken plugin output) are similarly problematic: every message to that conversation will fail with the same error. Delete affected session files:

```bash
# Find sessions with known broken patterns
sudo -u openclaw grep -rl "media_type" /Users/openclaw/.openclaw/agents/*/sessions/*.jsonl
# Delete any matches
```

---

## Step 5 — Set Up Services

### LaunchDaemon / systemd

Create new service files on the target — **don't copy plists or unit files** from the source, as they contain secrets and host-specific paths.

Follow the [LaunchDaemon](phase-6-deployment.md#macos-launchdaemon) (macOS) or [systemd](phase-6-deployment.md#linux-systemd) instructions from Phase 6.

### Enter secrets

**macOS:** Add secrets to the new plist via `PlistBuddy`:
```bash
PLIST=/Library/LaunchDaemons/ai.openclaw.gateway.plist
sudo /usr/libexec/PlistBuddy -c "Set :EnvironmentVariables:ANTHROPIC_API_KEY sk-ant-..." "$PLIST"
sudo /usr/libexec/PlistBuddy -c "Set :EnvironmentVariables:OPENCLAW_GATEWAY_TOKEN $(openssl rand -hex 32)" "$PLIST"
# ... repeat for each secret
sudo chmod 600 "$PLIST"
```

**Linux:** Create the secrets environment file:
```bash
sudo mkdir -p /etc/openclaw
sudo tee /etc/openclaw/secrets.env > /dev/null << 'EOF'
ANTHROPIC_API_KEY=sk-ant-...
OPENCLAW_GATEWAY_TOKEN=<generate with openssl rand -hex 32>
BRAVE_API_KEY=...
GITHUB_TOKEN=github_pat_...
EOF
sudo chown root:root /etc/openclaw/secrets.env
sudo chmod 600 /etc/openclaw/secrets.env
```

> **Empty env vars cause startup failure.** For optional keys not yet provisioned, use a non-empty placeholder like `"not-configured"` — not an empty string.

### OrbStack / Docker (macOS)

If using Docker sandboxing with OrbStack, ensure the engine is running and accessible:

```bash
orbctl start
# Verify docker works for the openclaw user
sudo -u openclaw /usr/local/bin/docker ps
```

OrbStack's docker CLI is at `/usr/local/bin/docker` — this path may not be in the service user's PATH. Use the full path or add it to the plist's `PATH` environment variable.

### Playwright (browser tool)

Install Chromium for the dedicated user:

```bash
sudo -u openclaw bash -c 'cd /Users/openclaw && HOME=/Users/openclaw npx -y playwright install chromium'
```

> **Correct HOME and PATH required.** The npm cache must be writable by the target user, and `cd` to the user's home is needed to avoid `process.cwd()` failures.

---

## Step 6 — Recreate Scheduled Tasks

### Log rotation

**macOS** — create `/etc/newsyslog.d/openclaw.conf`:
```
/Users/openclaw/.openclaw/logs/gateway.log     openclaw:staff  640  7  1024  *  J
/Users/openclaw/.openclaw/logs/gateway.err.log openclaw:staff  640  7  1024  *  J
```

> `640` restricts log access to owner and group only. Gateway logs may contain sensitive data.

**Linux** — create `/etc/logrotate.d/openclaw`:
```
/home/openclaw/.openclaw/logs/*.log {
    weekly
    rotate 4
    compress
    missingok
    notifempty
}
```

### Session pruning

Recreate any session cleanup cron from the source:

```bash
# Example: delete sessions older than 30 days (daily at 3am)
sudo -u openclaw crontab -e
# Add: 0 3 * * * find /Users/openclaw/.openclaw/agents/*/sessions -name "*.jsonl" -mtime +30 -delete
```

### Temp file cleanup

If using the image-gen plugin, add cleanup for generated temp images:

```bash
# Example: clean image-gen temp files older than 7 days (daily at 4am)
# Add to openclaw user's crontab:
0 4 * * * find /tmp/openclaw-image-gen -type f -mtime +7 -delete 2>/dev/null
```

> **macOS clears `/tmp` on reboot**, so this is mainly needed for long-running Linux servers.

### Workspace git sync

If you had automated workspace backup pushes, recreate on the target:

```bash
# Example: push workspace changes daily at midnight
# In openclaw user's crontab:
0 0 * * * cd /Users/openclaw/.openclaw/workspaces/main && git add -A && git commit -m "auto-backup $(date +\%Y-\%m-\%d)" && git push 2>/dev/null
```

> Ensure `GITHUB_TOKEN` is available to the cron environment — either via the user's `.bashrc` or set in the crontab with `GITHUB_TOKEN=github_pat_...` at the top.

---

## Step 7 — File Permissions and Security

Lock down the target deployment:

**macOS:**
```bash
sudo chown -R openclaw:staff /Users/openclaw/.openclaw
sudo chmod 700 /Users/openclaw
sudo chmod 700 /Users/openclaw/.openclaw
sudo chmod 600 /Users/openclaw/.openclaw/openclaw.json
sudo chmod 600 /Users/openclaw/.openclaw/credentials/*.json
sudo chmod 600 /Users/openclaw/.openclaw/agents/*/agent/auth-profiles.json
sudo chmod 600 /Users/openclaw/.openclaw/identity/*.json
sudo chmod -R 600 /Users/openclaw/.openclaw/credentials/whatsapp/default/*
sudo chmod 700 /Users/openclaw/.openclaw/credentials/whatsapp
```

**Linux:**
```bash
sudo chown -R openclaw:openclaw /home/openclaw/.openclaw
sudo chmod 700 /home/openclaw
sudo chmod 700 /home/openclaw/.openclaw
sudo chmod 600 /home/openclaw/.openclaw/openclaw.json
sudo chmod 600 /home/openclaw/.openclaw/credentials/*.json
sudo chmod 600 /home/openclaw/.openclaw/agents/*/agent/auth-profiles.json
sudo chmod 600 /home/openclaw/.openclaw/identity/*.json
sudo chmod -R 600 /home/openclaw/.openclaw/credentials/whatsapp/default/*
sudo chmod 700 /home/openclaw/.openclaw/credentials/whatsapp
```

### Admin access (optional)

If you need to manage the service user's files from your admin account:

```bash
# Traverse-only on home dir
sudo chmod +a "youradmin allow list,search,execute" /Users/openclaw

# Full read+write with inheritance on .openclaw
sudo chmod -R +a "youradmin allow read,write,append,readattr,writeattr,readextattr,writeextattr,readsecurity,list,search,execute,delete,add_file,add_subdirectory,delete_child,file_inherit,directory_inherit" /Users/openclaw/.openclaw
```

### Firewall

Re-enable firewall on the target:

```bash
# macOS
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate on
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setstealthmode on

# Linux
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw enable
```

### Tailscale (if applicable)

If using Tailscale for secure remote access or Funnel for webhook exposure:

```bash
# Authenticate on target
tailscale up

# Re-tag the device in Tailscale admin console or via CLI
# Verify ACLs allow traffic from expected sources
tailscale status
```

Re-tag the new device as `tag:openclaw` in the Tailscale admin console. If using Tailscale Funnel for Google Chat webhooks, re-enable it on the target (see [Google Chat setup](../google-chat.md)).

---

## Step 8 — Verify

### Start the gateway

```bash
# Create log directory first
sudo -u openclaw mkdir -p /Users/openclaw/.openclaw/logs

# macOS
sudo launchctl bootstrap system /Library/LaunchDaemons/ai.openclaw.gateway.plist

# Linux
sudo systemctl enable --now openclaw-gateway
```

### Verification checklist

```bash
# Gateway is running
sudo launchctl print system/ai.openclaw.gateway 2>&1 | head -10  # macOS
sudo systemctl status openclaw-gateway                            # Linux

# Listening on correct port
sudo lsof -i :18789

# Health check
curl -s -H "Authorization: Bearer <token>" http://127.0.0.1:18789/health

# Config validation
sudo -u openclaw bash -c 'cd /Users/openclaw && HOME=/Users/openclaw openclaw doctor'

# Recent logs (look for errors)
tail -50 /Users/openclaw/.openclaw/logs/gateway.log
```

- [ ] Gateway starts and stays running (check logs for crash loops)
- [ ] Health endpoint responds
- [ ] WhatsApp messages get responses (check for `Listening for personal WhatsApp inbound messages` in logs)
- [ ] Signal messages get responses (if re-paired)
- [ ] Google Chat messages get responses (if configured — check webhook delivery in GCP console)
- [ ] Memory search works (`openclaw memory search <query>` — run `openclaw memory index` first if no results)
- [ ] `openclaw security audit` returns no critical findings
- [ ] Docker sandboxing active (if applicable — `docker ps` shows sandbox containers)
- [ ] File permissions are correct (600/700 on sensitive files)
- [ ] Gateway only listens on loopback
- [ ] Log rotation config in place
- [ ] Cron jobs / scheduled tasks recreated
- [ ] Tailscale device tagged as `tag:openclaw` and ACLs applied (if applicable)

### Clean up

> **Before stopping the source service**, verify on the target:
> - Gateway starts and responds to health checks
> - All agents load without errors
> - Channel connections establish (check logs)
> - Memory search returns expected results
>
> Consider keeping the source running for 24 hours after target verification.

After verifying everything works:

```bash
# Remove backup from /tmp on target
rm /tmp/openclaw-backup-*.tar.gz

# On source: keep the backup, stop and disable the old service
sudo launchctl bootout system/ai.openclaw.gateway  # macOS
sudo systemctl disable --now openclaw-gateway       # Linux
```

> **Keep the source backup** for at least a few weeks. Channel sessions (especially WhatsApp) can silently fail days later if the credential migration has subtle issues.

---

## Multi-Instance Migration

For [multi-gateway deployments](../multi-gateway.md), repeat the process per instance. This applies to all approaches — profiles, multi-user, and VM variants. Each instance has:

- Its own OS user (e.g., `openclaw-bob`, `openclaw-tibra`)
- Its own `.openclaw/` directory, config, and secrets
- Its own LaunchDaemon with a unique label and port
- Its own cron jobs for log rotation, session pruning, etc.

Migrate instances independently — they share no state. The only shared components are host-level installs (Node.js, OrbStack, signal-cli).

---

## VM Deployment Migration

If running OpenClaw inside a VM rather than directly on the host, you can migrate the entire VM image instead of individual files.

### macOS VMs

**Lume:**
```bash
# On source host — export the VM
lume export openclaw-vm -o openclaw-vm.tar.gz

# Transfer to target host
scp openclaw-vm.tar.gz user@target-host:/tmp/

# On target host — import
lume import /tmp/openclaw-vm.tar.gz --name openclaw-vm
lume start openclaw-vm
```

**Parallels:**
```bash
# On source host — clone/export (stop VM first)
prlctl stop openclaw-vm
prlctl clone openclaw-vm --name openclaw-vm-export

# Transfer the .pvm bundle to target host
rsync -avz ~/Parallels/openclaw-vm-export.pvm/ user@target-host:~/Parallels/openclaw-vm.pvm/

# On target host — register and start
prlctl register ~/Parallels/openclaw-vm.pvm
prlctl start openclaw-vm
```

### Linux VMs

**Multipass:**
```bash
# Transfer files into/out of VM
multipass transfer openclaw-vm:/home/openclaw/.openclaw/openclaw.json ./backup/

# Or snapshot + restore approach
multipass stop openclaw-vm
# Copy the VM image from /var/snap/multipass/common/data/multipassd/vault/instances/
```

**KVM / libvirt:**
```bash
# On source host — export disk image
virsh shutdown openclaw-vm
virsh vol-download --pool default openclaw-vm.qcow2 /tmp/openclaw-vm.qcow2

# Transfer to target host
rsync -avz --progress /tmp/openclaw-vm.qcow2 user@target-host:/tmp/

# On target host — import
virsh vol-create-as --pool default --name openclaw-vm.qcow2 --format qcow2 --capacity 0
virsh vol-upload --pool default openclaw-vm.qcow2 /tmp/openclaw-vm.qcow2
# Re-define the domain XML (update paths as needed)
```

### Post-VM-transfer steps

After importing a VM image on the target host:

1. **Update networking** — VM may get a new IP; update any Tailscale/firewall rules on the host
2. **Re-authorize Tailscale** inside the VM (if used) — `tailscale up`, re-tag as `tag:openclaw`
3. **Inside-VM migration** follows the same file-level steps above (path updates, secrets, permissions) if the VM's internal layout changed
4. **Docker volumes** (Linux VMs with Docker inside) — included in the VM image; verify with `docker volume ls`

---

## Troubleshooting

### Gateway exits immediately after start

Run `openclaw doctor` to diagnose. Common causes:
- Missing `gateway.mode` in config
- Empty env var (use `"not-configured"` as placeholder for optional keys)
- Unrecognized config keys from a newer/older OpenClaw version — run `openclaw doctor --fix`
- Plugin directories missing or misnamed (must match manifest ID)

### WhatsApp messages silently dropped

Check `channels.whatsapp.allowFrom` — placeholder values (`+46XXXXXXXXX`) cause silent drops with no log warning. Replace with real phone numbers.

### Signal won't connect

Signal credentials don't transfer. Re-pair on the new host: `sudo -u openclaw signal-cli link -n "OpenClaw"`. Also verify `JAVA_HOME` points to Java 21.

### "process.cwd() failed" errors

Running commands as the service user from a directory that user can't access. Always use:
```bash
sudo -u openclaw bash -c 'cd /Users/openclaw && HOME=/Users/openclaw <command>'
```

### Plugin errors persist after fix

Broken tool results in session history replay on every message. Delete the affected session file:
```bash
# Identify poisoned sessions
sudo -u openclaw grep -rl "<error pattern>" /Users/openclaw/.openclaw/agents/*/sessions/
# Delete and restart gateway
```

### Memory search returns no results

The search index is architecture-dependent and may not be portable between hosts. Rebuild it:
```bash
sudo -u openclaw bash -c 'cd /Users/openclaw && HOME=/Users/openclaw openclaw memory index'
```

This can take a few minutes for large memory stores. The gateway doesn't need to be stopped.

---

## Next Steps

Your migrated deployment should now be fully operational. If anything seems off, the troubleshooting section above covers the most common post-migration issues.

> **[Reference](../reference.md)** — config cheat sheet, tool list, gotchas
