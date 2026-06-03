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
   cd "/Users/erickzeiler/Desktop/Master/1. Semester/Projekt"
   ```

---

## 2. Command Reference

### `cryme show system`
Inspects the current cryptographic migration state of the entire digital twin, printing a structured overview table of all nodes.

* **Usage**:
  ```bash
  ./cryme show system
  ```
* **Output columns**:
  - **ID**: The internal database element ID (integer) or node ID (string) of the cryptographic asset or security control. You can use either of these as the `id=` parameter in migration commands.
  - **Type**: The type of the node (`CryptoAsset` or `SecurityControl`).
  - **Component**: The component boundary the asset belongs to (e.g. `Webserver_Classic`).
  - **Asset / Control Name**: Human-readable name of the cryptographic item.
  - **Status**: The migration status of the node (green `migrated` or red `classic`).
  - **Algorithm**: The currently active algorithm version (e.g. `ML-DSA-44`, `X25519_MLKEM768`, or `TLS1.3`).

---

### `cryme migrate id=<id_or_name> <target_algorithm>`
Trigger a dynamic migration of a specific cryptographic asset or security control.

* **Usage**:
  ```bash
  ./cryme migrate id=<db_id_or_string_id> <target_algorithm_or_variant_id>
  ```
* **Arguments**:
  - `id=<id_or_name>`: The database internal integer ID (e.g. `359`) or the full string name (e.g. `Webserver_Classic.KeyExchange_ECDHE`).
  - `<target_algorithm>`: The PQC algorithm (e.g. `X25519_MLKEM768`, `ML-DSA-44`) or protocol version (e.g. `TLS1.3`) you wish to deploy. For cryptographic assets, you can specify either the algorithm family name or the specific variant ID (e.g. `KeyExchange_ECDHE_mlkem768`).
* **Validation & Execution Sequence**:
  1. Resolves the target node in the graph database.
  2. Identifies if the target node belongs to a strongly connected component (SCC) cluster of dependent classic nodes.
  3. Simulates the parallel migration of the entire cluster, automatically matching compatible variants for all secondary classic nodes in the cluster.
  4. Queries the Oracle verification rules (temporal phase barriers, structural communicating paths, and variant family compatibilities).
  5. **If Oracle Validates (Success)**:
     - Mutates status to `migrated` and registers the active algorithm for all nodes in the cluster in the database.
     - Dynamically generates an Ansible playbook and saves it to `playbooks/step_<step_num>_migration.yml`.
     - Logs the success sequence in `logs/log_step_<step_num>.txt`.
     - Inserts a successful `MigrationStep` node in Memgraph, mapping the log file path and the co-migrated cluster IDs.
  6. **If Oracle Blocks (Failure / Policy Denied)**:
     - Reverts proposed changes and preserves the database state.
     - If it was a structural TLS path failure, automatically registers the newly discovered implicit dependency in Memgraph.
     - Logs the failure sequence and errors in `logs/log_step_<step_num>.txt`.
     - Inserts a failed/aborted `MigrationStep` node in Memgraph, mapping the log file path.
     - Exits with a non-zero exit code (`1`).

* **Examples**:
  ```bash
  # Attempting to migrate server key exchange (will fail and discover implicit link to browser)
  ./cryme migrate id=359 X25519_MLKEM768
  
  # Co-migrating browser and server key exchange cluster (will succeed)
  ./cryme migrate id=359 X25519_MLKEM768
  
  # Migrating webserver security control to TLS 1.3
  ./cryme migrate id=355 TLS1.3
  ```

---

## 3. Repositories Output Artifacts

* **Playbooks Directory**: `playbooks/`
  - Playbooks are saved as `step_<step_num>_migration.yml`.
  - Mapped variables (`migrated_nodes`) in the playbook list the exact database IDs/names of all nodes migrated during that transaction.
* **Logs Directory**: `logs/`
  - Logs are saved as `log_step_<step_num>.txt`.
  - Logs capture the execution status (success, structural failure, aborted by policy), the exact list of migrated nodes, and the line-by-line output of the Oracle checks.
