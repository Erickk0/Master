import os
import yaml
import networkx as nx

class PQMigrationEngine:
    def __init__(self, yaml_path):
        self.yaml_path = yaml_path
        self.system_name = ""
        self.components = {}
        self.global_dependencies = []
        
        # Extended Model-Driven fields
        self.component_phases = {} # comp_id -> {'phase': int, 'not_before': [comp_ids]}
        self.asset_variants = {}    # node_name -> [list of variant dicts]
        
        # Load and parse the YAML digital twin file
        self.load_digital_twin()
        
        # Ground Truth dependencies (Explicit + Implicit/Hidden)
        self.nodes = set()
        self.E_explicit = set()  # Documented/Explicit edges
        self.E_implicit = set()  # Hidden/Implicit edges (e.g. shared keys, external dependencies)
        self.build_ground_truth_graph()
        
        # The algorithm state
        self.E = set(self.E_explicit)  # Current known graph edges
        
    def load_digital_twin(self):
        """Parses the YAML digital twin file."""
        if not os.path.exists(self.yaml_path):
            raise FileNotFoundError(f"Digital twin configuration file not found at {self.yaml_path}")
            
        with open(self.yaml_path, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f)
            
        twin = data.get('digital_twin', {})
        self.system_name = twin.get('system_name', 'Unnamed Scenario')
        
        # Load components
        for comp in twin.get('components', []):
            comp_id = comp['component_id']
            self.components[comp_id] = comp
            
            # Model-driven temporal phases
            self.component_phases[comp_id] = {
                'phase': comp.get('phase', 0),
                'not_before': comp.get('not_before', [])
            }
            
        # Load global dependencies
        self.global_dependencies = twin.get('global_dependencies', [])

    def build_ground_truth_graph(self):
        """Constructs the nodes and defines ground-truth explicit vs implicit dependencies."""
        # 1. Collect all nodes from components
        for comp_id, comp in self.components.items():
            # Add security controls as nodes
            for ctrl in comp.get('security_controls', []):
                ctrl_name = ctrl['control_name'].replace(' ', '_')
                node_name = f"{comp_id}.{ctrl_name}"
                self.nodes.add(node_name)
                
            # Add crypto assets as nodes
            for asset in comp.get('cryptographic_assets', []):
                node_name = f"{comp_id}.{asset['asset_id']}"
                self.nodes.add(node_name)
                
                # Store variants
                self.asset_variants[node_name] = asset.get('migration_variants', [])
                
        # 2. Add explicit intra-component dependencies defined in YAML
        for comp_id, comp in self.components.items():
            deps = comp.get('dependencies', {})
            # Explicit dependencies
            for dep in deps.get('explicit', []):
                src_name = dep['source'].replace(' ', '_')
                tgt_name = dep['target'].replace(' ', '_')
                src_node = f"{comp_id}.{src_name}"
                tgt_node = f"{comp_id}.{tgt_name}"
                self.E_explicit.add((src_node, tgt_node))
                
            # Documented implicit intra-component dependencies
            for dep in deps.get('implicit', []):
                src_name = dep['source'].replace(' ', '_')
                tgt_name = dep['target'].replace(' ', '_')
                src_node = f"{comp_id}.{src_name}"
                tgt_node = f"{comp_id}.{tgt_name}"
                
                # In our model, we consider documented implicit links as part of the initial E
                # so the algorithm starts with them, but we could also treat them as hidden.
                # To match the paper (Fig 3), they are documented in the CBOM/YAML, so they are in E_explicit.
                self.E_explicit.add((src_node, tgt_node))
                
        # 3. Process global/system-wide dependencies as the Ground Truth implicit dependencies
        for g_dep in self.global_dependencies:
            nodes_list = g_dep.get('nodes', [])
            if len(nodes_list) >= 2:
                # Add nodes to graph if they don't exist (e.g. Client_Browser nodes)
                for node in nodes_list:
                    self.nodes.add(node)
                    
                # Create dependencies between these nodes. Since they represent co-migration
                # constraints (e.g. shared symmetric keys or external TLS connections),
                # migrating one without the other breaks the system.
                # We model this ground-truth dependency as bidirectional edges in E_implicit.
                u = nodes_list[0]
                v = nodes_list[1]
                self.E_implicit.add((u, v))
                self.E_implicit.add((v, u))
                
    def get_ground_truth_graph(self):
        """Returns the full ground-truth NetworkX graph."""
        G = nx.DiGraph()
        G.add_nodes_from(self.nodes)
        G.add_edges_from(self.E_explicit)
        G.add_edges_from(self.E_implicit)
        return G

    def get_known_graph(self):
        """Returns the currently known graph representing our discovery process."""
        G = nx.DiGraph()
        G.add_nodes_from(self.nodes)
        G.add_edges_from(self.E)
        return G


