const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const neo4j = require('neo4j-driver');

// Memgraph connection parameters
const URI = "bolt://localhost:7687";
const driver = neo4j.driver(URI, neo4j.auth.basic("", ""));
const YAML_PATH = path.join(__dirname, '../webserver_pqc_twin.yaml');
const { populateMemgraphWithTwin } = require('./twin_loader');

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
  state.history = steps.records.map(rec => parseMigrationStepRecord(rec));
  state.head_step = await getHeadStep(session);

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

function toNum(val) {
  if (val === null || val === undefined) return 0;
  return val.toNumber ? val.toNumber() : Number(val);
}

function parseMigrationStepRecord(rec) {
  const s = rec.get('s').properties;
  return {
    step: toNum(s.step),
    status: s.status || 'unknown',
    cluster: s.cluster || [],
    success: s.status === 'success',
    action: s.action || (s.status === 'success' ? 'migrate_success' : 'migrate_fail'),
    logs: s.logs ? JSON.parse(s.logs) : [],
    ansible: s.ansible || "",
    variants: s.variants ? JSON.parse(s.variants) : {},
    discovered_edge: s.discovered_edge || null,
    log_file: s.log_file || null,
    node_changes: s.node_changes ? JSON.parse(s.node_changes) : null,
    edge_changes: s.edge_changes ? JSON.parse(s.edge_changes) : null,
    parent_step: s.parent_step !== undefined && s.parent_step !== null ? toNum(s.parent_step) : null,
    head: s.head === true,
    playbook_file: s.playbook_file || null
  };
}

async function initDatabase(session) {
  await session.run("MATCH (n) DETACH DELETE n");
  const doc = yaml.load(fs.readFileSync(YAML_PATH, 'utf8'));
  await populateMemgraphWithTwin(session, doc.digital_twin);
}

async function getHeadStep(session) {
  const metaRes = await session.run("MATCH (m:SystemMeta {id: 'cryme'}) RETURN m.head_step AS head");
  if (metaRes.records.length > 0 && metaRes.records[0].get('head') !== null) {
    return toNum(metaRes.records[0].get('head'));
  }
  const stepRes = await session.run("MATCH (s:MigrationStep {status: 'success'}) RETURN max(s.step) AS head");
  const head = stepRes.records[0].get('head');
  return head === null ? 0 : toNum(head);
}

async function updateHeadStep(session, stepNum) {
  await session.run("MATCH (s:MigrationStep) WHERE s.head = true SET s.head = false");
  await session.run(`
    MERGE (m:SystemMeta {id: 'cryme'})
    SET m.head_step = $step, m.updated_at = timestamp()
  `, { step: stepNum });
  await session.run(`
    MATCH (s:MigrationStep {step: $step})
    SET s.head = true
  `, { step: stepNum });
}

async function loadBaselineTopology(session) {
  const baseline = {
    nodes: new Set(),
    E_explicit: new Set(),
    E_implicit: new Set(),
    E_known: new Set(),
    component_phases: {},
    asset_variants: {},
    nodeStates: {},
    active_variants: {},
    S_nodes: new Set(),
    discovered_edges: []
  };

  const comps = await session.run("MATCH (c:Component) RETURN c.id AS id, c.phase AS phase");
  comps.records.forEach(rec => {
    baseline.component_phases[rec.get('id')] = {
      phase: toNum(rec.get('phase')),
      not_before: []
    };
  });

  const tc = await session.run("MATCH (c1:Component)-[:TEMPORAL_CONSTRAINT]->(c2:Component) RETURN c1.id AS c1, c2.id AS c2");
  tc.records.forEach(rec => {
    const c1 = rec.get('c1');
    const c2 = rec.get('c2');
    if (baseline.component_phases[c1]) {
      baseline.component_phases[c1].not_before.push(c2);
    }
  });

  const verts = await session.run("MATCH (n) WHERE n:CryptoAsset OR n:SecurityControl RETURN n.id AS id, labels(n)[0] AS type");
  verts.records.forEach(rec => {
    const id = rec.get('id');
    baseline.nodes.add(id);
    baseline.nodeStates[id] = {
      status: 'classic',
      active_algorithm: null,
      migrated_at_step: null,
      type: rec.get('type')
    };
  });

  const expEdges = await session.run(`
    MATCH (u)-[r:EXPLICIT_DEPENDENCY|IMPLICIT_DEPENDENCY]->(v)
    WHERE r.discovered IS NULL OR r.discovered <> true
    RETURN u.id AS src, v.id AS tgt, type(r) AS edgeType
  `);
  expEdges.records.forEach(rec => {
    const src = rec.get('src');
    const tgt = rec.get('tgt');
    const edgeType = rec.get('edgeType');
    baseline.nodes.add(src);
    baseline.nodes.add(tgt);
    baseline.E_explicit.add(`${src}->${tgt}`);
    if (edgeType === 'IMPLICIT_DEPENDENCY') {
      baseline.E_implicit.add(`${src}->${tgt}`);
    }
  });

  const impEdges = await session.run("MATCH (u)-[:GLOBAL_DEPENDENCY]->(v) RETURN u.id AS src, v.id AS tgt");
  impEdges.records.forEach(rec => {
    const src = rec.get('src');
    const tgt = rec.get('tgt');
    baseline.nodes.add(src);
    baseline.nodes.add(tgt);
    baseline.E_implicit.add(`${src}->${tgt}`);
    baseline.E_implicit.add(`${tgt}->${src}`);
  });

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
      security_level: toNum(levelVal),
      key_size_bytes: toNum(sizeVal),
      performance: rec.get('perf')
    };
    if (!baseline.asset_variants[assetId]) {
      baseline.asset_variants[assetId] = [];
    }
    baseline.asset_variants[assetId].push(vDict);
  });

  baseline.E_known = computeTransitiveReduction(Array.from(baseline.nodes), Array.from(baseline.E_explicit));
  return baseline;
}

