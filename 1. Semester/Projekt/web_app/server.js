const express = require('express');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const neo4j = require('neo4j-driver');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Memgraph connection parameters
const URI = "bolt://localhost:7687";
const driver = neo4j.driver(URI, neo4j.auth.basic("", ""));

// Paths
const YAML_PATH = path.join(__dirname, '../webserver_pqc_twin.yaml');

// Active simulation state (in-memory caching combined with database write-back)
let simState = {
  initialized: false,
  step_counter: 0,
  is_completed: false,
  history: [],
  S_nodes: new Set(),         // set of migrated node IDs
  E_known: new Set(),         // set of currently known edges "u->v"
  nodes: new Set(),           // set of all node IDs
  E_explicit: new Set(),      // structural ground truth edges
  E_implicit: new Set(),      // implicit / hidden ground truth edges
  component_phases: {},       // comp_id -> { phase, not_before: [] }
  asset_variants: {},         // node_id -> [variants]
  active_variants: {}         // node_id -> selected_variant
};

// ============================================================================
// Helper Graph Algorithms (Transitive Reduction, SCCs, Condensation)
// ============================================================================

function computeSCCs(nodes, edges) {
  // Tarjan's Strongly Connected Components algorithm
  let index = 0;
  let stack = [];
  let indices = {};
  let lowlink = {};
  let onStack = {};
  let sccs = [];

  let adj = {};
  nodes.forEach(n => adj[n] = []);
  edges.forEach(e => {
    let [u, v] = e.split('->');
    if (adj[u]) adj[u].push(v);
  });

  function strongConnect(v) {
    indices[v] = index;
    lowlink[v] = index;
    index++;
    stack.push(v);
    onStack[v] = true;

    (adj[v] || []).forEach(w => {
      if (indices[w] === undefined) {
        strongConnect(w);
        lowlink[v] = Math.min(lowlink[v], lowlink[w]);
      } else if (onStack[w]) {
        lowlink[v] = Math.min(lowlink[v], indices[w]);
      }
    });

    if (lowlink[v] === indices[v]) {
      let scc = [];
      let w;
      do {
        w = stack.pop();
        onStack[w] = false;
        scc.push(w);
      } while (w !== v);
      sccs.push(scc);
    }
  }

  nodes.forEach(v => {
    if (indices[v] === undefined) {
      strongConnect(v);
    }
  });

  return sccs;
}

