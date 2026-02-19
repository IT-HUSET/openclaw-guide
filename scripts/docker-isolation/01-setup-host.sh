#!/bin/bash
set -euo pipefail

# === Host Setup: Prerequisites + Instance Planning + Dedicated User(s) + Docker + Firewall ===
# Run on host as admin user with sudo privileges.
#
# What this script does:
#   1. Verifies prerequisites (macOS, admin, Homebrew)
#   2. Installs Node.js (if needed)
#   3. Installs OrbStack for Docker (if needed)
#   4. Optionally installs signal-cli (for Signal channel)
#   5. Installs OpenClaw (if needed)
#   6. Builds Docker sandbox image (openclaw-sandbox:bookworm-slim)
#   7. Plans gateway instances (single vs. multi)
#   8. Creates dedicated non-admin user(s)
#   9. Installs Playwright chromium (per user)
#  10. Locks down admin home directory
#  11. Enables macOS firewall
#
# Single-instance mode (default): one `openclaw` user, one gateway, all channels.
# Multi-instance mode: separate user per gateway for channel isolation.
#
# Writes scripts/docker-isolation/.instances — consumed by scripts 02 and 03.
#
# Environment variable overrides (single-instance only):
#   OPENCLAW_USER  — dedicated user name (default: openclaw)

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

OPENCLAW_USER="${OPENCLAW_USER:-openclaw}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTANCES_FILE="$SCRIPT_DIR/.instances"

echo ""
echo -e "${BOLD}=== Host Setup: Docker Isolation for OpenClaw ===${NC}"
echo ""

# ── Step 1: Preflight checks ────────────────────────────────────

echo -e "${BOLD}--- Step 1: Preflight checks ---${NC}"

if [[ "$(uname)" != "Darwin" ]]; then
    echo -e "${RED}This script is for macOS only${NC}"
    echo "For Linux Docker isolation, follow the manual steps in deployment.md"
    exit 1
fi

if [[ $EUID -eq 0 ]]; then
    echo -e "${RED}Don't run as root — run as your admin user (script uses sudo where needed)${NC}"
    exit 1
fi

if ! groups "$(whoami)" | grep -qw admin; then
    echo -e "${RED}Current user is not in admin group — need admin privileges${NC}"
    exit 1
fi

if ! command -v brew &>/dev/null; then
    echo -e "${RED}Homebrew not found${NC}"
    echo "Install: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
    exit 1
fi

echo -e "${GREEN}Preflight passed (macOS, admin user, Homebrew)${NC}"
echo ""

# ── Step 2: Install Node.js ─────────────────────────────────────

echo -e "${BOLD}--- Step 2: Install Node.js ---${NC}"
if command -v node &>/dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}Node.js already installed: $NODE_VERSION${NC}"
else
    echo "Installing Node.js via Homebrew..."
    brew install node
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}Done: $NODE_VERSION${NC}"
fi
# OpenClaw requires Node.js 22+
NODE_MAJOR=$(node --version | sed 's/v//' | cut -d. -f1)
if [[ "$NODE_MAJOR" -lt 22 ]]; then
    echo -e "${RED}Node.js 22+ required (found v$NODE_MAJOR) — upgrade with: brew upgrade node${NC}"
    exit 1
fi
echo ""

# ── Step 3: Install OrbStack (Docker) ───────────────────────────

echo -e "${BOLD}--- Step 3: Install OrbStack ---${NC}"
if command -v docker &>/dev/null; then
    echo -e "${GREEN}Docker already available: $(docker --version 2>/dev/null || echo 'version unknown')${NC}"
elif [[ -d "/Applications/OrbStack.app" ]]; then
    echo -e "${YELLOW}OrbStack installed but Docker CLI not in PATH${NC}"
    echo "Open OrbStack.app to complete setup, then re-run this script"
    exit 1
else
    echo "Installing OrbStack..."
    brew install --cask orbstack
    echo ""
    echo -e "${YELLOW}OrbStack installed — opening to complete initial setup...${NC}"
    open -a OrbStack
    echo "Waiting for Docker to become available (up to 60s)..."
    for i in $(seq 1 12); do
        if command -v docker &>/dev/null && docker info &>/dev/null; then
            echo -e "${GREEN}Docker is ready${NC}"
            break
        fi
        sleep 5
    done
    if ! command -v docker &>/dev/null || ! docker info &>/dev/null; then
        echo -e "${YELLOW}Docker not ready yet — complete OrbStack setup manually, then re-run${NC}"
        exit 1
    fi
fi
echo ""

# ── Step 4: Install signal-cli (optional) ───────────────────────