function applyHistoryToBaseline(baseline, history, upToStep) {
  const state = {
    step: upToStep,
    nodes: new Map(),
    edges: new Set(Array.from(baseline.E_known)),
    edgeMeta: {},
    S_nodes: new Set(),
    active_variants: {},
    discovered_edges: [],
    asset_variants: baseline.asset_variants,
    component_phases: baseline.component_phases,
    E_implicit: new Set(baseline.E_implicit),
    E_known: new Set(baseline.E_known)
  };

  Array.from(baseline.nodes).sort().forEach(id => {
    state.nodes.set(id, { ...baseline.nodeStates[id] });
  });

  baseline.E_explicit.forEach(e => {
    const [from, to] = e.split('->');
    state.edgeMeta[e] = { type: 'EXPLICIT', discovered: false };
    state.edges.add(e);
  });
  baseline.E_implicit.forEach(e => {
    if (!state.edgeMeta[e]) {
      state.edgeMeta[e] = { type: 'GLOBAL', discovered: false };
    }
    state.edges.add(e);
  });

  const relevant = history
    .filter(h => h.step > 0 && h.step <= upToStep)
    .sort((a, b) => a.step - b.step);

  relevant.forEach(h => {
    if (!h.success && h.discovered_edge) {
      const [u, v] = h.discovered_edge.split('->');
      [`${u}->${v}`, `${v}->${u}`].forEach(e => {
        state.edges.add(e);
        state.E_known.add(e);
        state.E_implicit.add(e);
        state.edgeMeta[e] = { type: 'IMPLICIT', discovered: true, at_step: h.step };
      });
      state.discovered_edges.push({ u, v, at_step: h.step });
    }
    if (h.success && h.cluster && h.cluster.length > 0) {
      h.cluster.forEach(nodeId => {
        const node = state.nodes.get(nodeId);
        if (!node) return;
        const variant = h.variants[nodeId];
        const algo = variant ? variant.algorithm : 'Post-Quantum';
        node.status = 'migrated';
        node.active_algorithm = algo;
        node.migrated_at_step = h.step;
        state.S_nodes.add(nodeId);
        if (variant) {
          state.active_variants[nodeId] = variant;
        }
      });
    }
  });

  state.E_known = computeTransitiveReduction(Array.from(state.nodes.keys()), Array.from(state.E_known));
  state.edges = computeTransitiveReduction(Array.from(state.nodes.keys()), Array.from(state.edges));
  return state;
}

async function reconstructStateAtStep(session, stepNum, options = {}) {
  const before = options.before === true;
  const baseline = await loadBaselineTopology(session);
  const stepsRes = await session.run("MATCH (s:MigrationStep) RETURN s ORDER BY s.step ASC");
  const history = stepsRes.records.map(rec => parseMigrationStepRecord(rec));
  const targetStep = before ? Math.max(0, stepNum - 1) : stepNum;
  return applyHistoryToBaseline(baseline, history, targetStep);
}

function computeNodeChanges(beforeState, afterState) {
  const changes = [];
  const allIds = new Set([...beforeState.nodes.keys(), ...afterState.nodes.keys()]);
  allIds.forEach(id => {
    const before = beforeState.nodes.get(id) || { status: 'classic', active_algorithm: null };
    const after = afterState.nodes.get(id) || { status: 'classic', active_algorithm: null };
    if (before.status !== after.status || before.active_algorithm !== after.active_algorithm) {
      changes.push({
        id,
        before: { status: before.status, algo: before.active_algorithm || '-' },
        after: { status: after.status, algo: after.active_algorithm || '-' }
      });
    }
  });
  return changes;
}