class Oracle:
    def __init__(self, engine: PQMigrationEngine):
        self.engine = engine
        self.ground_truth_graph = engine.get_ground_truth_graph()
        
    def generate_ansible_playbook(self, cluster_nodes, step_num, active_variants=None):
        """Generates an Ansible YAML playbook representing the deployment script for this migration step."""
        playbook = {
            "name": f"PQC Migration Step {step_num}",
            "hosts": "localhost" if "Webserver" in self.engine.system_name else "in_vehicle_devices",
            "gather_facts": False,
            "vars": {
                "migrated_nodes": list(cluster_nodes)
            },
            "tasks": []
        }
        
        # Categorize nodes into security controls and cryptographic assets
        controls = []
        assets = []
        for node in cluster_nodes:
            if "." in node:
                comp, name = node.split(".", 1)
                if any(x in name for x in ["Boot", "Communication", "Access", "Manager", "Provider"]):
                    controls.append(node)
                else:
                    assets.append(node)
            else:
                assets.append(node)
                
        # Generate tasks based on components
        if assets:
            copy_content = "# PQC Migrated Keys and Algorithms\n"
            for node in assets:
                var = active_variants.get(node) if active_variants else None
                if var:
                    copy_content += f"# Node: {node} -> Algorithm: {var['algorithm']} (Security Level: {var['security_level']}, Key Size: {var['key_size_bytes']} bytes)\n"
                else:
                    copy_content += f"# Node: {node} -> Classic/Default PQC\n"
                    
            playbook["tasks"].append({
                "name": "Deploy Post-Quantum Cryptographic Assets & Keys",
                "ansible.builtin.copy": {
                    "content": copy_content,
                    "dest": f"/etc/pqc/keys_step_{step_num}.conf"
                }
            })
            
        if controls:
            playbook["tasks"].append({
                "name": "Configure and Enable PQC Security Controls",
                "ansible.builtin.template": {
                    "src": f"templates/security_controls.conf.j2",
                    "dest": f"/etc/pqc/controls_step_{step_num}.conf"
                }
            })
            playbook["tasks"].append({
                "name": "Restart Migrated Services & Modules",
                "ansible.builtin.systemd": {
                    "name": "pqc_crypto_daemon",
                    "state": "restarted"
                }
            })
            
        # Ensure directories exist
        os.makedirs("./deployments", exist_ok=True)
        file_path = f"./deployments/step_{step_num}_migration.yml"
        with open(file_path, "w", encoding="utf-8") as f:
            yaml.dump([playbook], f, default_flow_style=False, sort_keys=False)
            
        return file_path, yaml.dump([playbook], default_flow_style=False, sort_keys=False)

    def check_variant_compatibility(self, u, u_var, v, v_var):
        """Checks if chosen variant u_var for node u is compatible with v_var for node v."""
        if not u_var or not v_var:
            return True #handled by structural dependency checks
            
        u_algo = u_var.get('algorithm', '')
        v_algo = v_var.get('algorithm', '')
        
        # Compatibility rules:
        # 1. Symmetric keys (AES) must have matching algorithms
        if "AES" in u_algo and "AES" in v_algo:
            return u_algo == v_algo
            
        # 2. Public/Private keys (Dilithium/ML-DSA, Falcon, Kyber/ML-KEM)
        family_u = u_algo.split("-")[0].split("_")[0].lower()
        family_v = v_algo.split("-")[0].split("_")[0].lower()
        
        # Dilithium & ML-DSA family
        if ("dilithium" in family_u or "mldsa" in family_u) and ("dilithium" in family_v or "mldsa" in family_v):
            return True
            
        # Falcon family
        if ("falcon" in family_u) and ("falcon" in family_v):
            return True
            
        # Kyber & ML-KEM family
        if ("kyber" in family_u or "mlkem" in family_u) and ("kyber" in family_v or "mlkem" in family_v):
            return True
            
        return False

    def run_tests_and_validate(self, migrated_nodes, active_variants=None):
        """
        Simulates the runtime test and validation of the system state,
        including structural dependencies, temporal constraints, and variant compatibility.
        Returns (success: bool, logs: list of str).
        """
        logs = []
        logs.append(f"Starting runtime verification of deployed PQC state...")
        logs.append(f"Currently Migrated Nodes (W): {list(migrated_nodes)}")
        
        active_variants = active_variants or {}
        
        # 1. Model-Driven Temporal Constraint Check
        temporal_violations = []
        for node in migrated_nodes:
            if "." in node:
                comp_id = node.split(".")[0]
                comp_info = self.engine.component_phases.get(comp_id, {})
                not_before = comp_info.get('not_before', [])
                for nb_comp in not_before:
                    # Check if all assets in nb_comp are migrated
                    nb_assets = [n for n in self.engine.nodes if n.startswith(f"{nb_comp}.")]
                    unmigrated = [n for n in nb_assets if n not in migrated_nodes]
                    if unmigrated:
                        temporal_violations.append((node, nb_comp, unmigrated))
                        
        if temporal_violations:
            logs.append("[-] RUNTIME TEST FAILURE: Model-Driven Temporal Constraints violated!")
            for node, nb_comp, unmigrated in temporal_violations:
                logs.append(f"  [✗] Component '{node.split('.')[0]}' cannot migrate yet. It requires '{nb_comp}' to be migrated first, but the following are still Classic: {unmigrated}")
            logs.append("[-] Deployment verification failed. Oracle Result: FAILURE (✗)")
            return False, logs
            
        # 2. Structural Dependency Check
        structural_violations = []
        for u, v in self.ground_truth_graph.edges():
            if u in migrated_nodes and v not in migrated_nodes:
                structural_violations.append((u, v))
                
        if structural_violations:
            logs.append("[-] RUNTIME TEST FAILURE: Unmet structural dependencies detected!")
            for u, v in structural_violations:
                logs.append(f"  [✗] Node '{u}' is migrated to PQC, but its required dependency '{v}' is still Classic.")
            logs.append("[-] Deployment verification failed. Oracle Result: FAILURE (✗)")
            return False, logs
            
        # 3. Model-Driven Variant Compatibility Check
        variant_violations = []
        for u, v in self.ground_truth_graph.edges():
            if u in migrated_nodes and v in migrated_nodes:
                u_var = active_variants.get(u)
                v_var = active_variants.get(v)
                if u_var and v_var:
                    if not self.check_variant_compatibility(u, u_var, v, v_var):
                        variant_violations.append((u, u_var, v, v_var))
                        
        if variant_violations:
            logs.append("[-] RUNTIME TEST FAILURE: Cryptographic Variant Incompatibility detected!")
            for u, u_var, v, v_var in variant_violations:
                logs.append(f"  [✗] Algorithm Mismatch: Node '{u}' is migrated to '{u_var['algorithm']}', which is incompatible with '{v}' migrated to '{v_var['algorithm']}'.")
            logs.append("[-] Deployment verification failed. Oracle Result: FAILURE (✗)")
            return False, logs
            
        logs.append("[+] Service health check: ALL services successfully started and operational.")
        logs.append("[+] Cryptographic handshake verification: SUCCESS.")
        logs.append("[+] Oracle Result: SUCCESS (✓)")
        return True, logs


