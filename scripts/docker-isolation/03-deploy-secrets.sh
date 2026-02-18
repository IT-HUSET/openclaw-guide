#!/bin/bash
set -euo pipefail

# === Deploy Secrets: Inject into Plist(s) + Start Service(s) + Verify ===
# Run with sudo: sudo bash 03-deploy-secrets.sh
#
# What this script does:
#   1. Prompts for shared secrets (with generation/validation)
#   2. Generates unique OPENCLAW_GATEWAY_TOKEN per instance
#   3. Injects into LaunchDaemon plist(s) via PlistBuddy (stdin mode)
#   4. Locks down plist permissions
#   5. Tightens file permissions
#   6. Initializes workspace git repos (.gitignore, user config, initial commit)
#   7. Starts service(s)
#   8. Verifies health for each instance
#
# Re-runnable: stops existing services, updates secrets, restarts.
# Useful for key rotation.
#
# Reads scripts/docker-isolation/.instances (from 01-setup-host.sh).
# Falls back to OPENCLAW_USER/PLIST_PATH env vars if .instances is absent.
#
# Environment variable overrides (fallback when .instances is absent):
#   OPENCLAW_USER  — dedicated user name (default: openclaw)
#   PLIST_PATH     — plist location (default: /Library/LaunchDaemons/ai.openclaw.gateway.plist)

# Color output (disabled when not writing to a terminal)
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BOLD='\033[1m'
    NC='\033[0m'
else
    RED='' GREEN='' YELLOW='' BOLD='' NC=''
fi

# Restrictive umask: all files created by this script default to 600/700
umask 077

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTANCES_FILE="$SCRIPT_DIR/.instances"

# ── Load instances ─────────────────────────────────────────────

