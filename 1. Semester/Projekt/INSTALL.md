# CRYME — Local Installation (Mac & Linux)

Install CRYME from a git clone on your own machine. Works on **macOS** and **Linux** without the university server.

---

## What you need

| Tool | Minimum | Used for |
|------|---------|----------|
| **Git** | any | clone the repo |
| **Docker** | running daemon | Memgraph, nginx TLS demo, curl client |
| **Node.js** | 18+ | `cryme` CLI and Oracle |
| **npm** | comes with Node | install `web_app` dependencies |
| **Ansible** | 2.x | `cryme deploy` (TLS stack updates) |
| **curl**, **openssl**, **python3** | any | TLS verification and JSON output |

---

## 1. Clone the repository

```bash
git clone <your-repo-url> cryme
cd cryme
```

Replace `<your-repo-url>` with the actual git URL (HTTPS or SSH).

---

## 2. Install system packages

### macOS (Homebrew)

```bash
brew install git curl openssl python node ansible
brew install --cask docker
```

Open **Docker Desktop** and wait until it says Docker is running.

### Linux (Debian / Ubuntu)

```bash
sudo apt update
sudo apt install -y git curl openssl python3 nodejs npm ansible docker.io docker-compose
sudo usermod -aG docker "$USER"
```

Log out and back in so the `docker` group applies.

### Linux (Fedora)

```bash
sudo dnf install -y git curl openssl python3 nodejs npm ansible docker docker-compose
sudo usermod -aG docker "$USER"
```

---

## 3. Run the installer

From the project root:

```bash
bash deploy/install_local.sh
```

This script:

1. Checks that required tools are present
2. Generates demo TLS certificates
3. Runs `npm install` in `web_app/`
4. Starts Docker containers (`docker compose -f deploy/docker-compose.yml up -d`)
5. Adds a `cryme` shell alias to `~/.zshrc` (macOS) or `~/.bashrc` (Linux)

**Behind a corporate proxy?**

```bash
CRYME_PROXY=http://proxy.example:8080 bash deploy/install_local.sh
```

---

## 4. Activate the CLI

```bash
source ~/.zshrc    # macOS default
# or
source ~/.bashrc   # Linux bash
```

Test:

```bash
cryme show node
```

If you see `cryme: command not found`, run `bash deploy/setup_shell.sh` and source your shell rc file again.

---

## 5. Initialize and verify

```bash
cryme init
cryme verify baseline
```

`cryme init` loads the digital twin into Memgraph and resets the live HTTPS service to **step 0** (classic TLS).

`cryme verify baseline` checks:

- TLS handshake (`openssl`, `curl`)
- **Migration state** via `curl -sk https://127.0.0.1:8443/api/status`

You should see `"migration_step": 0` at baseline.

Manual check (same as verify uses internally):

```bash
curl -sk https://127.0.0.1:8443/api/status | python3 -m json.tool
```

---

## 6. Try a migration

```bash
# Step 1 — expected FAIL (hidden dependency)
cryme migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768

# Step 2 — SUCCESS (co-migrate server + browser KEX)
cryme migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768
cryme deploy step=2
cryme verify step=2
```

After deploy, `/api/status` should show `"migration_step": 2` and updated algorithms.

---

## Daily commands

| Task | Command |
|------|---------|
| Start stack | `docker compose -f deploy/docker-compose.yml up -d` |
| Stop stack | `docker compose -f deploy/docker-compose.yml down` |
| Reset everything | `cryme init` |
| Check TLS + migration | `cryme verify` or `cryme verify step=N` |
| Migration history | `cryme show tree` |
| Memgraph GUI | open http://localhost:3000 → connect `bolt://localhost:7687` |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `cryme: command not found` | `bash deploy/setup_shell.sh && source ~/.zshrc` |
| `Connection refused` on `:8443` | `docker compose -f deploy/docker-compose.yml up -d` |
| Docker permission denied (Linux) | `sudo usermod -aG docker $USER`, then re-login |
| Docker not running (Mac) | Start Docker Desktop |
| Memgraph empty | `bash deploy/check_memgraph.sh` then `cryme init` |
| `migration_step mismatch` on verify | Run `cryme deploy step=N` after a successful migrate |
| `cryme deploy` needs Docker access | On Linux: `sudo -E cryme deploy step=N` if not in `docker` group |

---

## University server install

For the hs-rm deployment (with apt/Docker proxy), use instead:

```bash
sudo bash deploy/install_prerequisites.sh
source ~/.bashrc
cryme init
```

See [GUIDE.md](GUIDE.md) and [docs/SERVER_DEPLOYMENT.md](docs/SERVER_DEPLOYMENT.md).

---

## What runs in Docker

| Container | Port | Role |
|-----------|------|------|
| `cryme-memgraph` | 7687 | Graph database (Oracle) |
| `cryme-memgraph-lab` | 3000 | Web UI for Memgraph |
| `cryme-nginx-classic` | **8443** | Live HTTPS + `/api/status` |
| `cryme-curl-client` | — | Simulated browser TLS client |

Live API (always check migration here after deploy):

```bash
curl -sk https://127.0.0.1:8443/api/status
```