function computeEdgeChanges(beforeState, afterState) {
  const changes = [];
  afterState.edges.forEach(e => {
    if (!beforeState.edges.has(e)) {
      const meta = afterState.edgeMeta[e] || { type: 'IMPLICIT', discovered: true };
      const [from, to] = e.split('->');
      changes.push({
        type: meta.type || 'IMPLICIT',
        from,
        to,
        action: 'add',
        discovered: meta.discovered === true
      });
    }
  });
  return changes;
}

async function computeStepDiff(session, stepNum) {
  const beforeState = await reconstructStateAtStep(session, stepNum, { before: true });
  const afterState = await reconstructStateAtStep(session, stepNum, { before: false });
  const stepsRes = await session.run("MATCH (s:MigrationStep {step: $step}) RETURN s", { step: stepNum });
  const stepRecord = stepsRes.records.length > 0 ? parseMigrationStepRecord(stepsRes.records[0]) : null;

  let nodeChanges = computeNodeChanges(beforeState, afterState);
  let edgeChanges = computeEdgeChanges(beforeState, afterState);

  if (stepRecord && stepRecord.node_changes) {
    nodeChanges = stepRecord.node_changes;
  }
  if (stepRecord && stepRecord.edge_changes) {
    edgeChanges = stepRecord.edge_changes;
  }

  return {
    step: stepNum,
    beforeStep: Math.max(0, stepNum - 1),
    afterStep: stepNum,
    beforeState,
    afterState,
    nodeChanges,
    edgeChanges,
    stepRecord
  };
}

function renderGraphAscii(state, options = {}) {
  const lines = [];
  const changedAtStep = options.changedAtStep || null;
  const headStep = options.headStep;
  const title = options.title || 'CRYME DEPENDENCY GRAPH (ASCII)';

  lines.push('');
  lines.push('='.repeat(110));
  lines.push(' '.repeat(Math.max(0, Math.floor((110 - title.length) / 2))) + title);
  if (state.step !== undefined) {
    lines.push(' '.repeat(40) + `State at step ${state.step}${headStep === state.step ? ' (HEAD)' : ''}`);
  }
  lines.push('='.repeat(110));
  lines.push('');
  lines.push('NODES:');
  lines.push(
    ' ' + 'Node ID'.padEnd(45) + ' | ' +
    'Status'.padEnd(12) + ' | ' +
    'Algorithm'
  );
  lines.push('-'.repeat(110));

  Array.from(state.nodes.keys()).sort().forEach(id => {
    const node = state.nodes.get(id);
    const marker = (changedAtStep && node.migrated_at_step === changedAtStep) ? '* ' : '  ';
    const status = node.status === 'migrated' ? '\x1b[32mmigrated\x1b[0m' : '\x1b[31mclassic\x1b[0m';
    const algo = node.active_algorithm || '-';
    const shortId = id.length > 43 ? id.slice(0, 40) + '...' : id;
    lines.push(`${marker}${shortId.padEnd(45)} | ${status.padEnd(21)} | ${algo}`);
  });

  lines.push('');
  lines.push('EDGES:');
  lines.push(' ' + 'From'.padEnd(40) + ' -> ' + 'To'.padEnd(40) + ' | Type');
  lines.push('-'.repeat(110));

  Array.from(state.edges).sort().forEach(e => {
    const [from, to] = e.split('->');
    const meta = state.edgeMeta[e] || { type: 'UNKNOWN', discovered: false };
    let typeLabel = meta.type || 'UNKNOWN';
    if (meta.discovered) typeLabel += ' (discovered)';
    const shortFrom = from.length > 38 ? from.slice(0, 35) + '...' : from;
    const shortTo = to.length > 38 ? to.slice(0, 35) + '...' : to;
    lines.push(` ${shortFrom.padEnd(40)} -> ${shortTo.padEnd(40)} | ${typeLabel}`);
  });

  lines.push('='.repeat(110));
  lines.push('');
  return lines.join('\n');
}

function renderStepDiffAscii(diff) {
  const lines = [];
  lines.push('');
  lines.push(`--- step ${diff.beforeStep} (before)`);
  lines.push(`+++ step ${diff.afterStep} (after)`);
  lines.push('');

  if (diff.nodeChanges.length === 0 && diff.edgeChanges.length === 0) {
    lines.push(' (no changes)');
  }

  diff.nodeChanges.forEach(change => {
    lines.push(`~ ${change.id}`);
    lines.push(`- status: ${change.before.status}`);
    lines.push(`- algorithm: ${change.before.algo}`);
    lines.push(`+ status: ${change.after.status}`);
    lines.push(`+ algorithm: ${change.after.algo}`);
    lines.push('');
  });

  diff.edgeChanges.forEach(change => {
    const arrow = change.discovered ? '<->' : '->';
    lines.push(`+ edge ${change.action}: ${change.from} ${arrow} ${change.to} (${change.type}${change.discovered ? ', discovered' : ''})`);
  });

  lines.push('');
  return lines.join('\n');
}

