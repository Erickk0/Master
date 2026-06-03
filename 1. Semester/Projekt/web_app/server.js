const express = require('express');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');

const {
  driver,
  YAML_PATH,
  computeSCCs,
  computeTransitiveReduction,
  loadStateFromDB,
  checkOracleValidation,
  generatePlaybookContent,
  savePlaybookAndLog
} = require('./oracle');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Active simulation state (read-cache of database state)
let simState = {
  initialized: false,
  step_counter: 0,
  is_completed: false,
  history: [],
  S_nodes: new Set(),
  E_known: new Set(),
  nodes: new Set(),
  E_explicit: new Set(),
  E_implicit: new Set(),
  component_phases: {},
  asset_variants: {},
  active_variants: {}
};

// ============================================================================
// API Endpoints
// ============================================================================

// Helper to populate Memgraph with elements from Digital Twin
async function populateMemgraphWithTwin(session, twin) {
  // A. Create Components, SecurityControls, CryptoAssets, and Variants
  for (const comp of twin.components) {
    const compId = comp.component_id;
    const phase = comp.phase || 0;

    await session.run(
      "CREATE (c:Component {id: $id, name: $name, type: $type, phase: $phase})",
      { id: compId, name: comp.name, type: comp.type, phase: phase }
    );

    for (const ctrl of comp.security_controls || []) {
      const ctrlId = `${compId}.${ctrl.control_name.replace(/ /g, '_')}`;
      await session.run(`
        MATCH (c:Component {id: $compId})
        CREATE (ctrl:SecurityControl {id: $ctrlId, name: $name, status: 'classic'})
        CREATE (c)-[:HAS_CONTROL]->(ctrl)
      `, { compId, ctrlId, name: ctrl.control_name });
    }

    for (const asset of comp.cryptographic_assets || []) {
      const assetId = `${compId}.${asset.asset_id}`;
      await session.run(`
        MATCH (c:Component {id: $compId})
        CREATE (a:CryptoAsset {id: $assetId, type: $type, algorithm: $algo, status: 'classic'})
        CREATE (c)-[:HAS_ASSET]->(a)
      `, { compId, assetId, type: asset.asset_type, algo: asset.algorithm || "" });

      for (const v of asset.migration_variants || []) {
        const varId = `${assetId}.${v.variant_id}`;
        await session.run(`
          MATCH (a:CryptoAsset {id: $assetId})
          CREATE (var:PQCVariant {id: $varId, algorithm: $algo, security_level: $level, key_size: $size, performance: $perf})
          CREATE (a)-[:HAS_VARIANT]->(var)
        `, { assetId, varId, algo: v.algorithm, level: v.security_level, size: v.key_size_bytes, perf: v.performance });
      }
    }
  }

  // B. Create Intra-component explicit/implicit dependencies
  for (const comp of twin.components) {
    const compId = comp.component_id;

    for (const dep of comp.dependencies?.implicit || []) {
      const srcId = `${compId}.${dep.source.replace(/ /g, '_')}`;
      const tgtId = `${compId}.${dep.target}`;
      await session.run(`
        MATCH (src {id: $srcId})
        MATCH (tgt {id: $tgtId})
        CREATE (src)-[:IMPLICIT_DEPENDENCY {type: $type}]->(tgt)
      `, { srcId, tgtId, type: dep.type });
    }

    for (const dep of comp.dependencies?.explicit || []) {
      const srcId = `${compId}.${dep.source.replace(/ /g, '_')}`;
      const tgtId = `${compId}.${dep.target}`;
      await session.run(`
        MATCH (src {id: $srcId})
        MATCH (tgt {id: $tgtId})
        CREATE (src)-[:EXPLICIT_DEPENDENCY {type: $type}]->(tgt)
      `, { srcId, tgtId, type: dep.type });
    }

    // Create component not_before temporal constraints
    for (const nb of comp.not_before || []) {
      await session.run(`
        MATCH (c1:Component {id: $c1})
        MATCH (c2:Component {id: $c2})
        CREATE (c1)-[:TEMPORAL_CONSTRAINT {type: 'not_before'}]->(c2)
      `, { c1: compId, c2: nb });
    }
  }

  // C. Create Global/External dependencies (handling node creation for external elements dynamically)
  for (const gDep of twin.global_dependencies || []) {
    const nodes = gDep.nodes || [];
    if (nodes.length >= 2) {
      const u = nodes[0];
      const v = nodes[1];

      // Ensure nodes exist in database (e.g. Client_Browser nodes)
      for (const nid of nodes) {
        const name = nid.split('.').pop();
        await session.run(`
          MERGE (n {id: $nid})
          ON CREATE SET n:CryptoAsset, n.name = $name, n.status = 'classic'
        `, { nid, name });
      }

      await session.run(`
        MATCH (src {id: $u})
        MATCH (tgt {id: $v})
        CREATE (src)-[:GLOBAL_DEPENDENCY {id: $id, type: $type, description: $desc}]->(tgt)
        CREATE (tgt)-[:GLOBAL_DEPENDENCY {id: $id, type: $type, description: $desc}]->(src)
      `, { u, v, id: gDep.dependency_id, type: gDep.type, desc: gDep.description });
    }
  }
}

