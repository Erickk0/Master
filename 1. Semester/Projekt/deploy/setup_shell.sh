#!/usr/bin/env bash
# Configure shell so `cryme` works without `node` prefix.
#
# Usage:
#   bash deploy/setup_shell.sh
#   bash deploy/setup_shell.sh /path/to/cryme
#
# Appends to ~/.zshrc (macOS / zsh) or ~/.bashrc (Linux bash), then reminds to source it.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CRYME_HOME="${1:-${PROJECT_ROOT}}"

MARKER="# CRYME shell setup"
SHELL_RC="${HOME}/.bashrc"
SOURCE_HINT="source ~/.bashrc"

if [[ "${SHELL:-}" == */zsh ]] || [[ -n "${ZSH_VERSION:-}" ]] || [[ "$(uname -s)" == "Darwin" ]]; then
  SHELL_RC="${HOME}/.zshrc"
  SOURCE_HINT="source ~/.zshrc"
fi

if [[ -f "${SHELL_RC}" ]] && grep -qF "${MARKER}" "${SHELL_RC}" 2>/dev/null; then
  echo "[=] CRYME shell setup already present in ${SHELL_RC}"
  echo "    Run: ${SOURCE_HINT}"
  exit 0
fi

cat >> "${SHELL_RC}" <<EOF

${MARKER}
export CRYME_HOME="${CRYME_HOME}"
alias cryme='node "\${CRYME_HOME}/cryme"'
EOF

echo "[+] CRYME shell setup written to ${SHELL_RC}"
echo "    CRYME_HOME=${CRYME_HOME}"
echo ""
echo "    Run now:  ${SOURCE_HINT}"
echo "    Then:     cryme show node"
