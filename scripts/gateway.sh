#!/usr/bin/env bash
set -euo pipefail

# === Gateway Management ===
# Wraps platform-specific service commands for the OpenClaw gateway.
# Reads .instances for multi-instance macOS setups.
#
# Usage: gateway.sh <command> [<instance>]
#
# Commands: start | stop | restart | status | reload | logs
# Instance: optional name from .instances (omit to target all / the only one)
#
# macOS: LaunchDaemon in system domain (launchctl)
# Linux: systemd system service (systemctl)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Default: docker-isolation .instances. Override via INSTANCES_FILE env var.
INSTANCES_FILE="${INSTANCES_FILE:-$SCRIPT_DIR/docker-isolation/.instances}"

# ── Color output ──────────────────────────────────────────────────
if [ -t 1 ]; then
    RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'
else
    RED=''; GREEN=''; YELLOW=''; BOLD=''; NC=''
fi

usage() {
    echo "Usage: $(basename "$0") <command> [<instance>]"
    echo ""
    echo "  start    Start the gateway service"
    echo "  stop     Stop the gateway service"
    echo "  restart  Restart the gateway service"
    echo "  status   Show service status"
    echo "  reload   Reload config without restart (SIGUSR1)"
    echo "  logs     Tail the gateway log"
    echo ""
    echo "Instance (macOS multi-instance only): name from .instances"
    echo "Omit to target all instances (or the only one)."
    exit 1
}

# ── macOS helpers ─────────────────────────────────────────────────
plist_label() {
    [[ "$1" == "default" ]] && echo "ai.openclaw.gateway" || echo "ai.openclaw.gateway.$1"
}

load_instances() {
    INST_NAMES=(); INST_USERS=()
    if [[ -f "$INSTANCES_FILE" ]]; then
        while IFS=: read -r name user _rest || [[ -n "$name" ]]; do
            [[ "$name" =~ ^#.*$ || -z "$name" ]] && continue
            INST_NAMES+=("$name"); INST_USERS+=("$user")
        done < "$INSTANCES_FILE"
    else
        INST_NAMES+=("default"); INST_USERS+=("${OPENCLAW_USER:-openclaw}")
    fi
}

macos_cmd() {
    local cmd="$1" name="$2" user="$3"
    local label service plist
    label="$(plist_label "$name")"
    service="system/$label"
    plist="/Library/LaunchDaemons/$label.plist"

    case "$cmd" in
        start)
            echo -e "${BOLD}Starting $label...${NC}"
            sudo launchctl bootstrap system "$plist"
            echo -e "${GREEN}Started${NC}"
            ;;
        stop)
            echo -e "${BOLD}Stopping $label...${NC}"
            sudo launchctl bootout "$service"
            echo -e "${GREEN}Stopped${NC}"
            ;;
        restart)
            echo -e "${BOLD}Restarting $label...${NC}"
            sudo launchctl bootout "$service" 2>/dev/null || true
            sleep 1
            sudo launchctl bootstrap system "$plist"
            echo -e "${GREEN}Restarted${NC}"
            ;;
        status)
            echo -e "${BOLD}$label${NC}"
            sudo launchctl print "$service" 2>&1 | head -15
            ;;
        reload)
            echo -e "${BOLD}Reloading config for $label (SIGUSR1)...${NC}"
            PID=$(pgrep -u "$user" -f "openclaw.*gateway" 2>/dev/null || true)
            if [[ -z "$PID" ]]; then
                echo -e "${RED}Gateway not running (no process for user $user)${NC}" >&2; exit 1
            fi
            sudo kill -USR1 "$PID"
            echo -e "${GREEN}Reload signal sent (pid $PID)${NC}"
            ;;
        logs)
            local log="/Users/$user/.openclaw/logs/gateway.log"
            echo -e "${BOLD}Tailing $log${NC}"
            sudo tail -f "$log"
            ;;
    esac
}

# ── Linux helpers ─────────────────────────────────────────────────
linux_cmd() {
    local cmd="$1"
    local unit="openclaw-gateway"
    local oc_user="${OPENCLAW_USER:-openclaw}"

    case "$cmd" in
        start)
            echo -e "${BOLD}Starting $unit...${NC}"
            sudo systemctl start "$unit"
            echo -e "${GREEN}Started${NC}"
            ;;
        stop)
            echo -e "${BOLD}Stopping $unit...${NC}"
            sudo systemctl stop "$unit"
            echo -e "${GREEN}Stopped${NC}"
            ;;
        restart)
            echo -e "${BOLD}Restarting $unit...${NC}"
            sudo systemctl restart "$unit"
            echo -e "${GREEN}Restarted${NC}"
            ;;
        status)
            sudo systemctl status "$unit"
            ;;
        reload)
            echo -e "${BOLD}Reloading config (SIGUSR1)...${NC}"
            PID=$(systemctl show -p MainPID --value "$unit" 2>/dev/null || echo "0")
            if [[ -z "$PID" || "$PID" == "0" ]]; then
                echo -e "${RED}Gateway not running${NC}" >&2; exit 1
            fi
            sudo kill -USR1 "$PID"
            echo -e "${GREEN}Reload signal sent (pid $PID)${NC}"
            ;;
        logs)
            if command -v journalctl &>/dev/null; then
                sudo journalctl -u "$unit" -f
            else
                local log
                log="$(getent passwd "$oc_user" | cut -d: -f6)/.openclaw/logs/gateway.log"
                echo -e "${BOLD}Tailing $log${NC}"
                sudo tail -f "$log"
            fi
            ;;
    esac
}

# ── Main ──────────────────────────────────────────────────────────
[[ $# -lt 1 ]] && usage

CMD="$1"; FILTER="${2:-}"
case "$CMD" in
    start|stop|restart|status|reload|logs) ;;
    *) echo -e "${RED}Unknown command: $CMD${NC}" >&2; usage ;;
esac

PLATFORM="$(uname -s)"

if [[ "$PLATFORM" == "Darwin" ]]; then
    load_instances

    if [[ -n "$FILTER" ]]; then
        # Named instance
        found=0
        for idx in "${!INST_NAMES[@]}"; do
            if [[ "${INST_NAMES[$idx]}" == "$FILTER" ]]; then
                macos_cmd "$CMD" "${INST_NAMES[$idx]}" "${INST_USERS[$idx]}"
                found=1; break
            fi
        done
        if [[ "$found" == 0 ]]; then
            echo -e "${RED}Instance '$FILTER' not found${NC}" >&2
            echo "Available: ${INST_NAMES[*]}" >&2; exit 1
        fi

    elif [[ ${#INST_NAMES[@]} -eq 1 ]]; then
        # Single instance — no disambiguation needed
        macos_cmd "$CMD" "${INST_NAMES[0]}" "${INST_USERS[0]}"

    else
        # Multiple instances — logs requires specifying one
        if [[ "$CMD" == "logs" ]]; then
            echo -e "${YELLOW}Multiple instances — specify one: ${INST_NAMES[*]}${NC}" >&2
            echo "Usage: $(basename "$0") logs <instance>" >&2; exit 1
        fi
        for idx in "${!INST_NAMES[@]}"; do
            echo ""
            macos_cmd "$CMD" "${INST_NAMES[$idx]}" "${INST_USERS[$idx]}"
        done
    fi

elif [[ "$PLATFORM" == "Linux" ]]; then
    [[ -n "$FILTER" ]] && echo -e "${YELLOW}Instance argument ignored on Linux${NC}"
    linux_cmd "$CMD"

else
    echo -e "${RED}Unsupported platform: $PLATFORM${NC}" >&2; exit 1
fi