// 1. Initialize Scenario Node Structure in Memgraph Database
app.post('/api/init', async (req, res) => {
  const session = driver.session();
  try {
    console.log("[+] Initializing Webserver Scenario in Memgraph...");
    
    // Clear all existing entries in Memgraph
    await session.run("MATCH (n) DETACH DELETE n");

    // Read YAML file
    const doc = yaml.load(fs.readFileSync(YAML_PATH, 'utf8'));
    const twin = doc.digital_twin;

    // Populate
    await populateMemgraphWithTwin(session, twin);

    // Cache details to in-memory state machine, preserving active migration progress
    await reloadLocalStateFromDB(session, true);

    res.json({ success: true, message: "Database scenario fully imported into Memgraph!" });
  } catch (err) {
    console.error("[-] DB Init Error: ", err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    await session.close();
  }
});

// 1b. Fetch YAML Content to Editor
app.get('/api/yaml', (req, res) => {
  try {
    const content = fs.readFileSync(YAML_PATH, 'utf8');
    res.json({ success: true, yaml: content });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 1c. Update YAML Content & Re-sync Database
app.post('/api/yaml', async (req, res) => {
  const { yaml: newYaml } = req.body;
  if (!newYaml) {
    return res.status(400).json({ success: false, error: "YAML content is empty" });
  }

  let twin;
  try {
    const doc = yaml.load(newYaml);
    if (!doc || !doc.digital_twin) {
      throw new Error("Missing digital_twin root object.");
    }
    twin = doc.digital_twin;
  } catch (err) {
    return res.status(400).json({ success: false, error: `Invalid YAML structure: ${err.message}` });
  }

  const session = driver.session();
  try {
    // Write new configuration to file
    fs.writeFileSync(YAML_PATH, newYaml, 'utf8');
    console.log("[+] Digital Twin YAML configuration updated and saved!");

    // Clear all existing entries in Memgraph
    await session.run("MATCH (n) DETACH DELETE n");

    // Populate Memgraph with new configuration
    await populateMemgraphWithTwin(session, twin);

    // Rebuild cache, preserving active migration progress
    await reloadLocalStateFromDB(session, true);

    res.json({ success: true, message: "YAML saved and Memgraph database successfully re-synchronized!" });
  } catch (err) {
    console.error("[-] YAML Save & Sync Error: ", err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    await session.close();
  }
});

// Helper to rebuild cache state from DB query, with optional state preservation
async function reloadLocalStateFromDB(session, preserveState = false) {
  // Capture current migration variables if preserving state
  const savedSNodes = preserveState ? new Set(simState.S_nodes) : new Set();
  const savedActiveVariants = preserveState ? { ...simState.active_variants } : {};
  const savedHistory = preserveState ? [ ...simState.history ] : [];

  if (preserveState) {
    // A. Re-commit migrated node properties to database
    for (const node of savedSNodes) {
      let varSelected = savedActiveVariants[node];
      let algo = varSelected ? varSelected.algorithm : 'Post-Quantum';
      await session.run(`
        MATCH (n {id: $nodeId})
        SET n.status = 'migrated', n.active_algorithm = $algo
      `, { nodeId: node, algo: algo });
    }

    // B. Re-create MigrationStep nodes and transitions in Memgraph
    for (const h of savedHistory) {
      await session.run(`
        CREATE (s:MigrationStep {
          id: $id, 
          step: $step, 
          timestamp: timestamp(), 
          status: $status, 
          action: $action,
          cluster: $cluster, 
          logs: $logs, 
          ansible: $ansible, 
          variants: $variants, 
          discovered_edge: $discovered_edge, 
          log_file: $log_file
        })
      `, {
        id: `Step_${h.step}`,
        step: h.step,
        status: h.success ? 'success' : (h.action === 'aborted_by_policy' ? 'aborted' : 'failed'),
        action: h.action,
        cluster: h.cluster || [],
        logs: JSON.stringify(h.logs || []),
        ansible: h.ansible || "",
        variants: JSON.stringify(h.variants || {}),
        discovered_edge: h.discovered_edge || null,
        log_file: h.log_file || null
      });

      if (h.step > 1) {
        await session.run(`
          MATCH (s_prev:MigrationStep {step: $prev})
          MATCH (s_curr:MigrationStep {step: $curr})
          CREATE (s_prev)-[:TRANSITION_TO]->(s_curr)
        `, { prev: h.step - 1, curr: h.step });
      }
    }

    // C. Re-create discovered implicit dependency edges in Memgraph
    for (const h of savedHistory) {
      if (!h.success && h.discovered_edge) {
        const [u, v] = h.discovered_edge.split('->');
        await session.run(`
          MATCH (src {id: $u})
          MATCH (tgt {id: $v})
          CREATE (src)-[:IMPLICIT_DEPENDENCY {discovered: true, detected_at_step: $step}]->(tgt)
          CREATE (tgt)-[:IMPLICIT_DEPENDENCY {discovered: true, detected_at_step: $step}]->(src)
        `, { u, v, step: h.step });
      }
    }
  }

  // Load everything fresh from the database to build the correct in-memory state
  simState = await loadStateFromDB(session);
}

// 2. Fetch the Full Live State of the Graph
app.get('/api/graph', async (req, res) => {
  const session = driver.session();
  try {
    // Reload state from database live to keep sync with CLI tool
    simState = await loadStateFromDB(session);

    // Query actual nodes and their status properties from Memgraph
    const nodeRes = await session.run("MATCH (n) WHERE n:CryptoAsset OR n:SecurityControl RETURN n.id AS id, n.name AS name, n.status AS status, labels(n)[0] AS label, n.active_algorithm AS algo");
    const edgeRes = await session.run("MATCH (u)-[r]->(v) WHERE NOT type(r)='HAS_VARIANT' AND NOT type(r)='HAS_ASSET' AND NOT type(r)='HAS_CONTROL' AND NOT type(r)='TEMPORAL_CONSTRAINT' RETURN u.id AS src, v.id AS tgt, type(r) AS type, r.discovered AS disc");

    let nodes = nodeRes.records.map(rec => ({
      id: rec.get('id'),
      name: rec.get('name'),
      status: rec.get('status') || 'classic',
      type: rec.get('label'),
      algo: rec.get('algo') || ''
    }));

    let edges = edgeRes.records.map(rec => ({
      from: rec.get('src'),
      to: rec.get('tgt'),
      type: rec.get('type'),
      discovered: rec.get('disc') === true
    }));

    res.json({
      success: true,
      nodes,
      edges,
      step_counter: simState.step_counter,
      is_completed: simState.is_completed,
      history: simState.history,
      active_variants: simState.active_variants
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  } finally {
    await session.close();
  }
});

// 3. Reset Simulation Status in both DB and Cache
app.post('/api/reset', async (req, res) => {
  const session = driver.session();
  try {
    // A. Revert DB node states back to classic
    await session.run("MATCH (n) WHERE n:CryptoAsset OR n:SecurityControl SET n.status = 'classic' REMOVE n.migrated_at_step, n.active_algorithm");
    
    // B. Delete temporary discovered implicit edges
    await session.run("MATCH ()-[r:IMPLICIT_DEPENDENCY {discovered: true}]->() DELETE r");
    
    // C. Delete chronological step nodes
    await session.run("MATCH (s:MigrationStep) DETACH DELETE s");

    // D. Re-load cache variables
    await reloadLocalStateFromDB(session);

    res.json({ success: true, message: "Simulation successfully reset!" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  } finally {
    await session.close();
  }
});

// 3b. Revert/Undo the Last Simulation Step in both DB and Cache
app.post('/api/revert', async (req, res) => {
  const session = driver.session();
  try {
    // Sync state from database
    simState = await loadStateFromDB(session);

    if (simState.history.length === 0) {
      return res.status(400).json({ success: false, error: "No steps to revert." });
    }

    // Pop the latest step
    const revertedStep = simState.history[simState.history.length - 1];
    const stepNum = revertedStep.step;

    if (revertedStep.success) {
      // 1. Revert node statuses back to classic for this cluster
      for (const node of revertedStep.cluster) {
        await session.run(`
          MATCH (n {id: $nodeId})
          SET n.status = 'classic'
          REMOVE n.migrated_at_step, n.active_algorithm
        `, { nodeId: node });
      }

      // 2. Delete the MigrationStep node
      await session.run(`
        MATCH (s:MigrationStep {step: $step})
        DETACH DELETE s
      `, { step: stepNum });
    } else {
      // If it was a failure that discovered an implicit dependency, remove the dependency edge
      if (revertedStep.discovered_edge) {
        const [u, v] = revertedStep.discovered_edge.split('->');
        await session.run(`
          MATCH (src {id: $u})-[r:IMPLICIT_DEPENDENCY {discovered: true}]-(tgt {id: $v})
          DELETE r
        `, { u, v });
      }

      // Also delete the failed/aborted MigrationStep node
      await session.run(`
        MATCH (s:MigrationStep {step: $step})
        DETACH DELETE s
      `, { step: stepNum });
    }

    // Reload the fresh state from DB
    simState = await loadStateFromDB(session);

    res.json({
      success: true,
      message: `Successfully reverted Step ${stepNum}!`,
      reverted_step: revertedStep
    });
  } catch (err) {
    console.error("[-] Revert Step Error: ", err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    await session.close();
  }
});

// 4. Execute a Single Simulation Step & Mutate Memgraph Live
app.post('/api/step', async (req, res) => {
  const session = driver.session();
  try {
    // Reload state from database
    simState = await loadStateFromDB(session);

    if (simState.is_completed) {
      return res.json({ success: true, action: "complete", message: "Migration already completed!" });
    }

    // Fetch currently unvisited clusters (SCCs)
    let sccs = computeSCCs(Array.from(simState.nodes), Array.from(simState.E_known));
    let V_c = sccs.map(s => new Set(s));

    let unvisited = V_c.filter(C => {
      // Check if this cluster contains any node that has been migrated already
      let hasMigrated = false;
      C.forEach(node => { if (simState.S_nodes.has(node)) hasMigrated = true; });
      return !hasMigrated;
    });

    if (unvisited.length === 0) {
      await session.run("MATCH (s:MigrationStep) RETURN s"); // trivial query
      simState.is_completed = true;
      return res.json({ success: true, action: "complete", message: "PQC Migration fully completed!" });
    }

    simState.step_counter++;

    // Select a cluster Ci with no unvisited dependencies in known E_known
    let selectedCluster = null;
    for (const Ci of unvisited) {
      let hasDependency = false;
      for (const Cj of unvisited) {
        if (Ci !== Cj) {
          let hasEdge = false;
          Ci.forEach(u => {
            Cj.forEach(v => {
              if (simState.E_known.has(`${u}->${v}`)) hasEdge = true;
            });
          });
          if (hasEdge) {
            hasDependency = true;
            break;
          }
        }
      }
      if (!hasDependency) {
        selectedCluster = Ci;
        break;
      }
    }

    if (!selectedCluster) {
      throw new Error("Cyclic dependencies detected in condensation graph. Unresolvable deadlock.");
    }

    // Set variants chosen in frontend or select defaults
    let clientVariants = req.body.variants || {};
    let stepVariants = {};
    selectedCluster.forEach(node => {
      let vars = simState.asset_variants[node] || [];
      if (vars.length > 0) {
        if (clientVariants[node]) {
          stepVariants[node] = clientVariants[node];
        } else {
          stepVariants[node] = vars[0];
        }
      }
    });

    // Apply variants temporarily for Oracle test
    let previousVariants = { ...simState.active_variants };
    Object.assign(simState.active_variants, stepVariants);

    let proposedMigrated = new Set([...simState.S_nodes, ...selectedCluster]);

    // Run Oracle validation checks
    let valResult = checkOracleValidation(proposedMigrated, simState.active_variants, simState);
    let playbook = "";

    if (valResult.success) {
      // 1. Commit status changes to Memgraph database
      for (const node of selectedCluster) {
        let varSelected = simState.active_variants[node];
        let algo = varSelected ? varSelected.algorithm : 'Post-Quantum';
        await session.run(`
          MATCH (n {id: $nodeId})
          SET n.status = 'migrated', n.migrated_at_step = $step, n.active_algorithm = $algo
        `, { nodeId: node, step: simState.step_counter, algo: algo });
      }

      // Generate Ansible playbook
      playbook = generatePlaybookContent(selectedCluster, simState.step_counter, simState.active_variants);
      
      // Save playbook and log to repo
      const files = savePlaybookAndLog(simState.step_counter, true, "migrate_success", valResult.logs, playbook);

      // 2. Create MigrationStep node and Transition link in Memgraph
      await session.run(`
        CREATE (s:MigrationStep {
          id: $id, 
          step: $step, 
          timestamp: timestamp(), 
          status: 'success', 
          action: 'migrate_success',
          cluster: $cluster,
          logs: $logs,
          ansible: $ansible,
          variants: $variants,
          log_file: $log_file
        })
      `, { 
        id: `Step_${simState.step_counter}`, 
        step: simState.step_counter, 
        cluster: Array.from(selectedCluster),
        logs: JSON.stringify(valResult.logs),
        ansible: playbook,
        variants: JSON.stringify(stepVariants),
        log_file: files.logFile
      });

      if (simState.step_counter > 1) {
        await session.run(`
          MATCH (s_prev:MigrationStep {step: $prev})
          MATCH (s_curr:MigrationStep {step: $curr})
          CREATE (s_prev)-[:TRANSITION_TO]->(s_curr)
        `, { prev: simState.step_counter - 1, curr: simState.step_counter });
      }
    } else {
      // Rollback variants since step failed
      simState.active_variants = previousVariants;

      if (valResult.isStructural) {
        // Step A: Search for hidden implicit dependency
        let foundEdge = null;
        let V_minus_Ci = Array.from(simState.nodes).filter(n => !selectedCluster.has(n));
        let candidates = V_minus_Ci.filter(n => !simState.S_nodes.has(n));

        for (const u of selectedCluster) {
          for (const v of candidates) {
            // Check ground truth E_implicit
            if (simState.E_implicit.has(`${u}->${v}`) || simState.E_implicit.has(`${v}->${u}`)) {
              foundEdge = `${u}->${v}`;
              
              // Write newly discovered implicit link to Memgraph live
              await session.run(`
                MATCH (src {id: $u})
                MATCH (tgt {id: $v})
                CREATE (src)-[:IMPLICIT_DEPENDENCY {discovered: true, detected_at_step: $step}]->(tgt)
                CREATE (tgt)-[:IMPLICIT_DEPENDENCY {discovered: true, detected_at_step: $step}]->(src)
              `, { u, v, step: simState.step_counter });
              break;
            }
          }
          if (foundEdge) break;
        }

        // Save failed log to repo
        const files = savePlaybookAndLog(simState.step_counter, false, "migrate_fail", valResult.logs);

        // Create failed MigrationStep node in DB
        await session.run(`
          CREATE (s:MigrationStep {
            id: $id, 
            step: $step, 
            timestamp: timestamp(), 
            status: 'failed', 
            action: 'migrate_fail',
            cluster: $cluster,
            logs: $logs,
            discovered_edge: $discovered_edge,
            log_file: $log_file
          })
        `, {
          id: `Step_${simState.step_counter}`,
          step: simState.step_counter,
          cluster: Array.from(selectedCluster),
          logs: JSON.stringify(valResult.logs),
          discovered_edge: foundEdge,
          log_file: files.logFile
        });
      } else {
        // Temporal / Variant policy violation (rollback step counter)
        simState.step_counter--;
        
        // Save aborted log to repo
        const files = savePlaybookAndLog(simState.step_counter + 1, false, "aborted_by_policy", valResult.logs);

        // Create aborted MigrationStep node in DB
        await session.run(`
          CREATE (s:MigrationStep {
            id: $id, 
            step: $step, 
            timestamp: timestamp(), 
            status: 'aborted', 
            action: 'aborted_by_policy',
            cluster: $cluster,
            logs: $logs,
            log_file: $log_file
          })
        `, {
          id: `Step_${simState.step_counter + 1}`,
          step: simState.step_counter + 1,
          cluster: Array.from(selectedCluster),
          logs: JSON.stringify(valResult.logs),
          log_file: files.logFile
        });
      }
    }

    // Reload the fresh state from DB to sync cache
    simState = await loadStateFromDB(session);
    
    // Return the step entry that was just created in DB
    const stepEntry = simState.history[simState.history.length - 1];
    res.json(stepEntry);
  } catch (err) {
    console.error("[-] Step Execution Error: ", err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    await session.close();
  }
});

// 5. Download Compiled Playbook
app.get('/api/ansible/:step', (req, res) => {
  const stepNum = parseInt(req.params.step);
  const stepData = simState.history.find(h => h.step === stepNum && h.success);
  if (!stepData) {
    return res.status(404).send("Playbook not found for this successful step.");
  }
  res.setHeader('Content-disposition', `attachment; filename=step_${stepNum}_migration.yml`);
  res.setHeader('Content-type', 'text/yaml');
  res.write(stepData.ansible);
  res.end();
});

// Start Server
const PORT = 3050;
app.listen(PORT, () => {
  console.log(`\n================================================================`);
  console.log(`🛡️  CRYME Web Application running at http://localhost:${PORT}`);
  console.log(`🗄️  Connected to Memgraph Database on bolt://localhost:7687`);
  console.log(`================================================================\n`);
});