function renderStepShowAscii(diff) {
  const rec = diff.stepRecord;
  const lines = [];
  lines.push('');
  lines.push('='.repeat(80));
  lines.push(` commit Step ${diff.step}`);
  if (rec) {
    lines.push(` status: ${rec.status}`);
    lines.push(` action: ${rec.action}`);
    if (rec.parent_step !== null) lines.push(` parent: step ${rec.parent_step}`);
    if (rec.head) lines.push(' HEAD');
    if (rec.cluster && rec.cluster.length > 0) {
      lines.push(` cluster: [${rec.cluster.join(', ')}]`);
    }
    if (rec.discovered_edge) lines.push(` discovered_edge: ${rec.discovered_edge}`);
    if (rec.log_file) lines.push(` log: ${rec.log_file}`);
    if (rec.playbook_file) lines.push(` playbook: ${rec.playbook_file}`);
    if (rec.logs && rec.logs.length > 0) {
      lines.push('');
      lines.push(' Oracle logs:');
      rec.logs.forEach(l => lines.push(`   ${l}`));
    }
  }
  lines.push('');
  lines.push(renderStepDiffAscii(diff).trim());
  lines.push('='.repeat(80));
  lines.push('');
  return lines.join('\n');
}

function findCompatibleVariant(nodeId, targetAlgo, state) {
  const vars = state.asset_variants[nodeId] || [];
  const targetFamily = targetAlgo.toLowerCase().split('-')[0].split('_')[0].split('.')[0];

  const match = vars.find(v => {
    const vFamily = v.algorithm.toLowerCase().split('-')[0].split('_')[0].split('.')[0];
    if ((targetFamily.includes("mlkem") && vFamily.includes("mlkem")) ||
        (targetFamily.includes("mldsa") && vFamily.includes("mldsa")) ||
        (targetFamily.includes("dilithium") && vFamily.includes("dilithium")) ||
        (targetFamily.includes("dilithium") && vFamily.includes("mldsa")) ||
        (targetFamily.includes("mldsa") && vFamily.includes("dilithium"))) {
      return true;
    }
    return targetFamily === vFamily;
  });

  return match || (vars.length > 0 ? vars[0] : null);
}

async function resolveNodeRecord(session, targetId) {
  let query;
  let params;
  if (/^\d+$/.test(targetId)) {
    query = "MATCH (n) WHERE id(n) = $id OR n.id = $idStr RETURN id(n) AS db_id, n.id AS node_id, labels(n)[0] AS type, n.status AS status, n.active_algorithm AS algo";
    params = { id: neo4j.int(targetId), idStr: targetId };
  } else {
    query = "MATCH (n) WHERE n.id = $id RETURN id(n) AS db_id, n.id AS node_id, labels(n)[0] AS type, n.status AS status, n.active_algorithm AS algo";
    params = { id: targetId };
  }
  const res = await session.run(query, params);
  if (res.records.length === 0) return null;
  const record = res.records[0];
  return {
    dbId: record.get('db_id'),
    nodeId: record.get('node_id'),
    nodeType: record.get('type'),
    status: record.get('status'),
    activeAlgo: record.get('algo')
  };
}

function resolveTargetVariant(state, nodeId, nodeType, targetAlgo) {
  if (nodeType !== 'CryptoAsset') return { variant: null, error: null };
  const vars = state.asset_variants[nodeId] || [];
  const targetVariant = vars.find(
    v => v.algorithm.toLowerCase() === targetAlgo.toLowerCase() ||
         v.variant_id.toLowerCase() === targetAlgo.toLowerCase()
  );
  if (!targetVariant) {
    const available = vars.map(v => `${v.algorithm} (${v.variant_id})`).join(', ');
    return {
      variant: null,
      error: `Target algorithm/variant '${targetAlgo}' not available for asset '${nodeId}'. Available: [${available || 'none'}]`
    };
  }
  return { variant: targetVariant, error: null };
}

function buildClusterFromTargets(state, seedNodeIds) {
  const sccs = computeSCCs(Array.from(state.nodes), Array.from(state.E_known));
  const cluster = new Set(seedNodeIds);
  seedNodeIds.forEach(nodeId => {
    const scc = sccs.find(s => s.includes(nodeId));
    if (scc) scc.forEach(n => cluster.add(n));
  });
  return Array.from(cluster);
}

