#!/usr/bin/env bash
set -euo pipefail

# Add a host:port entry to the egress allowlist and apply firewall rules.
# Usage: allow-domain.sh <host[:port]> [comment]
# Examples:
#   sudo bash allow-domain.sh api.example.com:443
#   sudo bash allow-domain.sh api.example.com:443 "Example API"
#   sudo bash allow-domain.sh api.example.com        # defaults to port 443

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALLOWLIST="$SCRIPT_DIR/allowlist.conf"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1" >&2; }

# --- Argument parsing ---
if [[ $# -lt 1 ]]; then
  error "Usage: allow-domain.sh <host[:port]> [comment]"
  echo "  Examples:"
  echo "    sudo bash allow-domain.sh api.example.com:443"
  echo "    sudo bash allow-domain.sh api.example.com       # defaults to :443"
  echo "    sudo bash allow-domain.sh api.example.com \"My API\""
  exit 1
fi

INPUT="$1"
COMMENT="${2:-}"

# Default port 443 if not specified
if [[ "$INPUT" == *:* ]]; then
  HOST="${INPUT%%:*}"
  PORT="${INPUT##*:}"
else
  HOST="$INPUT"
  PORT="443"
  INPUT="${HOST}:${PORT}"
fi

# --- Validation ---
if [[ -z "$HOST" ]]; then
  error "Host cannot be empty"
  exit 1
fi

if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [[ "$PORT" -lt 1 ]] || [[ "$PORT" -gt 65535 ]]; then
  error "Invalid port: $PORT (must be 1-65535)"
  exit 1
fi

if ! [[ "$HOST" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$ ]]; then
  error "Invalid hostname: $HOST"
  exit 1
fi

# --- Preflight ---
if [[ ! -f "$ALLOWLIST" ]]; then
  error "Allowlist not found: $ALLOWLIST"
  exit 1
fi

if [[ $EUID -ne 0 ]]; then
  error "This script requires root. Run with sudo:"
  echo "  sudo bash $0 $*"
  exit 1
fi

# --- Check for duplicates ---
if grep -qxF "$INPUT" "$ALLOWLIST" 2>/dev/null; then
  warn "Already in allowlist: $INPUT"
  exit 0
fi

# --- Append entry ---
{
  if [[ -n "$COMMENT" ]]; then
    echo ""
    echo "# $COMMENT"
  fi
  echo "$INPUT"
} >> "$ALLOWLIST"

info "Added to allowlist: $INPUT"

# --- Apply rules ---
if [[ "$(uname)" == "Darwin" ]]; then
  APPLY_SCRIPT="$SCRIPT_DIR/apply-rules.sh"
else
  APPLY_SCRIPT="$SCRIPT_DIR/apply-rules-linux.sh"
fi

if [[ ! -f "$APPLY_SCRIPT" ]]; then
  warn "Apply script not found: $APPLY_SCRIPT"
  warn "Entry added to allowlist but firewall rules not updated."
  warn "Run the apply script manually when available."
  exit 0
fi

info "Applying firewall rules..."

bash "$APPLY_SCRIPT"
info "Done — $INPUT is now allowed through the egress firewall"