load_instances() {
    INST_NAMES=()
    INST_USERS=()
    INST_PORTS=()
    INST_CDPS=()
    INST_CHANNELS=()
    INST_AGENTS=()

    if [[ -f "$INSTANCES_FILE" ]]; then
        while IFS=: read -r name user port cdp channels agents; do
            [[ "$name" =~ ^#.*$ || -z "$name" ]] && continue
            INST_NAMES+=("$name")
            INST_USERS+=("$user")
            INST_PORTS+=("$port")
            INST_CDPS+=("$cdp")
            INST_CHANNELS+=("$channels")
            INST_AGENTS+=("$agents")
        done < "$INSTANCES_FILE"
    else
        # Fallback: single instance from env vars
        local user="${OPENCLAW_USER:-openclaw}"
        local port="${GATEWAY_PORT:-18789}"
        INST_NAMES+=("default")
        INST_USERS+=("$user")
        INST_PORTS+=("$port")
        INST_CDPS+=("18800")
        INST_CHANNELS+=("whatsapp,signal")
        INST_AGENTS+=("main,whatsapp,signal,search")
    fi
}

load_instances
MULTI_INSTANCE=$(( ${#INST_NAMES[@]} > 1 ? 1 : 0 ))

# Build plist paths array
PLIST_PATHS=()
PLIST_LABELS=()
for idx in "${!INST_NAMES[@]}"; do
    local_home="/Users/${INST_USERS[$idx]}"
    if [[ "$MULTI_INSTANCE" -eq 1 ]]; then
        PLIST_LABELS+=("ai.openclaw.gateway.${INST_NAMES[$idx]}")
        PLIST_PATHS+=("/Library/LaunchDaemons/ai.openclaw.gateway.${INST_NAMES[$idx]}.plist")
    else
        PLIST_LABELS+=("ai.openclaw.gateway")
        PLIST_PATHS+=("${PLIST_PATH:-/Library/LaunchDaemons/ai.openclaw.gateway.plist}")
    fi
done

# Shared permissions function — also used by 02-setup-gateway.sh
set_openclaw_permissions() {
    local target_dir="$1"
    local user="$2"
    local group="${3:-staff}"

    chown -R "$user:$group" "$target_dir"
    find "$target_dir/agents" -name "auth-profiles.json" -exec chmod 600 {} + 2>/dev/null || true
    find "$target_dir/agents" -name "models.json" -exec chmod 600 {} + 2>/dev/null || true
    find "$target_dir/identity" -type f -exec chmod 600 {} + 2>/dev/null || true
    find "$target_dir/devices" -type f -exec chmod 600 {} + 2>/dev/null || true
    find "$target_dir/credentials" -type f -exec chmod 600 {} + 2>/dev/null || true
    find "$target_dir/credentials" -type d -exec chmod 700 {} + 2>/dev/null || true
    chmod 600 "$target_dir/openclaw.json"
}

echo ""
echo -e "${BOLD}=== Deploy Secrets: Docker Isolation ===${NC}"
if [[ "$MULTI_INSTANCE" -eq 1 ]]; then
    echo -e "  ${#INST_NAMES[@]} instances: ${INST_NAMES[*]}"
fi
echo ""

# ── Step 1: Preflight checks ────────────────────────────────────

echo -e "${BOLD}--- Step 1: Preflight checks ---${NC}"

if [[ $EUID -ne 0 ]]; then
    echo -e "${RED}Must run with sudo${NC}"
    echo "Usage: sudo bash $0"
    exit 1
fi

for idx in "${!INST_NAMES[@]}"; do
    if ! id "${INST_USERS[$idx]}" &>/dev/null; then
        echo -e "${RED}User '${INST_USERS[$idx]}' does not exist${NC}"
        exit 1
    fi
    if [[ ! -f "${PLIST_PATHS[$idx]}" ]]; then
        echo -e "${RED}Plist not found at ${PLIST_PATHS[$idx]}${NC}"
        echo "Run 02-setup-gateway.sh first"
        exit 1
    fi
done

if [[ ! -f /usr/libexec/PlistBuddy ]]; then
    echo -e "${RED}PlistBuddy not found${NC}"
    exit 1
fi

echo -e "${GREEN}Preflight passed${NC}"
echo ""

# ── Step 2: Prompt for shared secrets ────────────────────────────

echo -e "${BOLD}--- Step 2: Collect secrets ---${NC}"
echo ""

# Anthropic API key (shared across instances)
echo -e "${BOLD}ANTHROPIC_API_KEY${NC}"
read -rsp "  Enter Anthropic API key: " ANTHROPIC_KEY
echo
if [[ ! "$ANTHROPIC_KEY" =~ ^sk-ant- ]]; then
    echo -e "${YELLOW}  Warning: key doesn't start with 'sk-ant-' — verify it's correct${NC}"
fi
[[ -n "$ANTHROPIC_KEY" ]] || { echo -e "${RED}Anthropic API key is required${NC}"; exit 1; }
echo ""

# Brave API key (optional, shared)
echo -e "${BOLD}BRAVE_API_KEY${NC} (optional — press Enter to skip)"
read -rsp "  Enter Brave search API key: " BRAVE_KEY
echo
BRAVE_KEY="${BRAVE_KEY:-}"
if [[ -n "$BRAVE_KEY" ]]; then
    echo "  Set"
else
    echo -e "${YELLOW}  Skipped — configure search provider in openclaw.json if using Perplexity instead${NC}"
fi
echo ""

# OpenRouter API key (optional, shared)
echo -e "${BOLD}OPENROUTER_API_KEY${NC} (optional — for Perplexity search or image-gen plugin)"
read -rsp "  Enter OpenRouter API key: " OPENROUTER_KEY
echo
OPENROUTER_KEY="${OPENROUTER_KEY:-}"
if [[ -n "$OPENROUTER_KEY" ]]; then
    echo "  Set"
else
    echo -e "${YELLOW}  Skipped${NC}"
fi
echo ""

# GitHub token (optional, shared)
echo -e "${BOLD}GITHUB_TOKEN${NC} (optional — for workspace git sync)"
echo "  Use a fine-grained PAT scoped to your workspace repos."
echo "  Create at: github.com/settings/personal-access-tokens/new"
echo "  Permissions needed: Contents (read+write), Metadata (read)"
read -rsp "  Enter GitHub token: " GITHUB_TOKEN
echo
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
if [[ -n "$GITHUB_TOKEN" ]]; then
    echo "  Set"
else
    echo -e "${YELLOW}  Skipped — workspace git sync won't push to remote${NC}"
fi
echo ""

# Generate unique gateway token per instance
echo -e "${BOLD}OPENCLAW_GATEWAY_TOKEN${NC} (unique per instance)"
declare -a GATEWAY_TOKENS
for idx in "${!INST_NAMES[@]}"; do
    GATEWAY_TOKENS[$idx]=$(openssl rand -hex 32)
    echo "  ${INST_NAMES[$idx]}: generated"
done
echo ""

# ── Step 3: Inject secrets via PlistBuddy ────────────────────────

echo -e "${BOLD}--- Step 3: Injecting secrets into plist(s) ---${NC}"

PB=/usr/libexec/PlistBuddy

inject_optional_secret() {
    local plist="$1" key="$2" value="$3"
    [[ -n "$value" ]] || return 0
    echo "Set :EnvironmentVariables:$key $value" | $PB "$plist" 2>/dev/null || \
    echo "Add :EnvironmentVariables:$key string $value" | $PB "$plist"
}

for idx in "${!INST_NAMES[@]}"; do
    local_plist="${PLIST_PATHS[$idx]}"
    local_name="${INST_NAMES[$idx]}"

    echo "  $local_name: injecting..."

    # Required secrets
    $PB "$local_plist" <<EOF
Set :EnvironmentVariables:OPENCLAW_GATEWAY_TOKEN ${GATEWAY_TOKENS[$idx]}
Set :EnvironmentVariables:ANTHROPIC_API_KEY $ANTHROPIC_KEY
Save
EOF

    # Optional secrets
    inject_optional_secret "$local_plist" "BRAVE_API_KEY" "$BRAVE_KEY"
    inject_optional_secret "$local_plist" "OPENROUTER_API_KEY" "$OPENROUTER_KEY"
    inject_optional_secret "$local_plist" "GITHUB_TOKEN" "$GITHUB_TOKEN"

    echo "Save" | $PB "$local_plist"
done

# Clear secret variables from memory
# GITHUB_TOKEN kept for git init in step 6, GATEWAY_TOKENS kept for health check in step 8
unset ANTHROPIC_KEY BRAVE_KEY OPENROUTER_KEY

echo -e "${GREEN}Done — secrets injected${NC}"
echo ""

# ── Step 4: Lock down plists ──────────────────────────────────────

echo -e "${BOLD}--- Step 4: Locking down plist(s) ---${NC}"
for idx in "${!INST_NAMES[@]}"; do
    chmod 600 "${PLIST_PATHS[$idx]}"
done
echo -e "${GREEN}Done — all plists chmod 600${NC}"
echo ""

# ── Step 5: Final file permissions ────────────────────────────────

echo -e "${BOLD}--- Step 5: Tightening file permissions ---${NC}"
for idx in "${!INST_NAMES[@]}"; do
    local_user="${INST_USERS[$idx]}"
    local_target="/Users/$local_user/.openclaw"
    if [[ -d "$local_target" ]]; then
        set_openclaw_permissions "$local_target" "$local_user" "$(id -gn "$local_user")"
    fi
done
echo -e "${GREEN}Done${NC}"
echo ""

# ── Step 6: Initialize workspace git repos ────────────────────────

echo -e "${BOLD}--- Step 6: Workspace git init ---${NC}"

for idx in "${!INST_NAMES[@]}"; do
    local_user="${INST_USERS[$idx]}"
    local_home="/Users/$local_user"
    local_ws="$local_home/.openclaw/workspaces/main"

    if [[ ! -d "$local_ws" ]]; then
        echo -e "  ${YELLOW}${INST_NAMES[$idx]}: no main workspace found, skipping${NC}"
        continue
    fi

    if [[ -d "$local_ws/.git" ]]; then
        echo "  ${INST_NAMES[$idx]}: already initialized, skipping"
        continue
    fi

    echo "  ${INST_NAMES[$idx]}: initializing..."

    sudo -u "$local_user" git -C "$local_ws" init
    sudo -u "$local_user" git -C "$local_ws" config user.name "OpenClaw (${INST_NAMES[$idx]})"
    sudo -u "$local_user" git -C "$local_ws" config user.email "openclaw@localhost"

    sudo -u "$local_user" tee "$local_ws/.gitignore" > /dev/null << 'GIEOF'
.DS_Store
.env
**/*.key
**/*.pem
**/secrets*
GIEOF

    sudo -u "$local_user" git -C "$local_ws" add .
    sudo -u "$local_user" git -C "$local_ws" commit -m "Initial workspace" --quiet

    # Set up remote if GITHUB_TOKEN was provided
    if [[ -n "${GITHUB_TOKEN:-}" ]]; then
        echo "  ${INST_NAMES[$idx]}: GITHUB_TOKEN available — set up a remote manually:"
        echo "    sudo -u $local_user git -C $local_ws remote add origin https://github.com/YOUR_ORG/openclaw-workspace-${INST_NAMES[$idx]}.git"
        echo "    sudo -u $local_user git -C $local_ws push -u origin main"
    fi
done

unset GITHUB_TOKEN

echo -e "${GREEN}Done${NC}"
echo ""

# ── Step 7: Start service(s) ──────────────────────────────────────
# (GATEWAY_TOKENS still needed for health check in step 8)

echo -e "${BOLD}--- Step 7: Starting service(s) ---${NC}"

for idx in "${!INST_NAMES[@]}"; do
    local_label="${PLIST_LABELS[$idx]}"

    # Stop existing if running
    launchctl bootout "system/${local_label}" 2>/dev/null || true
done

sleep 2

for idx in "${!INST_NAMES[@]}"; do
    local_label="${PLIST_LABELS[$idx]}"
    local_plist="${PLIST_PATHS[$idx]}"
    local_name="${INST_NAMES[$idx]}"

    launchctl bootstrap system "$local_plist"
    echo "  $local_name: started"
done

echo "Waiting for gateway(s) to start (up to 30s)..."
sleep 5
echo ""

# ── Step 8: Verify ────────────────────────────────────────────────

echo -e "${BOLD}--- Step 8: Verification ---${NC}"
echo ""

for idx in "${!INST_NAMES[@]}"; do
    local_name="${INST_NAMES[$idx]}"
    local_user="${INST_USERS[$idx]}"
    local_port="${INST_PORTS[$idx]}"
    local_label="${PLIST_LABELS[$idx]}"
    local_token="${GATEWAY_TOKENS[$idx]}"
    local_home="/Users/$local_user"

    echo -e "${BOLD}  $local_name (port $local_port):${NC}"

    # Service status
    if launchctl print "system/${local_label}" 2>&1 | grep -q "state = running"; then
        echo -e "    Service: ${GREEN}running${NC}"
    else
        echo -e "    Service: ${YELLOW}not running yet (may need more time)${NC}"
        echo "    Check: sudo launchctl print system/${local_label}"
    fi

    # Port check
    if lsof -i ":$local_port" -sTCP:LISTEN &>/dev/null; then
        echo -e "    Port:    ${GREEN}$local_port listening${NC}"
    else
        echo -e "    Port:    ${YELLOW}$local_port not listening yet${NC}"
    fi

    # Health endpoint
    HEALTH=$(curl -sf -H "Authorization: Bearer $local_token" "http://127.0.0.1:$local_port/health" 2>/dev/null || echo "")
    if [[ -n "$HEALTH" ]]; then
        echo -e "    Health:  ${GREEN}OK${NC}"
    else
        echo -e "    Health:  ${YELLOW}no response yet${NC}"
    fi

    # Doctor
    sudo -u "$local_user" HOME="$local_home" openclaw doctor 2>&1 || {
        echo -e "    ${YELLOW}openclaw doctor reported issues${NC}"
    }
    echo ""
done

# Clear remaining secrets
unset GATEWAY_TOKENS

# ── Summary ──────────────────────────────────────────────────────

echo -e "${BOLD}=== Secrets deployed, service(s) running ===${NC}"
echo ""

# Channel pairing instructions per instance
for idx in "${!INST_NAMES[@]}"; do
    local_name="${INST_NAMES[$idx]}"
    local_user="${INST_USERS[$idx]}"
    local_channels="${INST_CHANNELS[$idx]}"
    local_home="/Users/$local_user"
    local_label="${PLIST_LABELS[$idx]}"
    local_plist="${PLIST_PATHS[$idx]}"

    if [[ "$MULTI_INSTANCE" -eq 1 ]]; then
        echo -e "${BOLD}Instance: $local_name${NC}"
    fi

    echo -e "${BOLD}Channel pairing:${NC}"
    echo ""
    if [[ "$local_channels" == *"whatsapp"* ]]; then
        echo "  WhatsApp:"
        echo "    Gateway shows a QR code in the logs on first start."
        echo "    Scan with WhatsApp > Settings > Linked Devices > Link a Device"
        echo "    Check: sudo tail -f $local_home/.openclaw/logs/gateway.log"
        echo ""
    fi
    if [[ "$local_channels" == *"signal"* ]] && command -v signal-cli &>/dev/null; then
        echo "  Signal:"
        echo "    sudo -u $local_user signal-cli link -n 'OpenClaw'"
        echo "    Generate QR from the output URI and scan with Signal app"
        echo "    Then: openclaw pairing list signal / openclaw pairing approve signal <CODE>"
        echo ""
    fi

    echo -e "${BOLD}Customize your agent:${NC}"
    echo "  sudo -u $local_user vi $local_home/.openclaw/workspaces/main/SOUL.md"
    echo ""

    echo -e "${BOLD}Service management:${NC}"
    echo "  # Note: 'openclaw gateway restart' does NOT work (system domain)."
    echo "  # Use launchctl bootout/bootstrap instead:"
    echo "  # Status"
    echo "  sudo launchctl print system/${local_label} 2>&1 | head -10"
    echo "  # Restart"
    echo "  sudo launchctl bootout system/${local_label}"
    echo "  sudo launchctl bootstrap system $local_plist"
    echo "  # Logs"
    echo "  sudo tail -f $local_home/.openclaw/logs/gateway.log"
    echo ""

    echo -e "${BOLD}Gateway token:${NC}"
    echo "  sudo /usr/libexec/PlistBuddy -c 'Print :EnvironmentVariables:OPENCLAW_GATEWAY_TOKEN' $local_plist"
    echo ""
done