class TestFunction:
    def __init__(self, engine: PQMigrationEngine):
        self.engine = engine
        
    def evaluate(self, u, v):
        """
        Simulates the static dependency test function P(u, v).
        Returns 1 if an implicit/hidden relationship exists between u and v, 0 otherwise.
        """
        if (u, v) in self.engine.E_implicit or (v, u) in self.engine.E_implicit:
            return 1
        return 0


def transitive_reduction(G):
    """Computes the transitive reduction of a directed graph G using NetworkX."""
    return nx.transitive_reduction(G)


class MigrationSimulator:
    def __init__(self, yaml_path):
        self.yaml_path = yaml_path
        self.engine = PQMigrationEngine(yaml_path)
        self.oracle = Oracle(self.engine)
        self.test_function = TestFunction(self.engine)
        self.reset()
        
    def reset(self):
        # Current known graph edge set E
        self.engine.E = set(self.engine.E_explicit)
        
        # Step 0: Transitively reduce E
        self.reduce_edges()
        
        # Step 1 & 2: Strongly connected components and condensation
        self.recompute_condensation()
        
        # Visited cluster tracking
        self.visited = {C: False for C in self.V_c}
        
        # Migrated nodes sequence
        self.S_nodes = set()  # set of successfully migrated nodes
        self.migration_sequence = []  # list of successfully migrated clusters
        
        # Model-Driven Variant State
        self.active_variants = {} # node_name -> selected_variant dict
        
        # Step-by-step History & Chronological Time Graph
        self.history = []
        self.step_counter = 0
        self.is_completed = False
        self.time_graph = nx.DiGraph() # step_idx -> step_idx showing sequence
        
    def reduce_edges(self):
        """Applies transitive reduction on self.engine.E."""
        G = nx.DiGraph()
        G.add_nodes_from(self.engine.nodes)
        G.add_edges_from(self.engine.E)
        G_reduced = nx.transitive_reduction(G)
        self.engine.E = set(G_reduced.edges())
        
    def recompute_condensation(self):
        """Computes SCCs and condensation graph E_c of the current self.engine.E."""
        G = nx.DiGraph()
        G.add_nodes_from(self.engine.nodes)
        G.add_edges_from(self.engine.E)
        
        # Step 1: SCCs
        scc_list = list(nx.strongly_connected_components(G))
        self.V_c = [frozenset(scc) for scc in scc_list]
        
        # Step 2: Condensation graph
        self.E_c = set()
        for i, Ci in enumerate(self.V_c):
            for j, Cj in enumerate(self.V_c):
                if i != j:
                    has_edge = False
                    for u in Ci:
                        for v in Cj:
                            if G.has_edge(u, v):
                                has_edge = True
                                break
                        if has_edge:
                            break
                    if has_edge:
                        self.E_c.add((Ci, Cj))
                        
        self.reduce_condensation()
        
    def reduce_condensation(self):
        """Applies transitive reduction to the condensed graph E_c."""
        if not self.E_c:
            return
        
        idx_to_cluster = {i: C for i, C in enumerate(self.V_c)}
        cluster_to_idx = {C: i for i, C in enumerate(self.V_c)}
        
        G_cond = nx.DiGraph()
        G_cond.add_nodes_from(range(len(self.V_c)))
        for u_c, v_c in self.E_c:
            G_cond.add_edge(cluster_to_idx[u_c], cluster_to_idx[v_c])
            
        G_reduced = nx.transitive_reduction(G_cond)
        
        self.E_c = set()
        for u, v in G_reduced.edges():
            self.E_c.add((idx_to_cluster[u], idx_to_cluster[v]))
            
    def step(self, selected_variants=None):
        """
        Executes a single step of the migration algorithm.
        Supports manual or automatic algorithm variant selection.
        Returns a status dictionary.
        """
        if self.is_completed:
            return {"action": "complete", "message": "Migration strategy is fully complete and valid."}
            
        unvisited_clusters = [C for C in self.V_c if not self.visited.get(C, False)]
        if not unvisited_clusters:
            self.is_completed = True
            return {"action": "complete", "message": "Migration strategy successfully completed!"}
            
        self.step_counter += 1
        
        # Select an unvisited cluster Ci such that there is no unvisited Cj with (Ci, Cj) in E_c
        selected_cluster = None
        for Ci in unvisited_clusters:
            has_unvisited_dependency = False
            for Cj in unvisited_clusters:
                if Cj != Ci and (Ci, Cj) in self.E_c:
                    has_unvisited_dependency = True
                    break
            if not has_unvisited_dependency:
                selected_cluster = Ci
                break
                
        if selected_cluster is None:
            raise ValueError("No valid cluster could be selected for migration (cycle detected in condensation graph).")
            
        # 1. Apply selected variants or choose default variants
        selected_variants = selected_variants or {}
        step_variants = {}
        for node in selected_cluster:
            # Check if this node has defined variants
            variants_list = self.engine.asset_variants.get(node, [])
            if variants_list:
                # If a user explicitly selected a variant
                if node in selected_variants:
                    step_variants[node] = selected_variants[node]
                else:
                    # Default: pick first variant
                    step_variants[node] = variants_list[0]
            else:
                step_variants[node] = None
                
        # Update simulation engine's active variants temporarily for Oracle run
        original_variants = dict(self.active_variants)
        for node, var in step_variants.items():
            if var:
                self.active_variants[node] = var
                
        proposed_migrated = self.S_nodes.union(selected_cluster)
        
        # Generate Ansible playbook representing the script execution
        playbook_path, playbook_content = self.oracle.generate_ansible_playbook(
            selected_cluster, self.step_counter, self.active_variants
        )
        
        # Run dynamic runtime checks (Oracle)
        success, logs = self.oracle.run_tests_and_validate(proposed_migrated, self.active_variants)
        
        step_result = {
            "step": self.step_counter,
            "cluster": list(selected_cluster),
            "ansible_path": playbook_path,
            "ansible_content": playbook_content,
            "logs": logs,
            "success": success,
            "step_variants": step_variants,
            # Snapshot graphs and active variants for historical "Time Travel" restore
            "history_state": {
                "active_variants": dict(self.active_variants),
                "known_edges": set(self.engine.E),
                "V_c": list(self.V_c),
                "E_c": set(self.E_c),
                "visited": dict(self.visited),
                "S_nodes": set(self.S_nodes),
                "migration_sequence": list(self.migration_sequence)
            }
        }
        
        if success:
            self.visited[selected_cluster] = True
            self.S_nodes = proposed_migrated
            self.migration_sequence.append(list(selected_cluster))
            step_result["action"] = "migrate_success"
            
            # Update Chronological Time Dependency Graph
            # Each successful step connects to the previous step in time
            self.time_graph.add_node(self.step_counter, cluster=list(selected_cluster))
            if self.step_counter > 1:
                self.time_graph.add_edge(self.step_counter - 1, self.step_counter)
                
            self.reduce_condensation()
        else:
            # Rollback active variants on failure
            self.active_variants = original_variants
            
            # Check what kind of violation occurred.
            # If it's a temporal/variant violation, we do NOT search for hidden structural links.
            is_structural_fail = any("structural dependencies" in log.lower() for log in logs)
            
            if is_structural_fail:
                step_result["action"] = "migrate_fail"
                
                # Step A: Invisible dependency detection via P(u, v)
                found_dependency = False
                discovered_edge = None
                
                V_minus_Ci = set(self.engine.nodes) - selected_cluster
                candidates = V_minus_Ci - self.S_nodes
                
                for u in selected_cluster:
                    for v in candidates:
                        if self.test_function.evaluate(u, v) == 1:
                            self.engine.E.add((u, v))
                            self.engine.E.add((v, u))
                            discovered_edge = (u, v)
                            found_dependency = True
                            break
                    if found_dependency:
                        break
                        
                step_result["discovered_edge"] = discovered_edge
                
                # Step B & C & F: Recompute SCCs, condensation graph, and transitive reduction
                self.recompute_condensation()
                
                # Step E: Reset visited flags for all new clusters
                self.visited = {C: False for C in self.V_c}
            else:
                # Variant or temporal failure: No topological changes, just an aborted step
                step_result["action"] = "aborted_by_policy"
                self.step_counter -= 1 # Rollback step counter since it didn't commit a topological phase
                
        self.history.append(step_result)
        return step_result

    def restore_historical_state(self, step_idx):
        """Restores the simulator state to a specific historical step (1-indexed)."""
        if step_idx < 1 or step_idx > len(self.history):
            raise ValueError(f"Invalid historical step index: {step_idx}")
            
        step_data = self.history[step_idx - 1]
        state = step_data["history_state"]
        
        # Restore state variables
        self.active_variants = dict(state["active_variants"])
        self.engine.E = set(state["known_edges"])
        self.V_c = list(state["V_c"])
        self.E_c = set(state["E_c"])
        self.visited = dict(state["visited"])
        self.S_nodes = set(state["S_nodes"])
        self.migration_sequence = list(state["migration_sequence"])
        self.step_counter = step_data["step"]
        self.is_completed = False
        
        # Trim history and time graph to this step
        self.history = self.history[:step_idx]
        self.time_graph = nx.DiGraph()
        for idx in range(1, step_idx + 1):
            h_step = self.history[idx - 1]
            if h_step.get("success"):
                self.time_graph.add_node(idx, cluster=h_step["cluster"])
                if idx > 1:
                    self.time_graph.add_edge(idx - 1, idx)
