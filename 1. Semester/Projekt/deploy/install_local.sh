#!/usr/bin/env bash
# CRYME local install — Mac and Linux (no university proxy required).
#
# Usage:
#   git clone <repo-url> cryme && cd cryme
#   bash deploy/install_local.sh
#
# Optional: CRYME_PROXY=http://proxy.example:8080 bash deploy/install_local.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "[+] CRYME local installer"
echo "    Project: ${PROJECT_ROOT}"

OS="$(uname -s)"
MISSING=()

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    MISSING+=("$1")
    return 1
  fi
  return 0
}

echo ""
echo "--- Checking prerequisites ---"

need_cmd git || true
need_cmd curl || true
need_cmd openssl || true
need_cmd python3 || true
need_cmd node || true
need_cmd npm || true
need_cmd ansible || true
need_cmd docker || true

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo ""
  echo "[-] Missing commands: ${MISSING[*]}"
  echo ""
  if [[ "${OS}" == "Darwin" ]]; then
    echo "Install on macOS (Homebrew):"
    echo "  brew install git curl openssl python node ansible"
    echo "  brew install --cask docker    # then start Docker Desktop"
  else
    echo "Install on Linux (Debian/Ubuntu example):"
    echo "  sudo apt update"
    echo "  sudo apt install -y git curl openssl python3 nodejs npm ansible docker.io docker-compose"
    echo "  sudo usermod -aG docker \"\$USER\"   # then log out and back in"
  fi
  echo ""
  echo "Node.js 18+ is required. Re-run this script after installing."
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "${NODE_MAJOR}" -lt 18 ]]; then
  echo "[-] Node.js 18+ required (found $(node -v))"
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "[-] Docker is installed but not running."
  if [[ "${OS}" == "Darwin" ]]; then
    echo "    Start Docker Desktop, wait until it is ready, then re-run this script."
  else
    echo "    Start Docker: sudo systemctl start docker"
  fi
  exit 1
fi

docker_compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    echo "[-] Docker Compose not found (need 'docker compose' or 'docker-compose')."
    exit 1
  fi
}

if [[ -n "${CRYME_PROXY:-}" ]]; then
  export HTTP_PROXY="${CRYME_PROXY}"
  export HTTPS_PROXY="${CRYME_PROXY}"
  export http_proxy="${CRYME_PROXY}"
  export https_proxy="${CRYME_PROXY}"
  echo "[+] Using proxy: ${CRYME_PROXY}"
fi

echo "[+] Generating demo TLS certificates ..."
bash "${SCRIPT_DIR}/generate_certs.sh"

echo "[+] Installing Node.js dependencies ..."
cd "${PROJECT_ROOT}/web_app"
npm install

echo "[+] Starting Docker stack ..."
cd "${PROJECT_ROOT}"
docker_compose -f deploy/docker-compose.yml pull
docker_compose -f deploy/docker-compose.yml up -d

echo "[+] Configuring shell alias ..."
bash "${SCRIPT_DIR}/setup_shell.sh" "${PROJECT_ROOT}"

echo ""
echo "[+] Local install complete."
echo ""
echo "Next steps:"
echo "  source ~/.zshrc    # or: source ~/.bashrc"
echo "  cd \"${PROJECT_ROOT}\""
echo "  cryme init"
echo "  cryme verify baseline"
echo ""
echo "Quick migration check:"
echo "  curl -sk https://127.0.0.1:8443/api/status"
echo ""