function computeTransitiveReduction(nodes, edges) {
  // Floyd-Warshall reachability to find redundant direct edges
  let reach = {};
  nodes.forEach(u => {
    reach[u] = {};
    nodes.forEach(v => reach[u][v] = (u === v));
  });

  edges.forEach(e => {
    let [u, v] = e.split('->');
    reach[u][v] = true;
  });

  nodes.forEach(k => {
    nodes.forEach(i => {
      nodes.forEach(j => {
        if (reach[i][k] && reach[k][j]) {
          reach[i][j] = true;
        }
      });
    });
  });

  let reduced = new Set();
  edges.forEach(e => {
    let [u, v] = e.split('->');
    // Keep edge u->v only if there is no secondary path u -> w -> v where w != u,v
    let hasAlternativePath = false;
    nodes.forEach(w => {
      if (w !== u && w !== v && reach[u][w] && reach[w][v]) {
        hasAlternativePath = true;
      }
    });
    if (!hasAlternativePath) {
      reduced.add(e);
    }
  });

  return reduced;
}

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
  const savedStepCounter = preserveState ? simState.step_counter : 0;
  const savedIsCompleted = preserveState ? simState.is_completed : false;
  const savedHistory = preserveState ? [ ...simState.history ] : [];

  simState.nodes.clear();
  simState.E_explicit.clear();
  simState.E_implicit.clear();
  simState.component_phases = {};
  simState.asset_variants = {};

  // Load Component Phases and temporal dependencies
  const comps = await session.run("MATCH (c:Component) RETURN c.id AS id, c.phase AS phase");
  comps.records.forEach(rec => {
    const phaseVal = rec.get('phase');
    simState.component_phases[rec.get('id')] = {
      phase: (phaseVal && typeof phaseVal.toNumber === 'function') ? phaseVal.toNumber() : Number(phaseVal),
      not_before: []
    };
  });

  const tc = await session.run("MATCH (c1:Component)-[:TEMPORAL_CONSTRAINT]->(c2:Component) RETURN c1.id AS c1, c2.id AS c2");
  tc.records.forEach(rec => {
    const c1 = rec.get('c1');
    const c2 = rec.get('c2');
    if (simState.component_phases[c1]) {
      simState.component_phases[c1].not_before.push(c2);
    }
  });

  // Load all graph vertices (CryptoAssets, SecurityControls)
  const verts = await session.run("MATCH (n) WHERE n:CryptoAsset OR n:SecurityControl RETURN n.id AS id");
  verts.records.forEach(rec => {
    simState.nodes.add(rec.get('id'));
  });

  // Load explicit, implicit inside components
  const expEdges = await session.run("MATCH (u)-[:EXPLICIT_DEPENDENCY|IMPLICIT_DEPENDENCY]->(v) RETURN u.id AS src, v.id AS tgt");
  expEdges.records.forEach(rec => {
    const src = rec.get('src');
    const tgt = rec.get('tgt');
    simState.nodes.add(src);
    simState.nodes.add(tgt);
    simState.E_explicit.add(`${src}->${tgt}`);
  });

  // Load global dependencies (bidirectional E_implicit)
  const impEdges = await session.run("MATCH (u)-[:GLOBAL_DEPENDENCY]->(v) RETURN u.id AS src, v.id AS tgt");
  impEdges.records.forEach(rec => {
    const src = rec.get('src');
    const tgt = rec.get('tgt');
    simState.nodes.add(src);
    simState.nodes.add(tgt);
    simState.E_implicit.add(`${src}->${tgt}`);
    simState.E_implicit.add(`${tgt}->${src}`);
  });

  // Load variants
  const vars = await session.run(`
    MATCH (a:CryptoAsset)-[:HAS_VARIANT]->(v:PQCVariant) 
    RETURN a.id AS asset_id, v.id AS variant_id, v.algorithm AS algorithm, 
           v.security_level AS level, v.key_size AS size, v.performance AS perf
  `);
  vars.records.forEach(rec => {
    const assetId = rec.get('asset_id');
    const levelVal = rec.get('level');
    const sizeVal = rec.get('size');
    const vDict = {
      variant_id: rec.get('variant_id').split('.').pop(),
      algorithm: rec.get('algorithm'),
      security_level: (levelVal && typeof levelVal.toNumber === 'function') ? levelVal.toNumber() : Number(levelVal),
      key_size_bytes: (sizeVal && typeof sizeVal.toNumber === 'function') ? sizeVal.toNumber() : Number(sizeVal),
      performance: rec.get('perf')
    };
    if (!simState.asset_variants[assetId]) {
      simState.asset_variants[assetId] = [];
    }
    simState.asset_variants[assetId].push(vDict);
  });

  // Rebuild base E_known starting with transitively reduced explicit edges
  simState.E_known = computeTransitiveReduction(Array.from(simState.nodes), Array.from(simState.E_explicit));

  if (preserveState) {
    // Restore saved state variables
    simState.step_counter = savedStepCounter;
    simState.is_completed = savedIsCompleted;
    simState.history = savedHistory;

    // Filter and restore S_nodes and active_variants
    simState.S_nodes.clear();
    savedSNodes.forEach(node => {
      if (simState.nodes.has(node)) {
        simState.S_nodes.add(node);
      }
    });

    simState.active_variants = {};
    for (const [node, variant] of Object.entries(savedActiveVariants)) {
      if (simState.nodes.has(node)) {
        simState.active_variants[node] = variant;
      }
    }

    // A. Re-commit migrated node properties to database
    for (const node of simState.S_nodes) {
      let varSelected = simState.active_variants[node];
      let algo = varSelected ? varSelected.algorithm : 'Post-Quantum';
      await session.run(`
        MATCH (n {id: $nodeId})
        SET n.status = 'migrated', n.active_algorithm = $algo
      `, { nodeId: node, algo: algo });
    }

    // B. Re-create MigrationStep nodes and transitions in Memgraph
    for (const h of simState.history) {
      if (h.success) {
        const validCluster = h.cluster.filter(node => simState.nodes.has(node));
        if (validCluster.length > 0) {
          await session.run(`
            CREATE (s:MigrationStep {id: $id, step: $step, timestamp: timestamp(), status: 'success', cluster: $cluster})
          `, { id: `Step_${h.step}`, step: h.step, cluster: validCluster });
          if (h.step > 1) {
            await session.run(`
              MATCH (s_prev:MigrationStep {step: $prev})
              MATCH (s_curr:MigrationStep {step: $curr})
              CREATE (s_prev)-[:TRANSITION_TO]->(s_curr)
            `, { prev: h.step - 1, curr: h.step });
          }
        }
      }
    }

    // C. Re-create discovered implicit dependency edges in Memgraph
    for (const h of simState.history) {
      if (!h.success && h.discovered_edge) {
        const [u, v] = h.discovered_edge.split('->');
        if (simState.nodes.has(u) && simState.nodes.has(v)) {
          // Re-create edge in database
          await session.run(`
            MATCH (src {id: $u})
            MATCH (tgt {id: $v})
            CREATE (src)-[:IMPLICIT_DEPENDENCY {discovered: true, detected_at_step: $step}]->(tgt)
            CREATE (tgt)-[:IMPLICIT_DEPENDENCY {discovered: true, detected_at_step: $step}]->(src)
          `, { u, v, step: h.step });

          // Re-add to known edges
          simState.E_known.add(`${u}->${v}`);
          simState.E_known.add(`${v}->${u}`);
        }
      }
    }

    // Apply Transitive Reduction to final E_known
    simState.E_known = computeTransitiveReduction(Array.from(simState.nodes), Array.from(simState.E_known));
  } else {
    // Normal reset
    simState.step_counter = 0;
    simState.is_completed = false;
    simState.history = [];
    simState.S_nodes.clear();
    simState.active_variants = {};
  }

  simState.initialized = true;
}