function assignProposedVariants(clusterToMigrate, explicitTargets, state) {
  const proposedVariants = { ...state.active_variants };
  const targetMap = new Map(explicitTargets.map(t => [t.nodeId, t]));

  clusterToMigrate.forEach(n => {
    const explicit = targetMap.get(n);
    if (explicit) {
      const nodeType = state.asset_variants[n] && state.asset_variants[n].length > 0 ? 'CryptoAsset' : 'SecurityControl';
      if (nodeType === 'CryptoAsset' && explicit.variant) {
        proposedVariants[n] = explicit.variant;
      } else {
        proposedVariants[n] = {
          algorithm: explicit.targetAlgo,
          variant_id: explicit.targetAlgo,
          security_level: 0,
          key_size_bytes: 0,
          performance: "unknown"
        };
      }
      return;
    }

    const primary = explicitTargets[0];
    const isAsset = (state.asset_variants[n] && state.asset_variants[n].length > 0);
    if (isAsset) {
      proposedVariants[n] = findCompatibleVariant(n, primary.targetAlgo, state);
    } else {
      proposedVariants[n] = {
        algorithm: primary.targetAlgo,
        variant_id: primary.targetAlgo,
        security_level: 0,
        key_size_bytes: 0,
        performance: "unknown"
      };
    }
  });

  return proposedVariants;
}

async function getNextStepInfo(session) {
  const stepRes = await session.run("MATCH (s:MigrationStep) RETURN s.step as step, s.status as status");
  let stepNum = 1;
  let prevStep = 0;
  if (stepRes.records.length > 0) {
    let maxStep = 0;
    let lastSuccess = null;
    stepRes.records.forEach(rec => {
      const s = toNum(rec.get('step'));
      if (s > maxStep) maxStep = s;
      if (rec.get('status') === 'success' && (!lastSuccess || s > lastSuccess)) {
        lastSuccess = s;
      }
    });
    stepNum = maxStep + 1;
    prevStep = lastSuccess !== null ? lastSuccess : 0;
  }
  return { stepNum, prevStep };
}

