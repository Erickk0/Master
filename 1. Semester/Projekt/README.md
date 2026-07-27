# CRYME — Post-Quantum Cryptographic Migration Oracle

Orchestrator for planned PQC migrations: digital twin → Oracle validation → Ansible deploy → live HTTPS proof.

**Start here:** [**INSTALL.md**](INSTALL.md) — local install from git (Mac/Linux) · [**GUIDE.md**](GUIDE.md) — full project guide

## Quick start (local Mac/Linux)

```bash
git clone <repo-url> cryme && cd cryme
bash deploy/install_local.sh
source ~/.zshrc          # or: source ~/.bashrc
cryme init
cryme verify baseline    # TLS + curl -sk https://127.0.0.1:8443/api/status
```

## Quick start (university server)

```bash
cd ~/cryme
sudo bash deploy/install_prerequisites.sh
source ~/.bashrc
cryme init
cryme verify baseline
```

## Live demo (5 min)

Print [docs/LIVE_DEMO_CHEAT_SHEET.md](docs/LIVE_DEMO_CHEAT_SHEET.md) and run on `ilmare.local.cs.hs-rm.de`.

## Documentation

| Doc | Purpose |
|-----|---------|
| [**INSTALL.md**](INSTALL.md) | **Local install** — clone from git, Mac/Linux |
| [**GUIDE.md**](GUIDE.md) | **Main guide** — everything in one place |
| [docs/LIVE_DEMO_CHEAT_SHEET.md](docs/LIVE_DEMO_CHEAT_SHEET.md) | One-page demo script |
| [docs/DOMAIN_ANALYSIS.md](docs/DOMAIN_ANALYSIS.md) | Actors, views, use cases |
| [docs/DOMAIN_MODEL.md](docs/DOMAIN_MODEL.md) | ER diagram, naming rules |
| [docs/MIGRATION_STATES.md](docs/MIGRATION_STATES.md) | System state per step |
| [docs/TLS_ALGORITHMS.md](docs/TLS_ALGORITHMS.md) | TLS profiles, curl flags |
| [docs/CLI_GUIDE.md](docs/CLI_GUIDE.md) | CLI reference |
| [docs/GRAPH_VERSIONING.md](docs/GRAPH_VERSIONING.md) | Event sourcing, HEAD |
| [docs/DEMO_REPORT_FOR.md](docs/DEMO_REPORT_FOR.md) | Professor demo report |
| [docs/LIVE_SERVICE.md](docs/LIVE_SERVICE.md) | Live HTTPS architecture |
| [docs/SERVER_DEPLOYMENT.md](docs/SERVER_DEPLOYMENT.md) | University server setup |
| [docs/migration_explanation.md](docs/migration_explanation.md) | Oracle SCC behaviour |

## Project layout

```
cryme/                    CLI orchestrator
web_app/                  Oracle engine + optional web UI
deploy/                   Docker, Ansible, TLS verification
playbooks/                Generated Ansible playbooks
logs/                     Oracle step logs
docs/                     Detailed documentation
assets/                   Thesis PDFs, figures, Typst sources
webserver_pqc_twin.yaml   Active digital twin (webserver)
digital_twin.yaml         Automotive scenario (paper/thesis)
GUIDE.md                  Main entry-point guide
```

## Memgraph GUI

```bash
ssh -L 3000:127.0.0.1:3000 -L 7687:127.0.0.1:7687 admin@ilmare
```

Open http://localhost:3000 → `bolt://localhost:7687` (no credentials).

## Troubleshooting

```bash
bash deploy/check_memgraph.sh
sudo docker-compose -f deploy/docker-compose.yml up -d
cryme init
```

See [GUIDE.md § Troubleshooting](GUIDE.md#12-troubleshooting) for more.
