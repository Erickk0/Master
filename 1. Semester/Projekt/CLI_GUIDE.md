# CRYME Command-Line Interface (CLI) Guide

> **See [GUIDE.md](GUIDE.md) § CLI Reference** for the full guide. This file is the CLI-only reference.

---

## 1. Prerequisites

Before running the CLI tool:
1. Run the server installer (Docker, Memgraph, nginx TLS stack, Ansible, Node.js):
   ```bash
   sudo bash deploy/install_prerequisites.sh
   source ~/.bashrc
   ```
   Uses university proxy `http://proxy.cs.hs-rm.de:8080` for apt, Docker pulls, and npm.
   The installer also runs `deploy/setup_shell.sh` so `cryme` works without the `node` prefix.
2. Make sure you are in the project root directory:
   ```bash
   cd ~/cryme
   ```
3. Initialize the graph:
   ```bash
   cryme init
   ```

Or set up the shell alias manually:

```bash
bash deploy/setup_shell.sh
source ~/.bashrc
```

---

## 2. Command Reference

### `cryme show node [id=<id_or_name>]`

Inspects cryptographic nodes in the digital twin. Without `id=`, prints all nodes; with `id=`, prints a single node.

* **Usage**:
  ```bash
  cryme show node
  cryme show node id=Webserver_Classic.KeyExchange_ECDHE
  ```
* **Output columns**:
  - **ID**: Memgraph internal ID (usable in `migrate id=…`)
  - **Type**: `CryptoAsset` or `SecurityControl`
  - **Component**, **Asset / Control Name**
  - **Status**: `classic` or `migrated` (migration lifecycle)
  - **Baseline**: Original algorithm from YAML (`algorithm` field)
  - **Active**: Currently deployed algorithm (`active_algorithm`; `-` if not yet migrated)

> `show system` is deprecated — use `show node`.

---

### `cryme show state [step=<N>] [--before]`

Shows the **system state** (Systemzustand) at migration step N or HEAD — the user-facing view of all nodes, algorithms, and edges. Equivalent to `show graph` with a domain-oriented label.

```bash
cryme show state              # state at HEAD
cryme show state step=2       # state after step 2
cryme show state step=2 --before   # state before step 2
```

Use this (not `show tree`) when you want to see *what the system looks like* at a point in time. See [MIGRATION_STATES.md](MIGRATION_STATES.md).

---

### `cryme show tree`

Displays the migration step history as an ASCII tree. The current successful step is marked with `(HEAD)` (like Git).

```bash
cryme show tree
```

---

### `cryme show graph [step=<N>] [--before]`

Shows the dependency graph (nodes + edges) at a migration step as ASCII. Lower-level view; prefer `show state` for the user-facing system snapshot.

```bash
cryme show graph              # graph at HEAD
cryme show graph step=2       # graph after step 2
cryme show graph step=2 --before   # graph before step 2
```

Migrated nodes changed in that step are marked with `*`.

---

### `cryme show step step=<N>`

Shows full details of a migration step (like `git show`): metadata, cluster, oracle logs, playbook path, and diff.

```bash
cryme show step step=2
```

---

### `cryme show diff step=<N>`

Shows what changed in step N (like `git diff`): node status/algorithm before and after, discovered edges.

```bash
cryme show diff step=2
```

---

### `cryme migrate`

Trigger a migration of one or more cryptographic assets or security controls.

**Mode A — one algorithm for all nodes (comma-separated IDs):**
```bash
cryme migrate id=359,362 X25519_MLKEM768
cryme migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768
```

**Mode B — per-node algorithm:**
```bash
cryme migrate \
  id=Webserver_Classic.KeyExchange_ECDHE:X25519_MLKEM768 \
  id=Client_Browser.KeyExchange_ECDHE:X25519_MLKEM768
```

* **Validation & Execution**:
  1. Resolves target node(s) in Memgraph.
  2. Unions SCC clusters for all specified nodes.
  3. Runs Oracle checks (temporal, structural, variant compatibility).
  4. On success: updates nodes, writes `MigrationStep` with deltas, sets HEAD, generates Ansible playbook.
  5. On failure: logs attempt, may discover implicit dependency edges.

---

### `cryme deploy step=<N>`

Deploys the **cumulative TLS state** at migration step N to the Docker nginx stack via Ansible (`cryme_tls` role). Only successful steps can be deployed.

```bash
cryme deploy step=2
cryme deploy step=6
```

Requires: Docker stack running (`deploy/docker-compose.yml`), Ansible installed.

---

### `cryme verify tls [step=<N>|baseline]`

Runs `deploy/verify_tls.sh` — prints protocol, cipher, and certificate from `openssl` / `curl` (host + `curl-client` container).

```bash
cryme verify tls baseline
cryme verify tls step=2
```

---

## 3. Output Artifacts

### Playbooks (`playbooks/`)

New playbooks use descriptive names:
```
migrate_<nodes>_to_<algo>_step<N>.yml
```

Example: `migrate_KeyExchange_ECDHE_to_X25519MLKEM768_step2.yml`

Legacy files (`step_N_migration.yml`) remain for older steps.

Each playbook includes:
- `vars.migration_step`, `vars.migrated_nodes`, `vars.target_algorithms`
- `include_role: cryme_tls` (updates nginx + curl-client on the server)
- A header comment with deploy commands

### Deploy vars (`deploy/vars/`)

`step_<N>.json` — generated by `cryme deploy step=N`, passed to Ansible as extra-vars.

### Logs (`logs/`)

`log_step_<N>.txt` — oracle output, success/failure status, timestamp.

---

## 4. Running Ansible / TLS Deploy

After a successful migration:

```bash
cryme deploy step=2
cryme verify tls step=2
```

Manual Ansible (equivalent):

```bash
ANSIBLE_CONFIG=deploy/ansible.cfg ansible-playbook \
  -i deploy/inventory/hosts.ini \
  deploy/playbooks/apply_tls.yml \
  -e @deploy/vars/step_2.json
```

Or run the migration playbook directly (with `ANSIBLE_CONFIG=deploy/ansible.cfg`):

```bash
ANSIBLE_CONFIG=deploy/ansible.cfg ansible-playbook \
  -i deploy/inventory/hosts.ini \
  playbooks/migrate_KeyExchange_ECDHE_to_X25519MLKEM768_step2.yml
```

The `cryme_tls` role updates nginx TLS config (`deploy/nginx/live/tls.conf`) and reloads the `cryme-nginx-classic` container.

> Environment: `CRYME_ANSIBLE_HOSTS` (default `webserver`), `CRYME_DEPLOY_ROOT` (default `deploy/`).

---

## 5. Graph Versioning

See [GRAPH_VERSIONING.md](GRAPH_VERSIONING.md) for the data model, HEAD pointer, event-sourcing replay, and best practices.

---

## 6. Domain Documentation

| File | Purpose |
|------|---------|
| [DOMAIN_ANALYSIS.md](DOMAIN_ANALYSIS.md) | Anwendungsdomäne, Akteure, Anwendungsfälle |
| [DOMAIN_MODEL.md](DOMAIN_MODEL.md) | ER-Diagramm, Begriffe, Namensregeln |
| [MIGRATION_STATES.md](MIGRATION_STATES.md) | Systemzustand-Zeichnungen pro Schritt |
| [TLS_ALGORITHMS.md](TLS_ALGORITHMS.md) | TLS-Profile, curl-Flags, beliebige Algorithmen |