echo -e "${BOLD}--- Step 4: Install signal-cli (optional) ---${NC}"
if command -v signal-cli &>/dev/null; then
    echo -e "${GREEN}signal-cli already installed${NC}"
else
    read -rp "Install signal-cli for Signal channel support? (y/N) " -n 1
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Installing signal-cli (requires Java)..."
        brew install signal-cli
        echo -e "${GREEN}Done${NC}"
    else
        echo -e "${YELLOW}Skipped — install later with: brew install signal-cli${NC}"
    fi
fi
echo ""

# ── Step 5: Install OpenClaw ────────────────────────────────────

echo -e "${BOLD}--- Step 5: Install OpenClaw ---${NC}"
if command -v openclaw &>/dev/null; then
    echo -e "${GREEN}OpenClaw already installed: $(openclaw --version 2>/dev/null || echo 'version unknown')${NC}"
else
    # Note: curl-to-bash has no integrity verification. For high-security
    # deployments, download first and verify per OpenClaw's install docs.
    echo "Installing OpenClaw..."
    curl -fsSL https://openclaw.ai/install.sh | bash
    echo ""
    if command -v openclaw &>/dev/null; then
        echo -e "${GREEN}Done: $(openclaw --version 2>/dev/null)${NC}"
    else
        echo -e "${RED}OpenClaw not found in PATH after install${NC}"
        echo "Check installation output above and ensure /opt/homebrew/bin is in PATH"
        exit 1
    fi
fi
echo ""

# ── Step 6: Build sandbox image ─────────────────────────────────

echo -e "${BOLD}--- Step 6: Build sandbox image ---${NC}"
OC_PKG="$(npm root -g)/openclaw"
SANDBOX_SCRIPT="$OC_PKG/scripts/sandbox-setup.sh"

if docker image inspect openclaw-sandbox:bookworm-slim &>/dev/null; then
    echo -e "${GREEN}Sandbox image already built (openclaw-sandbox:bookworm-slim)${NC}"
elif [[ -f "$SANDBOX_SCRIPT" ]]; then
    echo "Building openclaw-sandbox:bookworm-slim..."
    bash "$SANDBOX_SCRIPT"
    echo -e "${GREEN}Sandbox image built${NC}"
else
    echo -e "${YELLOW}sandbox-setup.sh not found at $OC_PKG/scripts/${NC}"
    echo "Build manually after install: cd \$(npm root -g)/openclaw && ./scripts/sandbox-setup.sh"
fi
echo ""

# ── Step 7: Instance planning ───────────────────────────────────

echo -e "${BOLD}--- Step 7: Instance planning ---${NC}"
echo ""

