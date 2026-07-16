# CRYME — Post-Quantum Cryptographic Migration Oracle

Orchestrator for planned PQC migrations: digital twin → Oracle validation → Ansible deploy → live HTTPS proof.

**Start here:** [**GUIDE.md**](GUIDE.md) — comprehensive guide (install, domain model, CLI, demo, troubleshooting)

## Quick start

```bash
cd ~/cryme
sudo bash deploy/install_prerequisites.sh
source ~/.bashrc
cryme init
cryme verify tls baseline
```

## Live demo (5 min)

Print [LIVE_DEMO_CHEAT_SHEET.md](LIVE_DEMO_CHEAT_SHEET.md) and run on `ilmare.local.cs.hs-rm.de`.

## Documentation

| Doc | Purpose |
|-----|---------|
| [**GUIDE.md**](GUIDE.md) | **Main guide** — everything in one place |
| [LIVE_DEMO_CHEAT_SHEET.md](LIVE_DEMO_CHEAT_SHEET.md) | One-page demo script |
| [DOMAIN_ANALYSIS.md](DOMAIN_ANALYSIS.md) | Actors, views, use cases |
| [DOMAIN_MODEL.md](DOMAIN_MODEL.md) | ER diagram, naming rules |
| [MIGRATION_STATES.md](MIGRATION_STATES.md) | System state per step |
| [TLS_ALGORITHMS.md](TLS_ALGORITHMS.md) | TLS profiles, curl flags |
| [CLI_GUIDE.md](CLI_GUIDE.md) | CLI reference |
| [GRAPH_VERSIONING.md](GRAPH_VERSIONING.md) | Event sourcing, HEAD |
| [DEMO_REPORT_FOR.md](DEMO_REPORT_FOR.md) | Professor demo report |
| [LIVE_SERVICE.md](LIVE_SERVICE.md) | Live HTTPS architecture |
| [SERVER_DEPLOYMENT.md](SERVER_DEPLOYMENT.md) | University server setup |
| [migration_explanation.md](migration_explanation.md) | Oracle SCC behaviour |

## Project layout

```
cryme/                    CLI orchestrator
web_app/                  Oracle engine + optional web UI
deploy/                   Docker, Ansible, TLS verification
playbooks/                Generated Ansible migration playbooks
logs/                     Oracle step logs
webserver_pqc_twin.yaml   Active digital twin (webserver scenario)
```

## Memgraph GUI

```bash
ssh -L 3000:127.0.0.1:3000 -L 7687:127.0.0.1:7687 admin@ilmare
```

Open http://localhost:3000 → `bolt://localhost:7687` (no credentials).

## Push to GitHub

```bash
export GITHUB_TOKEN="ghp_..."
bash scripts/push_to_github.sh
```

## Troubleshooting

```bash
bash deploy/check_memgraph.sh
sudo docker-compose -f deploy/docker-compose.yml up -d
cryme init
```

See [GUIDE.md § Troubleshooting](GUIDE.md#12-troubleshooting) for more.
