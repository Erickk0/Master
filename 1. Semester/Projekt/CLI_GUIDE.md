# CRYME Command-Line Interface (CLI) Guide

This guide documents the terminal commands and execution patterns for the **CRYME PQC Migration Oracle CLI**.

---

## 1. Prerequisites

Before running the CLI tool:
1. Ensure the Memgraph database Docker container is running:
   ```bash
   docker start memgraph
   ```
2. Make sure you are in the project root directory:
   ```bash
   cd "1. Semester/Projekt"
   ```

---

## 2. Command Reference

### `cryme show node [id=<id_or_name>]`

Inspects cryptographic nodes in the digital twin. Without `id=`, prints all nodes; with `id=`, prints a single node.

* **Usage**:
  ```bash
  node cryme show node
  node cryme show node id=Webserver_Classic.KeyExchange_ECDHE
  ```
* **Output columns**:
  - **ID**: Memgraph internal ID (usable in `migrate id=…`)
  - **Type**: `CryptoAsset` or `SecurityControl`
  - **Component**, **Asset / Control Name**, **Status**, **Algorithm**

> `show system` is deprecated — use `show node`.

---

### `cryme show tree`

Displays the migration step history as an ASCII tree. The current successful step is marked with `(HEAD)` (like Git).

```bash
node cryme show tree
```

---

### `cryme show graph [step=<N>] [--before]`

Shows the dependency graph (nodes + edges) at a migration step as ASCII.

```bash
node cryme show graph              # graph at HEAD
node cryme show graph step=2       # graph after step 2
node cryme show graph step=2 --before   # graph before step 2
```

Migrated nodes changed in that step are marked with `*`.

---

### `cryme show step step=<N>`

Shows full details of a migration step (like `git show`): metadata, cluster, oracle logs, playbook path, and diff.

```bash
node cryme show step step=2
```

---

### `cryme show diff step=<N>`

Shows what changed in step N (like `git diff`): node status/algorithm before and after, discovered edges.

```bash
node cryme show diff step=2
```

---

### `cryme migrate`

Trigger a migration of one or more cryptographic assets or security controls.

**Mode A — one algorithm for all nodes (comma-separated IDs):**
```bash
node cryme migrate id=359,362 X25519_MLKEM768
node cryme migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768
```

**Mode B — per-node algorithm:**
```bash
node cryme migrate \
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
- A comment with the `ansible-playbook` command

### Logs (`logs/`)

`log_step_<N>.txt` — oracle output, success/failure status, timestamp.

---

## 4. Running Ansible Playbooks

After a successful migration, find the playbook path with:

```bash
node cryme show step step=2
```

Run the playbook (demo setup targets `localhost`):

```bash
ansible-playbook -i inventory/localhost playbooks/migrate_KeyExchange_ECDHE_to_X25519MLKEM768_step2.yml
```

The playbook deploys PQC key configuration to `/etc/pqc/keys_step_<N>.conf` and restarts the demo `pqc_crypto_daemon` service.

> For production, replace `hosts: localhost` and inventory with your real target hosts.

---

## 5. Graph Versioning

See [GRAPH_VERSIONING.md](GRAPH_VERSIONING.md) for the data model, HEAD pointer, event-sourcing replay, and best practices.