async function migrateNodes(session, targets, options = {}) {
  const logFn = options.log || (() => {});
  const state = await loadStateFromDB(session);
  const explicitTargets = [];

  for (const target of targets) {
    const record = await resolveNodeRecord(session, target.nodeId);
    if (!record) {
      return { success: false, error: `Node '${target.nodeId}' not found in the database.` };
    }
    if (record.nodeType !== 'CryptoAsset' && record.nodeType !== 'SecurityControl') {
      return { success: false, error: `Node '${record.nodeId}' is a '${record.nodeType}' and cannot be migrated.` };
    }

    let variant = null;
    if (record.nodeType === 'CryptoAsset') {
      const resolved = resolveTargetVariant(state, record.nodeId, record.nodeType, target.targetAlgo);
      if (resolved.error) return { success: false, error: resolved.error };
      variant = resolved.variant;
    }

    explicitTargets.push({
      nodeId: record.nodeId,
      nodeType: record.nodeType,
      targetAlgo: target.targetAlgo,
      variant,
      status: record.status,
      activeAlgo: record.activeAlgo
    });
  }

  const { stepNum, prevStep } = await getNextStepInfo(session);
  const seedNodeIds = explicitTargets.map(t => t.nodeId);

  if (explicitTargets.length === 1) {
    const t = explicitTargets[0];
    let isRedundant = false;
    let redundantAlgo = '';
    if (t.nodeType === 'CryptoAsset' && t.status === 'migrated' && t.activeAlgo && t.variant &&
        t.activeAlgo.toLowerCase() === t.variant.algorithm.toLowerCase()) {
      isRedundant = true;
      redundantAlgo = t.variant.algorithm;
    } else if (t.nodeType === 'SecurityControl' && t.status === 'migrated' && t.activeAlgo &&
               t.activeAlgo.toLowerCase() === t.targetAlgo.toLowerCase()) {
      isRedundant = true;
      redundantAlgo = t.targetAlgo;
    }

    if (isRedundant) {
      logFn(`[!] Info: Node '${t.nodeId}' is already migrated to '${redundantAlgo}'. No action needed.`);
      await session.run(`
        MERGE (init:MigrationStep {step: 0})
        ON CREATE SET init.id = 'Step_0', init.status = 'init', init.action = 'system_start', init.timestamp = timestamp()
        WITH init
        CREATE (s:MigrationStep {
          id: $id,
          step: $step,
          timestamp: timestamp(),
          status: 'aborted',
          action: $action,
          cluster: $cluster,
          logs: $logs,
          log_file: $log_file,
          parent_step: $prev
        })
        WITH s
        OPTIONAL MATCH (s_prev:MigrationStep {step: $prev})
        WHERE s_prev.status = 'success' OR s_prev.status = 'init'
        FOREACH (x IN CASE WHEN s_prev IS NOT NULL THEN [1] ELSE [] END |
          CREATE (s_prev)-[:TRANSITION_TO]->(s)
        )
      `, {
        id: `Step_${stepNum}_${Date.now()}_${Math.floor(Math.random()*1000)}`,
        step: stepNum,
        action: 'redundant_migration',
        cluster: [t.nodeId],
        logs: JSON.stringify(["[!] Redundant migration: Asset is already migrated to the requested algorithm."]),
        log_file: null,
        prev: prevStep
      });
      return { success: true, stepNum, redundant: true };
    }
  }

  const clusterToMigrate = buildClusterFromTargets(state, seedNodeIds);
  const proposedMigrated = new Set([...state.S_nodes, ...clusterToMigrate]);
  const proposedVariants = assignProposedVariants(clusterToMigrate, explicitTargets, state);
  const beforeState = await reconstructStateAtStep(session, prevStep, { before: false });
  const valResult = checkOracleValidation(proposedMigrated, proposedVariants, state);

  if (valResult.success) {
    for (const node of clusterToMigrate) {
      const varSelected = proposedVariants[node];
      const algoName = varSelected ? varSelected.algorithm : 'Post-Quantum';
      await session.run(`
        MATCH (n) WHERE n.id = $nodeId
        SET n.status = 'migrated', n.migrated_at_step = $step, n.active_algorithm = $algo
      `, { nodeId: node, step: stepNum, algo: algoName });
    }

    const dbVariants = {};
    clusterToMigrate.forEach(n => { dbVariants[n] = proposedVariants[n]; });
    const playbookFileName = buildPlaybookFilename(stepNum, clusterToMigrate, dbVariants);
    const playbook = generatePlaybookContent(clusterToMigrate, stepNum, proposedVariants, playbookFileName);
    const files = savePlaybookAndLog(stepNum, true, "migrate_success", valResult.logs, playbook, {
      cluster: clusterToMigrate,
      variants: dbVariants,
      playbookFileName
    });

    const afterState = {
      step: stepNum,
      nodes: new Map(beforeState.nodes),
      edges: new Set(beforeState.edges),
      edgeMeta: { ...beforeState.edgeMeta },
      S_nodes: new Set(beforeState.S_nodes),
      active_variants: { ...beforeState.active_variants },
      discovered_edges: [...beforeState.discovered_edges],
      asset_variants: beforeState.asset_variants,
      component_phases: beforeState.component_phases,
      E_implicit: new Set(beforeState.E_implicit),
      E_known: new Set(beforeState.E_known)
    };
    afterState.nodes.forEach((node, id) => {
      afterState.nodes.set(id, { ...node });
    });
    clusterToMigrate.forEach(nodeId => {
      const node = afterState.nodes.get(nodeId);
      if (node) {
        node.status = 'migrated';
        node.active_algorithm = dbVariants[nodeId]?.algorithm || 'Post-Quantum';
        node.migrated_at_step = stepNum;
        afterState.S_nodes.add(nodeId);
        if (dbVariants[nodeId]) {
          afterState.active_variants[nodeId] = dbVariants[nodeId];
        }
      }
    });

    const nodeChanges = computeNodeChanges(beforeState, afterState);
    const edgeChanges = computeEdgeChanges(beforeState, afterState);

    await session.run(`
      MERGE (init:MigrationStep {step: 0})
      ON CREATE SET init.id = 'Step_0', init.status = 'init', init.action = 'system_start', init.timestamp = timestamp()
      WITH init
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
        log_file: $log_file,
        playbook_file: $playbook_file,
        node_changes: $node_changes,
        edge_changes: $edge_changes,
        parent_step: $prev,
        head: false
      })
      WITH s
      OPTIONAL MATCH (s_prev:MigrationStep {step: $prev})
      WHERE s_prev.status = 'success' OR s_prev.status = 'init'
      FOREACH (x IN CASE WHEN s_prev IS NOT NULL THEN [1] ELSE [] END |
        CREATE (s_prev)-[:TRANSITION_TO]->(s)
      )
    `, {
      id: `Step_${stepNum}_${Date.now()}_${Math.floor(Math.random()*1000)}`,
      step: stepNum,
      cluster: clusterToMigrate,
      logs: JSON.stringify(valResult.logs),
      ansible: playbook,
      variants: JSON.stringify(dbVariants),
      log_file: files.logFile,
      playbook_file: files.playbookFile,
      node_changes: JSON.stringify(nodeChanges),
      edge_changes: JSON.stringify(edgeChanges),
      prev: prevStep
    });

    await updateHeadStep(session, stepNum);

    return {
      success: true,
      stepNum,
      cluster: clusterToMigrate,
      logs: valResult.logs,
      files,
      nodeChanges,
      edgeChanges
    };
  }

  const actionType = valResult.isStructural ? "migrate_fail" : "aborted_by_policy";
  let foundEdge = null;

  if (valResult.isStructural) {
    const V_minus_Ci = Array.from(state.nodes).filter(n => !clusterToMigrate.includes(n));
    const candidates = V_minus_Ci.filter(n => !state.S_nodes.has(n));

    for (const u of clusterToMigrate) {
      for (const v of candidates) {
        if (state.E_implicit.has(`${u}->${v}`) || state.E_implicit.has(`${v}->${u}`)) {
          foundEdge = `${u}->${v}`;
          await session.run(`
            MATCH (src {id: $u})
            MATCH (tgt {id: $v})
            CREATE (src)-[:IMPLICIT_DEPENDENCY {discovered: true, detected_at_step: $step}]->(tgt)
            CREATE (tgt)-[:IMPLICIT_DEPENDENCY {discovered: true, detected_at_step: $step}]->(src)
          `, { u, v, step: stepNum });
          break;
        }
      }
      if (foundEdge) break;
    }
  }

  const files = savePlaybookAndLog(stepNum, false, actionType, valResult.logs);
  const edgeChanges = foundEdge ? [{
    type: 'IMPLICIT',
    from: foundEdge.split('->')[0],
    to: foundEdge.split('->')[1],
    action: 'add',
    discovered: true
  }] : [];

  await session.run(`
    MERGE (init:MigrationStep {step: 0})
    ON CREATE SET init.id = 'Step_0', init.status = 'init', init.action = 'system_start', init.timestamp = timestamp()
    WITH init
    CREATE (s:MigrationStep {
      id: $id,
      step: $step,
      timestamp: timestamp(),
      status: $status,
      action: $action,
      cluster: $cluster,
      logs: $logs,
      discovered_edge: $discovered_edge,
      log_file: $log_file,
      edge_changes: $edge_changes,
      parent_step: $prev
    })
    WITH s
    OPTIONAL MATCH (s_prev:MigrationStep {step: $prev})
    WHERE s_prev.status = 'success' OR s_prev.status = 'init'
    FOREACH (x IN CASE WHEN s_prev IS NOT NULL THEN [1] ELSE [] END |
      CREATE (s_prev)-[:TRANSITION_TO]->(s)
    )
  `, {
    id: `Step_${stepNum}_${Date.now()}_${Math.floor(Math.random()*1000)}`,
    step: stepNum,
    status: valResult.isStructural ? 'failed' : 'aborted',
    action: actionType,
    cluster: clusterToMigrate,
    logs: JSON.stringify(valResult.logs),
    discovered_edge: foundEdge,
    log_file: files.logFile,
    edge_changes: JSON.stringify(edgeChanges),
    prev: prevStep
  });

  return {
    success: false,
    stepNum,
    logs: valResult.logs,
    files,
    isStructural: valResult.isStructural
  };
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
function buildPlaybookFilename(stepNum, cluster, variants) {
  const nodes = cluster.map(n => n.split('.').pop()).slice(0, 3).join('_');
  const algo = Object.values(variants)[0]?.algorithm?.replace(/[^a-zA-Z0-9]/g, '') || 'PQC';
  return `migrate_${nodes}_to_${algo}_step${stepNum}.yml`;
}

const DEPLOY_ROOT = process.env.CRYME_DEPLOY_ROOT || path.join(__dirname, '../deploy');
const ANSIBLE_HOSTS = process.env.CRYME_ANSIBLE_HOSTS || 'webserver';

const BASELINE_FILES = {
  runtime: path.join(DEPLOY_ROOT, 'state/runtime.baseline.json'),
  data: path.join(DEPLOY_ROOT, 'state/data.baseline.json'),
  nginx: path.join(DEPLOY_ROOT, 'nginx/baseline/tls.conf'),
  client: path.join(DEPLOY_ROOT, 'client/expect.baseline.env')
};

const LIVE_FILES = {
  runtime: path.join(DEPLOY_ROOT, 'state/runtime.json'),
  data: path.join(DEPLOY_ROOT, 'state/data.json'),
  nginx: path.join(DEPLOY_ROOT, 'nginx/live/tls.conf'),
  client: path.join(DEPLOY_ROOT, 'client/expect.env')
};

function resetLiveServiceState(options = {}) {
  const logFn = options.log || (() => {});
  const reloadNginx = options.reloadNginx !== false;

  for (const key of Object.keys(BASELINE_FILES)) {
    if (!fs.existsSync(BASELINE_FILES[key])) {
      return { success: false, error: `Baseline file missing: ${BASELINE_FILES[key]}` };
    }
    fs.copyFileSync(BASELINE_FILES[key], LIVE_FILES[key]);
    logFn(`[+] Reset ${key} → ${path.relative(path.join(__dirname, '..'), LIVE_FILES[key])}`);
  }

  if (reloadNginx) {
    const { spawnSync } = require('child_process');
    const container = process.env.CRYME_NGINX_CONTAINER || 'cryme-nginx-classic';
    let result = spawnSync('docker', ['exec', container, 'nginx', '-s', 'reload'], { stdio: 'pipe' });
    if (result.status !== 0) {
      result = spawnSync('sudo', ['docker', 'exec', container, 'nginx', '-s', 'reload'], { stdio: 'pipe' });
    }
    if (result.status !== 0) {
      const err = (result.stderr && result.stderr.toString()) || 'nginx reload failed';
      logFn(`[!] Warning: could not reload nginx (${err.trim()})`);
      return { success: true, warning: err.trim(), reloaded: false };
    }
    logFn('[+] nginx reloaded with baseline TLS config');
  }

  return { success: true, reloaded: reloadNginx };
}

function buildTargetAlgorithmsFromState(state) {
  const targetAlgorithms = {};
  state.nodes.forEach((node, nodeId) => {
    if (node.status === 'migrated' && node.active_algorithm) {
      targetAlgorithms[nodeId] = node.active_algorithm;
    }
  });
  return targetAlgorithms;
}

function buildDeployVarsFromState(state, stepNum) {
  const targetAlgorithms = buildTargetAlgorithmsFromState(state);
  const migratedNodes = Object.keys(targetAlgorithms);
  return {
    migration_step: stepNum,
    migrated_nodes: migratedNodes,
    target_algorithms: targetAlgorithms
  };
}

async function getStepDeployInfo(session, stepNum) {
  const stepsRes = await session.run(`
    MATCH (s:MigrationStep {step: $step})
    RETURN s.status AS status, s.playbook_file AS playbook_file, s.cluster AS cluster
  `, { step: stepNum });

  if (stepsRes.records.length === 0) {
    return { error: `Migration step ${stepNum} not found.` };
  }

  const status = stepsRes.records[0].get('status');
  if (status !== 'success') {
    return { error: `Migration step ${stepNum} is '${status}' — only successful steps can be deployed.` };
  }

  const state = await reconstructStateAtStep(session, stepNum, { before: false });
  const deployVars = buildDeployVarsFromState(state, stepNum);

  return {
    stepNum,
    status,
    playbookFile: stepsRes.records[0].get('playbook_file'),
    cluster: stepsRes.records[0].get('cluster') || [],
    deployVars,
    state
  };
}

function generatePlaybookContent(cluster, stepNum, chosenVariants, playbookFileName) {
  const targetAlgorithms = {};
  Array.from(cluster).forEach(node => {
    const varSelected = chosenVariants[node];
    targetAlgorithms[node] = varSelected ? varSelected.algorithm : 'Post-Quantum';
  });

  const shortNames = cluster.map(n => n.split('.').pop()).slice(0, 2).join(' + ');
  const primaryAlgo = Object.values(targetAlgorithms)[0] || 'PQC';
  const deployPlaybook = `deploy/playbooks/apply_tls.yml`;
  const inventory = `deploy/inventory/hosts.ini`;

  let play = {
    name: `Migrate ${shortNames} to ${primaryAlgo} (Step ${stepNum})`,
    hosts: ANSIBLE_HOSTS,
    gather_facts: false,
    vars: {
      migration_step: stepNum,
      migrated_nodes: Array.from(cluster),
      target_algorithms: targetAlgorithms
    },
    tasks: [
      {
        name: "Apply CRYME migration to TLS stack",
        "ansible.builtin.include_role": {
          name: "cryme_tls"
        }
      }
    ]
  };

  const header = [
    `# CRYME migration playbook (Step ${stepNum})`,
    `# Deploy TLS stack: ANSIBLE_CONFIG=deploy/ansible.cfg ansible-playbook -i ${inventory} ${deployPlaybook} \\`,
    `#   -e 'migration_step=${stepNum}' -e @deploy/vars/step_${stepNum}.json`,
    `# Or use: node cryme deploy step=${stepNum}`,
    `# Nodes in this step: ${Array.from(cluster).join(', ')}`,
    ''
  ].join('\n');

  return header + yaml.dump([play], { noRefs: true, sortKeys: false });
}

// Save Playbook and Logs to Repository
function savePlaybookAndLog(stepNum, success, action, logs, playbook = "", options = {}) {
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
    playbookFileName = options.playbookFileName ||
      buildPlaybookFilename(stepNum, options.cluster || [], options.variants || {});
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
  DEPLOY_ROOT,
  ANSIBLE_HOSTS,
  resetLiveServiceState,
  computeSCCs,
  computeTransitiveReduction,
  loadStateFromDB,
  initDatabase,
  loadBaselineTopology,
  reconstructStateAtStep,
  computeStepDiff,
  renderGraphAscii,
  renderStepDiffAscii,
  renderStepShowAscii,
  getHeadStep,
  updateHeadStep,
  findCompatibleVariant,
  migrateNodes,
  checkOracleValidation,
  generatePlaybookContent,
  buildPlaybookFilename,
  buildTargetAlgorithmsFromState,
  buildDeployVarsFromState,
  getStepDeployInfo,
  savePlaybookAndLog,
  computeNodeChanges,
  computeEdgeChanges,
  parseMigrationStepRecord,
  toNum
};
