#!/usr/bin/env bash
# CRYME university server prerequisites — Docker, Node.js, Ansible, Git
# Configures http://proxy.cs.hs-rm.de:8080 for apt, Docker daemon, and npm.
#
# Usage: sudo bash deploy/install_prerequisites.sh

set -euo pipefail

PROXY_URL="${CRYME_PROXY:-http://proxy.cs.hs-rm.de:8080}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ "${EUID}" -ne 0 ]]; then
  echo "[-] Run as root: sudo bash deploy/install_prerequisites.sh"
  exit 1
fi

echo "[+] CRYME prerequisites installer"
echo "    Proxy: ${PROXY_URL}"
echo "    Project: ${PROJECT_ROOT}"

export http_proxy="${PROXY_URL}"
export https_proxy="${PROXY_URL}"
export HTTP_PROXY="${PROXY_URL}"
export HTTPS_PROXY="${PROXY_URL}"
export no_proxy="localhost,127.0.0.1"
export NO_PROXY="localhost,127.0.0.1"

# --- apt proxy (persistent) ---
APT_PROXY_FILE="/etc/apt/apt.conf.d/95cryme-proxy"
cat > "${APT_PROXY_FILE}" <<EOF
Acquire::http::Proxy "${PROXY_URL}";
Acquire::https::Proxy "${PROXY_URL}";
EOF
echo "[+] Wrote ${APT_PROXY_FILE}"

apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  ca-certificates curl gnupg lsb-release openssl git ansible docker.io

# docker-compose-plugin (Docker CE repo) is often unavailable on Debian —
# use the distro package docker-compose instead.
if apt-cache show docker-compose-plugin &>/dev/null; then
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker-compose-plugin
elif apt-cache show docker-compose &>/dev/null; then
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker-compose
else
  echo "[-] Neither docker-compose-plugin nor docker-compose found in apt."
  exit 1
fi

# Use "docker compose" (plugin) or "docker-compose" (Debian package)
docker_compose() {
  if docker compose version &>/dev/null; then
    docker compose "$@"
  elif command -v docker-compose &>/dev/null; then
    docker-compose "$@"
  else
    echo "[-] Docker Compose not available."
    exit 1
  fi
}

# Allow the invoking user to run Docker without sudo
DOCKER_USER="${SUDO_USER:-${USER}}"
if [[ -n "${DOCKER_USER}" && "${DOCKER_USER}" != "root" ]]; then
  usermod -aG docker "${DOCKER_USER}" 2>/dev/null || true
  echo "[+] Added ${DOCKER_USER} to group docker (re-login for group to apply)"
fi

# --- Node.js 20 via NodeSource (if node < 18) ---
if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]]; then
  echo "[+] Installing Node.js 20.x ..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs
fi

# --- Docker daemon proxy (image pulls) ---
DOCKER_PROXY_DIR="/etc/systemd/system/docker.service.d"
mkdir -p "${DOCKER_PROXY_DIR}"
cat > "${DOCKER_PROXY_DIR}/http-proxy.conf" <<EOF
[Service]
Environment="HTTP_PROXY=${PROXY_URL}"
Environment="HTTPS_PROXY=${PROXY_URL}"
Environment="NO_PROXY=localhost,127.0.0.1"
EOF
systemctl daemon-reload
systemctl enable docker
systemctl restart docker
echo "[+] Docker daemon proxy configured"

# --- npm proxy (project user) ---
NPM_USER="${SUDO_USER:-${USER}}"
if [[ -n "${NPM_USER}" && "${NPM_USER}" != "root" ]]; then
  sudo -u "${NPM_USER}" npm config set proxy "${PROXY_URL}" || true
  sudo -u "${NPM_USER}" npm config set https-proxy "${PROXY_URL}" || true
  echo "[+] npm proxy set for user ${NPM_USER}"
fi

# --- TLS demo certificates ---
bash "${SCRIPT_DIR}/generate_certs.sh"

# --- npm install CRYME ---
cd "${PROJECT_ROOT}/web_app"
if [[ -n "${NPM_USER}" && "${NPM_USER}" != "root" ]]; then
  sudo -u "${NPM_USER}" env http_proxy="${PROXY_URL}" https_proxy="${PROXY_URL}" npm install
else
  env http_proxy="${PROXY_URL}" https_proxy="${PROXY_URL}" npm install
fi

# --- Docker stack ---
cd "${PROJECT_ROOT}"
export HTTP_PROXY="${PROXY_URL}"
export HTTPS_PROXY="${PROXY_URL}"
docker_compose -f deploy/docker-compose.yml pull
docker_compose -f deploy/docker-compose.yml up -d

# --- Shell alias: cryme command without 'node' prefix ---
if [[ -n "${NPM_USER}" && "${NPM_USER}" != "root" ]]; then
  sudo -u "${NPM_USER}" bash "${SCRIPT_DIR}/setup_shell.sh" "${PROJECT_ROOT}" || true
else
  bash "${SCRIPT_DIR}/setup_shell.sh" "${PROJECT_ROOT}" || true
fi

echo ""
echo "[+] Prerequisites installed. Next steps:"
echo "    source ~/.bashrc"
echo "    cd \"${PROJECT_ROOT}\""
echo "    cryme init"
echo "    cryme verify baseline"
echo ""