// 2. Fetch the Full Live State of the Graph
app.get('/api/graph', async (req, res) => {
  if (!simState.initialized) {
    const session = driver.session();
    try {
      await reloadLocalStateFromDB(session);
    } catch (err) {
      return res.status(500).json({ success: false, error: "Database offline. Initialize it first." });
    } finally {
      await session.close();
    }
  }

  const session = driver.session();
  try {
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
  if (simState.history.length === 0) {
    return res.status(400).json({ success: false, error: "No steps to revert." });
  }

  const session = driver.session();
  try {
    // Pop the latest step
    const revertedStep = simState.history.pop();
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

        // Remove from known edges and recompute transitive reduction
        const edge1 = `${u}->${v}`;
        const edge2 = `${v}->${u}`;
        simState.E_known.delete(edge1);
        simState.E_known.delete(edge2);
      }
    }

    // Recalculate and transitively reduce E_known from ground truth explicit + newly discovered
    let remainingDiscovered = [];
    simState.history.forEach(h => {
      if (!h.success && h.discovered_edge) {
        remainingDiscovered.push(h.discovered_edge);
        const [u, v] = h.discovered_edge.split('->');
        remainingDiscovered.push(`${v}->${u}`);
      }
    });

    // Rebuild E_known from base explicit + remaining discovered edges
    simState.E_known = new Set(simState.E_explicit);
    remainingDiscovered.forEach(edge => simState.E_known.add(edge));
    simState.E_known = computeTransitiveReduction(Array.from(simState.nodes), Array.from(simState.E_known));

    // Decrement step counter
    simState.step_counter = Math.max(0, simState.step_counter - 1);
    
    if (simState.history.length > 0) {
      // Find the highest step number in remaining history
      const lastStep = simState.history[simState.history.length - 1];
      simState.step_counter = lastStep.step;
    } else {
      simState.step_counter = 0;
    }

    simState.is_completed = false;

    // Re-verify migrated set and variants from remaining history
    simState.S_nodes.clear();
    simState.active_variants = {};
    simState.history.forEach(h => {
      if (h.success) {
        h.cluster.forEach(n => simState.S_nodes.add(n));
        Object.assign(simState.active_variants, h.variants || {});
      }
    });

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

// Helper: Check Oracle Constraint Compatibility Rules
function checkOracleValidation(migratedSet, chosenVariants) {
  let logs = [];
  logs.push("Starting Web Application verification of PQC state...");
  logs.push(`Currently Migrated Nodes: [${Array.from(migratedSet).join(', ')}]`);

  // Rule A: Temporal Checks
  let temporalViolations = [];
  for (const node of migratedSet) {
    const compId = node.split('.')[0];
    const compInfo = simState.component_phases[compId];
    if (compInfo) {
      for (const nbComp of compInfo.not_before) {
        // Find if any asset inside nbComp is unmigrated
        const compAssets = Array.from(simState.nodes).filter(n => n.startsWith(`${nbComp}.`));
        const unmigrated = compAssets.filter(n => !migratedSet.has(n));
        if (unmigrated.length > 0) {
          temporalViolations.push({ node, nbComp, unmigrated });
        }
      }
    }
  }

  if (temporalViolations.length > 0) {
    logs.push("[-] RUNTIME VERIFICATION FAILURE: Model-Driven Temporal Constraints violated!");
    temporalViolations.forEach(v => {
      logs.push(`  [✗] Component '${v.node.split('.')[0]}' cannot migrate yet. It requires '${v.nbComp}' to be fully migrated, but following are still Classic: [${v.unmigrated.join(', ')}]`);
    });
    logs.push("[-] Verification failed. Oracle Result: FAILURE (✗)");
    return { success: false, isStructural: false, logs };
  }

  // Rule B: Structural Checks
  let structuralViolations = [];
  simState.E_implicit.forEach(edge => {
    let [u, v] = edge.split('->');
    if (migratedSet.has(u) && !migratedSet.has(v)) {
      structuralViolations.push({ u, v });
    }
  });

  if (structuralViolations.length > 0) {
    logs.push("[-] RUNTIME VERIFICATION FAILURE: Unmet structural dependencies detected!");
    structuralViolations.forEach(v => {
      logs.push(`  [✗] Key '${v.u}' is migrated to PQC, but its communicating endpoint '${v.v}' is still Classic.`);
    });
    logs.push("[-] Verification failed. Oracle Result: FAILURE (✗)");
    return { success: false, isStructural: true, logs };
  }

  // Rule C: Variant Compatibility Checks
  let variantViolations = [];
  simState.E_implicit.forEach(edge => {
    let [u, v] = edge.split('->');
    if (migratedSet.has(u) && migratedSet.has(v)) {
      let uVar = chosenVariants[u];
      let vVar = chosenVariants[v];
      if (uVar && vVar) {
        // Dilithium / ML-DSA compatibility check
        let uAlgo = uVar.algorithm.toLowerCase();
        let vAlgo = vVar.algorithm.toLowerCase();
        
        let familyU = uAlgo.split('-')[0].split('_')[0];
        let familyV = vAlgo.split('-')[0].split('_')[0];
        
        let isCompat = false;
        if ((familyU.includes("dilithium") || familyU.includes("mldsa")) && 
            (familyV.includes("dilithium") || familyV.includes("mldsa"))) {
          isCompat = true;
        } else if (familyU.includes("mlkem") && familyV.includes("mlkem")) {
          isCompat = true;
        } else if (familyU === familyV) {
          isCompat = true;
        }

        if (!isCompat) {
          variantViolations.push({ u, uAlgo, v, vAlgo });
        }
      }
    }
  });

  if (variantViolations.length > 0) {
    logs.push("[-] RUNTIME VERIFICATION FAILURE: Variant Incompatibility detected!");
    variantViolations.forEach(v => {
      logs.push(`  [✗] Node '${v.u}' is migrated to '${v.uAlgo}', which is incompatible with '${v.v}' migrated to '${v.vAlgo}'.`);
    });
    logs.push("[-] Verification failed. Oracle Result: FAILURE (✗)");
    return { success: false, isStructural: false, logs };
  }

  logs.push("[+] Service health check: TLS negotiability validated and successfully established.");
  logs.push("[+] Cryptographic handshake: SECURE.");
  logs.push("[+] Oracle Result: SUCCESS (✓)");
  return { success: true, isStructural: false, logs };
}

// Helper: Compile dynamically generated Ansible playbook
function generatePlaybookContent(cluster, stepNum, chosenVariants) {
  let play = {
    name: `PQC Migration Step ${stepNum}`,
    hosts: "localhost",
    gather_facts: false,
    vars: {
      migrated_nodes: Array.from(cluster)
    },
    tasks: []
  };

  let keysContent = "# PQC Migrated Keys and Algorithms\n";
  Array.from(cluster).forEach(node => {
    const varSelected = chosenVariants[node];
    if (varSelected) {
      keysContent += `# Node: ${node} -> Algorithm: ${varSelected.algorithm} (NIST Security Level: ${varSelected.security_level}, Key Size: ${varSelected.key_size_bytes} bytes, Performance: ${varSelected.performance.toUpperCase()})\n`;
    } else {
      keysContent += `# Node: ${node} -> Default PQC Config\n`;
    }
  });

  play.tasks.push({
    name: "Deploy Post-Quantum Cryptographic Assets & Keys",
    "ansible.builtin.copy": {
      content: keysContent,
      dest: `/etc/pqc/keys_step_${stepNum}.conf`
    }
  });

  play.tasks.push({
    name: "Restart Migrated Services & Modules",
    "ansible.builtin.systemd": {
      name: "pqc_crypto_daemon",
      state: "restarted"
    }
  });

  return yaml.dump([play], { noRefs: true, sortKeys: false });
}

// 4. Execute a Single Simulation Step & Mutate Memgraph Live
app.post('/api/step', async (req, res) => {
  if (simState.is_completed) {
    return res.json({ success: true, action: "complete", message: "Migration already completed!" });
  }

  const session = driver.session();
  try {
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
      simState.is_completed = true;
      return res.json({ success: true, action: "complete", message: "PQC Migration fully completed!" });
    }

    simState.step_counter++;

    // Select a cluster Ci with no unvisited dependencies in known E_known
    // (Meaning there's no edge from Ci to another unvisited Cj)
    let selectedCluster = null;
    for (const Ci of unvisited) {
      let hasDependency = false;
      for (const Cj of unvisited) {
        if (Ci !== Cj) {
          // Check if there is an edge from any u in Ci to any v in Cj
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
          stepVariants[node] = vars[0]; // pick default first variant
        }
      }
    });

    // Apply variants temporarily for Oracle test
    let previousVariants = { ...simState.active_variants };
    Object.assign(simState.active_variants, stepVariants);

    let proposedMigrated = new Set([...simState.S_nodes, ...selectedCluster]);

    // Run Oracle validation checks
    let valResult = checkOracleValidation(proposedMigrated, simState.active_variants);
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

      // 2. Create MigrationStep node and Transition link in Memgraph
      await session.run(`
        CREATE (s:MigrationStep {id: $id, step: $step, timestamp: timestamp(), status: 'success', cluster: $cluster})
      `, { id: `Step_${simState.step_counter}`, step: simState.step_counter, cluster: Array.from(selectedCluster) });

      if (simState.step_counter > 1) {
        await session.run(`
          MATCH (s_prev:MigrationStep {step: $prev})
          MATCH (s_curr:MigrationStep {step: $curr})
          CREATE (s_prev)-[:TRANSITION_TO]->(s_curr)
        `, { prev: simState.step_counter - 1, curr: simState.step_counter });
      }

      // Update in-memory state
      simState.S_nodes = proposedMigrated;
      playbook = generatePlaybookContent(selectedCluster, simState.step_counter, simState.active_variants);

      let stepEntry = {
        step: simState.step_counter,
        cluster: Array.from(selectedCluster),
        success: true,
        action: "migrate_success",
        logs: valResult.logs,
        ansible: playbook,
        variants: stepVariants
      };

      simState.history.push(stepEntry);
      res.json(stepEntry);
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

              // Update in-memory known graph
              simState.E_known.add(`${u}->${v}`);
              simState.E_known.add(`${v}->${u}`);
              break;
            }
          }
          if (foundEdge) break;
        }

        // Apply Transitive Reduction
        simState.E_known = computeTransitiveReduction(Array.from(simState.nodes), Array.from(simState.E_known));

        let stepEntry = {
          step: simState.step_counter,
          cluster: Array.from(selectedCluster),
          success: false,
          action: "migrate_fail",
          discovered_edge: foundEdge,
          logs: valResult.logs,
          ansible: "",
          variants: stepVariants
        };

        simState.history.push(stepEntry);
        res.json(stepEntry);
      } else {
        // Temporal / Variant policy violation (rollback step counter, no graph updates)
        simState.step_counter--;
        let stepEntry = {
          step: simState.step_counter + 1,
          cluster: Array.from(selectedCluster),
          success: false,
          action: "aborted_by_policy",
          logs: valResult.logs,
          ansible: "",
          variants: stepVariants
        };
        // Log in simulation history, but don't commit graph mutations
        simState.history.push(stepEntry);
        res.json(stepEntry);
      }
    }
  } catch (err) {
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
