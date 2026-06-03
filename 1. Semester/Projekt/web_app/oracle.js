const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const neo4j = require('neo4j-driver');

// Memgraph connection parameters
const URI = "bolt://localhost:7687";
const driver = neo4j.driver(URI, neo4j.auth.basic("", ""));
const YAML_PATH = path.join(__dirname, '../webserver_pqc_twin.yaml');

// Tarjan's Strongly Connected Components algorithm
function computeSCCs(nodes, edges) {
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

// Floyd-Warshall reachability to find redundant direct edges (transitive reduction)
function computeTransitiveReduction(nodes, edges) {
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

// Rebuild/fetch state directly from Memgraph DB
async function loadStateFromDB(session) {
  const state = {
    initialized: true,
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

  // 1. Load Component Phases and temporal dependencies
  const comps = await session.run("MATCH (c:Component) RETURN c.id AS id, c.phase AS phase");
  comps.records.forEach(rec => {
    const phaseVal = rec.get('phase');
    state.component_phases[rec.get('id')] = {
      phase: (phaseVal && typeof phaseVal.toNumber === 'function') ? phaseVal.toNumber() : Number(phaseVal),
      not_before: []
    };
  });

  const tc = await session.run("MATCH (c1:Component)-[:TEMPORAL_CONSTRAINT]->(c2:Component) RETURN c1.id AS c1, c2.id AS c2");
  tc.records.forEach(rec => {
    const c1 = rec.get('c1');
    const c2 = rec.get('c2');
    if (state.component_phases[c1]) {
      state.component_phases[c1].not_before.push(c2);
    }
  });

  // 2. Load all graph vertices (CryptoAssets, SecurityControls)
  const verts = await session.run("MATCH (n) WHERE n:CryptoAsset OR n:SecurityControl RETURN n.id AS id");
  verts.records.forEach(rec => {
    state.nodes.add(rec.get('id'));
  });

  // 3. Load explicit/implicit inside components (filtering out dynamically discovered ones)
  const expEdges = await session.run(`
    MATCH (u)-[r:EXPLICIT_DEPENDENCY|IMPLICIT_DEPENDENCY]->(v) 
    WHERE r.discovered IS NULL OR r.discovered <> true 
    RETURN u.id AS src, v.id AS tgt
  `);
  expEdges.records.forEach(rec => {
    const src = rec.get('src');
    const tgt = rec.get('tgt');
    state.nodes.add(src);
    state.nodes.add(tgt);
    state.E_explicit.add(`${src}->${tgt}`);
  });

  // 4. Load global dependencies (bidirectional E_implicit)
  const impEdges = await session.run("MATCH (u)-[:GLOBAL_DEPENDENCY]->(v) RETURN u.id AS src, v.id AS tgt");
  impEdges.records.forEach(rec => {
    const src = rec.get('src');
    const tgt = rec.get('tgt');
    state.nodes.add(src);
    state.nodes.add(tgt);
    state.E_implicit.add(`${src}->${tgt}`);
    state.E_implicit.add(`${tgt}->${src}`);
  });

  // 5. Load variants
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
    if (!state.asset_variants[assetId]) {
      state.asset_variants[assetId] = [];
    }
    state.asset_variants[assetId].push(vDict);
  });

  // 6. Rebuild base E_known starting with transitively reduced explicit edges
  state.E_known = computeTransitiveReduction(Array.from(state.nodes), Array.from(state.E_explicit));

  // 7. Load all MigrationStep nodes from database
  const steps = await session.run("MATCH (s:MigrationStep) RETURN s ORDER BY s.step ASC");
  state.history = steps.records.map(rec => {
    const s = rec.get('s').properties;
    return {
      step: s.step.toNumber ? s.step.toNumber() : Number(s.step),
      cluster: s.cluster || [],
      success: s.status === 'success',
      action: s.action || (s.status === 'success' ? 'migrate_success' : 'migrate_fail'),
      logs: s.logs ? JSON.parse(s.logs) : [],
      ansible: s.ansible || "",
      variants: s.variants ? JSON.parse(s.variants) : {},
      discovered_edge: s.discovered_edge || null,
      log_file: s.log_file || null
    };
  });

  // 8. Re-apply discovered implicit edges from history to E_known
  state.history.forEach(h => {
    if (!h.success && h.discovered_edge) {
      const [u, v] = h.discovered_edge.split('->');
      state.E_known.add(`${u}->${v}`);
      state.E_known.add(`${v}->${u}`);
    }
  });
  // Apply Transitive Reduction to final E_known
  state.E_known = computeTransitiveReduction(Array.from(state.nodes), Array.from(state.E_known));

  // 9. Load migrated nodes status & active algorithms
  const migrated = await session.run(`
    MATCH (n) 
    WHERE (n:CryptoAsset OR n:SecurityControl) AND n.status = 'migrated' 
    RETURN n.id AS id, n.active_algorithm AS algo
  `);
  migrated.records.forEach(rec => {
    const nid = rec.get('id');
    const algo = rec.get('algo');
    state.S_nodes.add(nid);

    const assetVars = state.asset_variants[nid] || [];
    const matchedVar = assetVars.find(v => v.algorithm === algo);
    if (matchedVar) {
      state.active_variants[nid] = matchedVar;
    } else {
      state.active_variants[nid] = {
        algorithm: algo,
        variant_id: algo,
        security_level: 0,
        key_size_bytes: 0,
        performance: "unknown"
      };
    }
  });

  // 10. Update step_counter and is_completed
  if (state.history.length > 0) {
    state.step_counter = Math.max(...state.history.map(h => h.step));
  } else {
    state.step_counter = 0;
  }

  // Calculate if migration is completed
  let sccs = computeSCCs(Array.from(state.nodes), Array.from(state.E_known));
  let V_c = sccs.map(s => new Set(s));
  let unvisited = V_c.filter(C => {
    let hasMigrated = false;
    C.forEach(node => { if (state.S_nodes.has(node)) hasMigrated = true; });
    return !hasMigrated;
  });
  state.is_completed = (unvisited.length === 0);

  return state;
}

// Oracle Validation Logic
function checkOracleValidation(migratedSet, chosenVariants, state) {
  let logs = [];
  logs.push("Starting verification of PQC state...");
  logs.push(`Currently Migrated Nodes: [${Array.from(migratedSet).join(', ')}]`);

  // Rule A: Temporal Checks
  let temporalViolations = [];
  for (const node of migratedSet) {
    const compId = node.split('.')[0];
    const compInfo = state.component_phases[compId];
    if (compInfo) {
      for (const nbComp of compInfo.not_before) {
        const compAssets = Array.from(state.nodes).filter(n => n.startsWith(`${nbComp}.`));
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
  state.E_implicit.forEach(edge => {
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
  state.E_implicit.forEach(edge => {
    let [u, v] = edge.split('->');
    if (migratedSet.has(u) && migratedSet.has(v)) {
      let uVar = chosenVariants[u];
      let vVar = chosenVariants[v];
      if (uVar && vVar) {
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

// Ansible Playbook Generator
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

// Save Playbook and Logs to Repository
function savePlaybookAndLog(stepNum, success, action, logs, playbook = "") {
  const logsDir = path.join(__dirname, '../logs');
  const playbooksDir = path.join(__dirname, '../playbooks');
  
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  if (!fs.existsSync(playbooksDir)) {
    fs.mkdirSync(playbooksDir, { recursive: true });
  }
  
  const logFileName = `log_step_${stepNum}.txt`;
  const logPath = path.join(logsDir, logFileName);
  const logContent = `Step: ${stepNum}
Success: ${success}
Action: ${action}
Timestamp: ${new Date().toISOString()}

Logs:
${logs.join('\n')}
`;
  fs.writeFileSync(logPath, logContent, 'utf8');
  
  let playbookFileName = "";
  if (success && playbook) {
    playbookFileName = `step_${stepNum}_migration.yml`;
    const playbookPath = path.join(playbooksDir, playbookFileName);
    fs.writeFileSync(playbookPath, playbook, 'utf8');
  }
  
  return {
    logFile: `logs/${logFileName}`,
    playbookFile: playbookFileName ? `playbooks/${playbookFileName}` : null
  };
}

module.exports = {
  driver,
  URI,
  YAML_PATH,
  computeSCCs,
  computeTransitiveReduction,
  loadStateFromDB,
  checkOracleValidation,
  generatePlaybookContent,
  savePlaybookAndLog
};