if [[ -f "$INSTANCES_FILE" ]]; then
    echo -e "${YELLOW}Existing .instances file found${NC}"
    read -rp "Overwrite with new instance plan? (y/N) " -n 1
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Keeping existing .instances file"
        # Read users from existing file
        INSTANCE_USERS=()
        while IFS=: read -r name user port cdp channels agents; do
            [[ "$name" =~ ^#.*$ || -z "$name" ]] && continue
            INSTANCE_USERS+=("$user")
        done < "$INSTANCES_FILE"
        echo ""
        # Skip to user creation
        SKIP_PLANNING=true
    fi
fi

if [[ "${SKIP_PLANNING:-}" != "true" ]]; then
    echo "How many gateway instances?"
    echo ""
    echo "  1) Single gateway (recommended) — one user, all channels, multi-agent"
    echo "  2) Multiple gateways — separate user per channel for stronger isolation"
    echo ""
    read -rp "Choice [1]: " INSTANCE_CHOICE
    INSTANCE_CHOICE="${INSTANCE_CHOICE:-1}"

    if [[ "$INSTANCE_CHOICE" == "1" ]]; then
        # Single instance
        echo "# name:user:port:cdp_port:channels:agents" > "$INSTANCES_FILE"
        echo "default:${OPENCLAW_USER}:18789:18800:whatsapp,signal,googlechat:main,whatsapp,signal,googlechat,search" >> "$INSTANCES_FILE"
        INSTANCE_USERS=("$OPENCLAW_USER")
        echo ""
        echo -e "${GREEN}Single-instance mode — user '$OPENCLAW_USER', port 18789${NC}"

    elif [[ "$INSTANCE_CHOICE" == "2" ]]; then
        read -rp "How many instances? " INSTANCE_COUNT
        if ! [[ "$INSTANCE_COUNT" =~ ^[0-9]+$ ]] || [ "$INSTANCE_COUNT" -lt 2 ]; then
            echo -e "${RED}Need at least 2 instances for multi-gateway${NC}"
            exit 1
        fi

        echo "# name:user:port:cdp_port:channels:agents" > "$INSTANCES_FILE"
        INSTANCE_USERS=()
        USED_NAMES=()
        USED_PORTS=()
        NEXT_PORT=18789
        NEXT_CDP=18800

        echo ""
        for i in $(seq 1 "$INSTANCE_COUNT"); do
            echo -e "${BOLD}Instance $i:${NC}"

            read -rp "  Name (short identifier, e.g. 'wa'): " INST_NAME
            # Validate: 1-16 alphanumeric chars, hyphens OK in middle
            if ! [[ "$INST_NAME" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]{0,14}[a-zA-Z0-9])?$ ]]; then
                echo -e "${RED}Invalid name — use 1-16 alphanumeric chars (hyphens allowed)${NC}"
                exit 1
            fi
            # Check uniqueness
            if [[ ${#USED_NAMES[@]} -gt 0 ]]; then
                for used in "${USED_NAMES[@]}"; do
                    if [[ "$used" == "$INST_NAME" ]]; then
                        echo -e "${RED}Duplicate instance name '$INST_NAME'${NC}"
                        exit 1
                    fi
                done
            fi
            USED_NAMES+=("$INST_NAME")

            echo "  Channel:"
            echo "    1) WhatsApp"
            echo "    2) Signal"
            echo "    3) Both (WhatsApp + Signal)"
            echo "    4) Google Chat"
            read -rp "  Choice [1]: " CH_CHOICE
            CH_CHOICE="${CH_CHOICE:-1}"
            case "$CH_CHOICE" in
                1) CHANNELS="whatsapp"; AGENTS="main,whatsapp,search" ;;
                2) CHANNELS="signal"; AGENTS="main,signal,search" ;;
                3) CHANNELS="whatsapp,signal"; AGENTS="main,whatsapp,signal,search" ;;
                4) CHANNELS="googlechat"; AGENTS="main,googlechat,search" ;;
                *) echo -e "${RED}Invalid choice${NC}"; exit 1 ;;
            esac

            read -rp "  Port [$NEXT_PORT]: " CUSTOM_PORT
            PORT="${CUSTOM_PORT:-$NEXT_PORT}"
            if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [ "$PORT" -lt 1024 ] || [ "$PORT" -gt 65535 ]; then
                echo -e "${RED}Invalid port (must be 1024-65535)${NC}"
                exit 1
            fi
            # Check port uniqueness
            if [[ ${#USED_PORTS[@]} -gt 0 ]]; then
                for used in "${USED_PORTS[@]}"; do
                    if [[ "$used" == "$PORT" ]]; then
                        echo -e "${RED}Duplicate port $PORT — each instance needs a unique port${NC}"
                        exit 1
                    fi
                done
            fi
            USED_PORTS+=("$PORT")

            CDP="$NEXT_CDP"

            read -rp "  Include computer agent for exec isolation? (y/N): " COMPUTER_CHOICE
            if [[ "$COMPUTER_CHOICE" =~ ^[Yy]$ ]]; then
                AGENTS="${AGENTS/,search/,computer,search}"
            fi

            INST_USER="openclaw-${INST_NAME}"
            echo "${INST_NAME}:${INST_USER}:${PORT}:${CDP}:${CHANNELS}:${AGENTS}" >> "$INSTANCES_FILE"
            INSTANCE_USERS+=("$INST_USER")

            NEXT_PORT=$((PORT + 1))
            NEXT_CDP=$((CDP + 1))
            echo ""
        done

        # Show plan
        echo -e "${BOLD}Plan:${NC}"
        while IFS=: read -r name user port cdp channels agents; do
            [[ "$name" =~ ^#.*$ || -z "$name" ]] && continue
            echo "  $name → user: $user, port: $port, channels: $channels, agents: $agents"
        done < "$INSTANCES_FILE"
        echo ""
        read -rp "Proceed? (Y/n) " -n 1
        echo
        if [[ "$REPLY" =~ ^[Nn]$ ]]; then
            echo "Aborted."
            exit 1
        fi
    else
        echo -e "${RED}Invalid choice${NC}"
        exit 1
    fi
fi
echo ""

# ── Step 8: Create dedicated user(s) ────────────────────────────

echo -e "${BOLD}--- Step 8: Create dedicated user(s) ---${NC}"

for INST_USER in "${INSTANCE_USERS[@]}"; do
    if id "$INST_USER" &>/dev/null; then
        echo -e "${YELLOW}User '$INST_USER' already exists — skipping creation${NC}"
    else
        # Note: sysadminctl requires -password on the CLI (briefly visible via ps aux).
        # The temp password is random and immediately replaced by passwd below.
        TEMP_PASS=$(openssl rand -base64 32)
        echo "Creating non-admin user '$INST_USER'..."
        sudo sysadminctl -addUser "$INST_USER" -fullName "OpenClaw" -password "$TEMP_PASS" \
            -home "/Users/$INST_USER" -shell /bin/zsh
        unset TEMP_PASS
        echo ""
        echo -e "${BOLD}Set a real password for '$INST_USER':${NC}"
        sudo passwd "$INST_USER"
    fi

    # Ensure home directory exists and is owned correctly
    if [[ ! -d "/Users/$INST_USER" ]]; then
        sudo mkdir -p "/Users/$INST_USER"
        sudo chown -R "$INST_USER:staff" "/Users/$INST_USER"
    fi
    sudo chmod 700 "/Users/$INST_USER"
    echo -e "${GREEN}User '$INST_USER' ready (chmod 700 home)${NC}"
    echo ""
done

# ── Step 9: Install Playwright (per user) ────────────────────────

echo -e "${BOLD}--- Step 9: Install Playwright (chromium) ---${NC}"
# Install as each user so browsers go to their cache directory.
# The gateway runs as this user — Playwright needs to find chromium there.
for INST_USER in "${INSTANCE_USERS[@]}"; do
    echo "Installing for $INST_USER..."
    sudo -u "$INST_USER" npx -y playwright install chromium 2>&1 || {
        echo -e "${YELLOW}Playwright install as $INST_USER failed — trying global install${NC}"
        npx -y playwright install chromium
    }
done
echo -e "${GREEN}Done${NC}"
echo ""

# ── Step 10: Lock down admin home ─────────────────────────────────

echo -e "${BOLD}--- Step 10: Lock down admin home directory ---${NC}"
ADMIN_HOME="/Users/$(whoami)"
CURRENT_PERMS=$(stat -f "%Lp" "$ADMIN_HOME")
if [[ "$CURRENT_PERMS" == "700" ]]; then
    echo -e "${GREEN}Already locked down (700)${NC}"
else
    echo "Current permissions on $ADMIN_HOME: $CURRENT_PERMS"
    chmod 700 "$ADMIN_HOME"
    echo -e "${GREEN}Set to 700${NC}"
fi
echo ""
echo -e "${YELLOW}Note: Residual multi-user exposure remains regardless of permissions:${NC}"
echo "  - ps aux shows all processes (never put secrets in command arguments)"
echo "  - /tmp and /var/tmp are shared"
echo "  - Mounted volumes are typically world-readable"
echo "  On a dedicated machine with no personal data, these are non-issues."
echo ""

# ── Step 11: Enable macOS firewall ────────────────────────────────

echo -e "${BOLD}--- Step 11: Enable macOS firewall ---${NC}"
FW_STATE=$(sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>/dev/null | grep -c "enabled" || true)
if [[ "$FW_STATE" -gt 0 ]]; then
    echo -e "${GREEN}Firewall already enabled${NC}"
else
    sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate on
    echo -e "${GREEN}Firewall enabled${NC}"
fi

STEALTH_STATE=$(sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getstealthmode 2>/dev/null | grep -c "enabled" || true)
if [[ "$STEALTH_STATE" -gt 0 ]]; then
    echo -e "${GREEN}Stealth mode already enabled${NC}"
else
    sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setstealthmode on
    echo -e "${GREEN}Stealth mode enabled${NC}"
fi
echo ""

# ── Summary ─────────────────────────────────────────────────────

echo -e "${BOLD}=== Host setup complete ===${NC}"
echo ""
echo "Installed/verified:"
echo "  Node.js:     $(node --version 2>/dev/null || echo 'not found')"
echo "  Docker:      $(docker --version 2>/dev/null || echo 'not found')"
echo "  OpenClaw:    $(openclaw --version 2>/dev/null || echo 'not found')"
echo "  signal-cli:  $(command -v signal-cli &>/dev/null && echo 'installed' || echo 'not installed')"
echo "  Sandbox img: $(docker image inspect openclaw-sandbox:bookworm-slim &>/dev/null && echo 'built' || echo 'NOT built — run sandbox-setup.sh')"
echo "  Playwright:  chromium"
echo "  Firewall:    enabled + stealth mode"
echo ""
echo "Instances:"
while IFS=: read -r name user port cdp channels agents; do
    [[ "$name" =~ ^#.*$ || -z "$name" ]] && continue
    echo "  $name → user: $user, port: $port, channels: $channels"
done < "$INSTANCES_FILE"
echo ""
echo -e "${BOLD}Next: Run the gateway setup script:${NC}"
echo "  sudo bash scripts/docker-isolation/02-setup-gateway.sh"
echo ""
