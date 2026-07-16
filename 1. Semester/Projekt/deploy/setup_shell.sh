#!/usr/bin/env bash
# Configure shell so `cryme` works without `node` prefix.
#
# Usage:
#   bash deploy/setup_shell.sh
#   bash deploy/setup_shell.sh /path/to/cryme
#
# Appends to ~/.bashrc if not already present, then reminds to: source ~/.bashrc

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CRYME_HOME="${1:-${PROJECT_ROOT}}"

BASHRC="${HOME}/.bashrc"
MARKER="# CRYME shell setup"

if [[ -f "${BASHRC}" ]] && grep -qF "${MARKER}" "${BASHRC}" 2>/dev/null; then
  echo "[=] CRYME shell setup already present in ${BASHRC}"
  echo "    Run: source ~/.bashrc"
  exit 0
fi

cat >> "${BASHRC}" <<EOF

${MARKER}
export CRYME_HOME="${CRYME_HOME}"
alias cryme='node "\${CRYME_HOME}/cryme"'
EOF

echo "[+] CRYME shell setup written to ${BASHRC}"
echo "    CRYME_HOME=${CRYME_HOME}"
echo ""
echo "    Run now:  source ~/.bashrc"
echo "    Then:     cryme show node"
