# CRYME — Post-Quantum Cryptographic Migration Oracle

Server deployment of the CRYME CLI, Memgraph graph oracle, and Docker TLS demo stack.

## Quick start

```bash
cd ~/cryme
sudo bash deploy/install_prerequisites.sh
node cryme init
node cryme verify tls baseline
```

## Memgraph — how to connect

Memgraph listens on **`127.0.0.1:7687`** only (not reachable from the internet).

| From | How |
|------|-----|
| **Server (SSH)** | `node cryme show node` or `cd web_app && node check_db.js` |
| **Your laptop (GUI)** | SSH tunnel, then open Memgraph Lab |

### SSH tunnel + Memgraph Lab (recommended)

On your **laptop**:

```bash
ssh -L 3000:127.0.0.1:3000 -L 7687:127.0.0.1:7687 admin@ilmare
```

Then open **http://localhost:3000** in your browser.  
Connect with: `bolt://localhost:7687` — leave username and password **empty**.

### Troubleshooting

```bash
bash deploy/check_memgraph.sh
```

If containers are down:

```bash
cd ~/cryme
sudo docker-compose -f deploy/docker-compose.yml up -d
node cryme init
```

## Documentation

| File | Purpose |
|------|---------|
| [LIVE_DEMO_CHEAT_SHEET.md](LIVE_DEMO_CHEAT_SHEET.md) | **One-page demo script for professor meeting** |
| [DEMO_REPORT_FOR_PROFESSOR.md](DEMO_REPORT_FOR_PROFESSOR.md) | Full demo report with results and architecture |
| [LIVE_SERVICE.md](LIVE_SERVICE.md) | Real migratable HTTPS service (nginx + API) |
| [CLI_GUIDE.md](CLI_GUIDE.md) | Command-line reference (`show`, `migrate`, `deploy`, `verify`) |
| [SERVER_DEPLOYMENT.md](SERVER_DEPLOYMENT.md) | University server architecture and deployment plan |
| [GRAPH_VERSIONING.md](GRAPH_VERSIONING.md) | Migration history, HEAD pointer, event-sourcing model |
| [migration_demo_commands.md](migration_demo_commands.md) | Step-by-step demo commands |
| [migration_explanation.md](migration_explanation.md) | Oracle behaviour explained (SCC, implicit edges) |

## Project layout

```
cryme/              CLI entry point
web_app/            Oracle engine + optional web UI
deploy/             Docker, Ansible, TLS verification
  services/cryme-api/   Live migratable HTTPS backend
  state/runtime.json    Live crypto state (updated by deploy)
playbooks/          Generated Ansible migration playbooks
logs/               Oracle step logs
webserver_pqc_twin.yaml   Digital twin model
```
