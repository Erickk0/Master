#!/usr/bin/env bash
# Quick Memgraph connectivity check for CRYME server.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=== CRYME Memgraph connectivity ==="
echo ""

# Docker container
docker_cmd() {
  if docker ps &>/dev/null; then
    docker "$@"
  elif sudo docker ps &>/dev/null; then
    sudo docker "$@"
  else
    return 1
  fi
}

if docker_cmd ps --format '{{.Names}}' 2>/dev/null | grep -qx cryme-memgraph; then
  echo "[+] Container cryme-memgraph is running"
else
  echo "[-] Container cryme-memgraph is NOT running"
  echo "    Fix: cd ~/cryme && sudo docker-compose -f deploy/docker-compose.yml up -d"
fi

if docker_cmd ps --format '{{.Names}}' 2>/dev/null | grep -qx cryme-memgraph-lab; then
  echo "[+] Container cryme-memgraph-lab is running"
else
  echo "[-] Container cryme-memgraph-lab is NOT running"
fi

# TCP port
if timeout 2 bash -c 'echo > /dev/tcp/127.0.0.1/7687' 2>/dev/null; then
  echo "[+] Port 127.0.0.1:7687 is reachable (Bolt)"
else
  echo "[-] Port 127.0.0.1:7687 is NOT reachable"
fi

if timeout 2 bash -c 'echo > /dev/tcp/127.0.0.1/3000' 2>/dev/null; then
  echo "[+] Port 127.0.0.1:3000 is reachable (Memgraph Lab UI)"
else
  echo "[-] Port 127.0.0.1:3000 is NOT reachable (start memgraph-lab container)"
fi

# Node driver test
echo ""
echo "--- Node.js driver test ---"
if command -v node &>/dev/null && [[ -f "${PROJECT_ROOT}/web_app/check_db.js" ]]; then
  if (cd "${PROJECT_ROOT}/web_app" && node check_db.js) 2>&1; then
    echo "[+] Bolt connection via neo4j-driver works"
  else
    echo "[-] Bolt connection via neo4j-driver FAILED"
  fi
else
  echo "[!] node or check_db.js not available"
fi

echo ""
echo "=== How to connect ==="
echo ""
echo "On the server (SSH session on ilmare):"
echo "  cryme init"
echo "  cryme show node"
echo ""
echo "Memgraph Lab GUI (from your laptop via SSH tunnel):"
echo "  ssh -L 3000:127.0.0.1:3000 -L 7687:127.0.0.1:7687 admin@ilmare"
echo "  Then open: http://localhost:3000"
echo "  Connect to: bolt://localhost:7687  (no username/password)"
echo ""
echo "Direct remote access is blocked by design (127.0.0.1 binding)."
echo ""
