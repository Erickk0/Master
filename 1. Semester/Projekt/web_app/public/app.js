// Vis.js Network instance
let network = null;
let graphData = { nodes: new vis.DataSet([]), edges: new vis.DataSet([]) };

// Track current simulation variables
let currentStep = 0;
let isCompleted = false;
let activeVariants = {};

let isFirstLoad = true;

// Helper algorithm variant dictionary mapped to node dropdown values
const variantsDictionary = {
  "Webserver_Classic.Cert_RSA2048": [
    { variant_id: "Cert_RSA2048_mldsa44", algorithm: "ML-DSA-44", security_level: 1, key_size_bytes: 1312, performance: "high" },
    { variant_id: "Cert_RSA2048_mldsa65", algorithm: "ML-DSA-65", security_level: 3, key_size_bytes: 1952, performance: "medium" }
  ],
  "Webserver_Classic.KeyExchange_ECDHE": [
    { variant_id: "KeyExchange_ECDHE_mlkem768", algorithm: "X25519_MLKEM768", security_level: 3, key_size_bytes: 1184, performance: "high" }
  ],
  "Webserver_PQC.Cert_ML_DSA": [
    { variant_id: "Cert_ML_DSA_mldsa65", algorithm: "ML-DSA-65", security_level: 3, key_size_bytes: 1952, performance: "medium" },
    { variant_id: "Cert_ML_DSA_falcon512", algorithm: "Falcon-512", security_level: 1, key_size_bytes: 897, performance: "medium" }
  ],
  "Webserver_PQC.KeyExchange_ML_KEM": [
    { variant_id: "KeyExchange_ML_KEM_mlkem1024", algorithm: "X25519_MLKEM1024", security_level: 5, key_size_bytes: 1568, performance: "medium" }
  ]
};

// ============================================================================
// Application Core Functions
// ============================================================================

window.addEventListener('DOMContentLoaded', () => {
  // Initialize Graph Network Canvas
  initNetwork();

  // Load initial graph data from Memgraph
  fetchGraphData();

  // Load initial digital twin YAML config
  loadYamlConfig();

  // Bind Buttons
  document.getElementById('btn-sync').addEventListener('click', syncDatabase);
  document.getElementById('btn-step').addEventListener('click', deployNextStep);
  document.getElementById('btn-revert').addEventListener('click', revertLastStep);
  document.getElementById('btn-reset').addEventListener('click', resetSimulation);
  document.getElementById('btn-download').addEventListener('click', downloadPlaybook);
  document.getElementById('btn-load-yaml').addEventListener('click', loadYamlConfig);
  document.getElementById('btn-save-yaml').addEventListener('click', saveYamlConfig);
  document.getElementById('btn-zoom-in').addEventListener('click', zoomIn);
  document.getElementById('btn-zoom-out').addEventListener('click', zoomOut);
  document.getElementById('btn-zoom-fit').addEventListener('click', zoomFit);
  document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);

  // Bind Drawer Toggles
  document.getElementById('btn-toggle-yaml').addEventListener('click', () => toggleDrawer('drawer-yaml'));
  document.getElementById('btn-toggle-playbook').addEventListener('click', () => toggleDrawer('drawer-ansible'));
  document.getElementById('btn-close-yaml').addEventListener('click', closeAllDrawers);
  document.getElementById('btn-close-ansible').addEventListener('click', closeAllDrawers);
  document.getElementById('drawer-overlay').addEventListener('click', closeAllDrawers);

  // Redraw graph dynamically on fullscreen transition
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
});

function handleFullscreenChange() {
  if (network) {
    setTimeout(() => {
      network.redraw();
      network.fit();
    }, 150);
  }
}

// Drawer Toggle Logic
function toggleDrawer(drawerId) {
  const drawer = document.getElementById(drawerId);
  if (drawer.classList.contains('open')) {
    closeAllDrawers();
  } else {
    openDrawer(drawerId);
  }
}

function openDrawer(drawerId) {
  closeAllDrawers();
  document.getElementById(drawerId).classList.add('open');
  document.getElementById('drawer-overlay').classList.add('open');
  
  if (drawerId === 'drawer-yaml') {
    document.getElementById('btn-toggle-yaml').classList.add('active');
  } else if (drawerId === 'drawer-ansible') {
    document.getElementById('btn-toggle-playbook').classList.add('active');
  }
}

function closeAllDrawers() {
  document.getElementById('drawer-yaml').classList.remove('open');
  document.getElementById('drawer-ansible').classList.remove('open');
  document.getElementById('drawer-overlay').classList.remove('open');
  document.getElementById('btn-toggle-yaml').classList.remove('active');
  document.getElementById('btn-toggle-playbook').classList.remove('active');
}

// Initialize Vis.js Physics-Driven Network Canvas
function initNetwork() {
  const container = document.getElementById('graph-network-canvas');
  
  const data = {
    nodes: graphData.nodes,
    edges: graphData.edges
  };
  
  const options = {
    nodes: {
      shape: 'box',
      shapeProperties: {
        borderRadius: 8
      },
      margin: { top: 10, bottom: 10, left: 14, right: 14 },
      font: {
        face: 'Share Tech Mono',
        color: '#FFFFFF',
        size: 12,
        bold: { color: '#FFFFFF', size: 12, face: 'Share Tech Mono' },
        ital: { color: 'hsl(140, 100%, 50%)', size: 9.5, face: 'Inter' }
      },
      borderWidth: 2,
      shadow: {
        enabled: true,
        color: 'rgba(0, 0, 0, 0.5)',
        size: 10,
        x: 0,
        y: 2
      }
    },
    edges: {
      arrows: 'to',
      font: {
        face: 'Share Tech Mono',
        color: '#8A9Aad',
        size: 9,
        strokeWidth: 0,
        align: 'middle'
      },
      color: {
        color: 'rgba(255, 255, 255, 0.12)',
        highlight: '#3498db',
        hover: '#3498db'
      },
      smooth: {
        type: 'cubicBezier',
        forceDirection: 'none',
        roundness: 0.4
      }
    },
    physics: {
      forceAtlas2Based: {
        gravitationalConstant: -70,
        centralGravity: 0.015,
        springLength: 120,
        springConstant: 0.08
      },
      solver: 'forceAtlas2Based',
      stabilization: { iterations: 150 }
    },
    interaction: {
      hover: true,
      tooltipDelay: 200
    }
  };
  
  network = new vis.Network(container, data, options);
}

// Fetch nodes, variants, and connections from Memgraph via Express APIs
async function fetchGraphData() {
  try {
    const res = await fetch('/api/graph');
    const data = await res.json();
    
    if (data.success) {
      updateConnectionStatus(true);
      renderGraph(data.nodes, data.edges, isFirstLoad);
      isFirstLoad = false;
      
      currentStep = data.step_counter;
      isCompleted = data.is_completed;
      activeVariants = data.active_variants;

      document.getElementById('lbl-step').innerText = currentStep;
      
      if (isCompleted) {
        document.getElementById('lbl-status').innerText = "Complete";
        document.getElementById('lbl-status').className = "stat-val success-text";
      } else if (currentStep > 0) {
        document.getElementById('lbl-status').innerText = "In Progress";
        document.getElementById('lbl-status').className = "stat-val info-text";
      } else {
        document.getElementById('lbl-status').innerText = "Classic";
        document.getElementById('lbl-status').className = "stat-val";
      }

      // Manage Revert Button Status
      const revertBtn = document.getElementById('btn-revert');
      if (currentStep > 0 && data.history.length > 0) {
        revertBtn.disabled = false;
      } else {
        revertBtn.disabled = true;
      }

      // Manage Download Playbook Button Status
      const downloadBtn = document.getElementById('btn-download');
      if (currentStep > 0 && data.history.length > 0) {
        const lastSuccess = data.history.filter(h => h.success).pop();
        if (lastSuccess) {
          downloadBtn.disabled = false;
          downloadBtn.setAttribute('data-step', lastSuccess.step);
          document.getElementById('playbook-code-viewer').innerText = lastSuccess.ansible;
        } else {
          downloadBtn.disabled = true;
          document.getElementById('playbook-code-viewer').innerText = "# Playbook will compile dynamically upon successful steps...";
        }
      } else {
        downloadBtn.disabled = true;
        document.getElementById('playbook-code-viewer').innerText = "# Playbook will compile dynamically upon successful steps...";
      }

    } else {
      updateConnectionStatus(false);
      logToConsole(`[-] Database connection failed: ${data.error}`, 'failure');
    }
  } catch (err) {
    updateConnectionStatus(false);
    logToConsole(`[-] Connection lost to server backend: ${err.message}`, 'failure');
  }
}

// Update DB offline/online styling badge
function updateConnectionStatus(isOnline) {
  const badge = document.getElementById('db-status-badge');
  const text = badge.querySelector('.status-text');
  
  if (isOnline) {
    badge.className = "db-badge online";
    text.innerText = "MEMGRAPH: ONLINE";
  } else {
    badge.className = "db-badge offline";
    text.innerText = "MEMGRAPH: OFFLINE";
  }
}

// Map database payloads to Vis.js DataSet parameters
function renderGraph(dbNodes, dbEdges, fitAfterRender = false) {
  const visNodes = [];
  const visEdges = [];
  
  dbNodes.forEach(n => {
    let shape = n.type === 'SecurityControl' ? 'ellipse' : 'box';
    
    // Choose beautiful emojis based on type
    let prefix = '🖥️';
    if (n.type === 'SecurityControl') prefix = '🛡️';
    else if (n.type === 'CryptoAsset') prefix = '🔑';
    
    let displayName = n.name || n.id.split('.').pop() || n.id;
    let label = `${prefix} <b>${displayName}</b>`;
    if (n.algo) {
      label += `\n<i>${n.algo}</i>`;
    }
    
    // Aesthetic Color Palette with real glowing neon drop shadows
    let backgroundColor = '';
    let borderColor = '';
    let shadowColor = '';
    
    if (n.status === 'migrated') {
      if (n.type === 'Component') {
        backgroundColor = 'rgba(16, 185, 129, 0.08)'; // Neon Emerald
        borderColor = 'hsl(140, 100%, 50%)';
        shadowColor = 'rgba(16, 185, 129, 0.5)';
      } else if (n.type === 'SecurityControl') {
        backgroundColor = 'rgba(6, 182, 212, 0.08)'; // Neon Cyan
        borderColor = 'hsl(190, 100%, 50%)';
        shadowColor = 'rgba(6, 182, 212, 0.5)';
      } else {
        backgroundColor = 'rgba(168, 85, 247, 0.1)'; // Neon Orchid/Purple
        borderColor = 'hsl(280, 100%, 70%)';
        shadowColor = 'rgba(168, 85, 247, 0.5)';
      }
    } else {
      // Classic states
      if (n.type === 'Component') {
        backgroundColor = 'rgba(245, 158, 11, 0.06)'; // Neon Amber
        borderColor = 'hsl(35, 100%, 55%)';
        shadowColor = 'rgba(245, 158, 11, 0.35)';
      } else if (n.type === 'SecurityControl') {
        backgroundColor = 'rgba(249, 115, 22, 0.06)'; // Neon Orange
        borderColor = 'hsl(24, 100%, 50%)';
        shadowColor = 'rgba(249, 115, 22, 0.35)';
      } else {
        backgroundColor = 'rgba(217, 119, 6, 0.06)'; // Golden Bronze
        borderColor = 'hsl(38, 100%, 45%)';
        shadowColor = 'rgba(217, 119, 6, 0.35)';
      }
    }
    
    visNodes.push({
      id: n.id,
      label: label,
      shape: shape,
      shapeProperties: {
        borderRadius: 8 // Nice rounded box look
      },
      color: {
        background: backgroundColor,
        border: borderColor,
        highlight: { background: backgroundColor, border: '#60a5fa' },
        hover: { background: backgroundColor, border: '#60a5fa' }
      },
      shadow: {
        enabled: true,
        color: shadowColor,
        size: 15,
        x: 0,
        y: 0
      },
      font: { multi: 'html' }
    });
  });
  
  dbEdges.forEach(e => {
    let edgeStyle = {
      color: 'rgba(255, 255, 255, 0.15)',
      width: 1.5,
      dashes: false
    };
    
    if (e.discovered) {
      edgeStyle.color = 'hsl(340, 100%, 55%)'; // Neon pink for discovered edges!
      edgeStyle.width = 2.2;
      edgeStyle.dashes = true;
    } else if (e.type === 'EXPLICIT_DEPENDENCY') {
      edgeStyle.color = 'hsla(200, 100%, 50%, 0.4)';
    } else {
      edgeStyle.color = 'hsla(220, 15%, 50%, 0.25)';
    }
    
    visEdges.push({
      from: e.from,
      to: e.to,
      label: e.discovered ? 'discovered' : e.type.replace('_DEPENDENCY', '').toLowerCase(),
      color: edgeStyle.color,
      width: edgeStyle.width,
      dashes: edgeStyle.dashes
    });
  });
  
  graphData.nodes.clear();
  graphData.nodes.add(visNodes);
  
  graphData.edges.clear();
  graphData.edges.add(visEdges);
  
  if (network && fitAfterRender) {
    network.fit();
  }
}

// 1. Trigger test.py import pipeline from UI button
async function syncDatabase() {
  const btn = document.getElementById('btn-sync');
  btn.disabled = true;
  btn.innerText = "Syncing...";
  
  logToConsole("[system] Syncing PQC scenario structure to Graph Database...", 'system');
  
  try {
    const res = await fetch('/api/init', { method: 'POST' });
    const data = await res.json();
    
    if (data.success) {
      logToConsole("[+] Database successfully synchronized and populated with Webserver scenario!", 'success');
      isFirstLoad = true;
      await fetchGraphData();
    } else {
      logToConsole(`[-] Sync Failed: ${data.error}`, 'failure');
    }
  } catch (err) {
    logToConsole(`[-] Connection failed: ${err.message}`, 'failure');
  } finally {
    btn.disabled = false;
    btn.innerText = "💾 Sync YAML to Memgraph";
  }
}

// 2. Perform sequence deploy check & database write back mutations
async function deployNextStep() {
  const btn = document.getElementById('btn-step');
  btn.disabled = true;
  
  logToConsole("[system] Requesting Oracle validation check for next migration step...", 'system');

  // Collect dropdown parameterized algorithm variants chosen by the user
  const stepVariants = {};
  for (const nodeId of Object.keys(variantsDictionary)) {
    const select = document.getElementById(`sel-${nodeId.split('.').pop()}`);
    if (select) {
      const selectedAlgo = select.value;
      const matchingVariant = variantsDictionary[nodeId].find(v => v.algorithm === selectedAlgo);
      if (matchingVariant) {
        stepVariants[nodeId] = matchingVariant;
      }
    }
  }

  try {
    const res = await fetch('/api/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variants: stepVariants })
    });
    const data = await res.json();
    
    if (data.action === "complete") {
      logToConsole(`[+] PQC Migration strategy fully complete and verified!`, 'success');
      fetchGraphData();
      return;
    }

    // Print logs inside terminal
    data.logs.forEach(log => {
      let type = 'system';
      if (log.includes('[+]')) type = 'success';
      else if (log.includes('[-]')) type = 'failure';
      else if (log.includes('[✗]')) type = 'failure';
      else if (log.includes('Classic')) type = 'policy';
      logToConsole(log, type);
    });

    // Handle outcome
    if (data.success) {
      logToConsole(`[+] Successfully committed Step ${data.step} directly into Memgraph live!`, 'success');
    } else {
      if (data.action === "migrate_fail") {
        logToConsole(`[-] Structural violation blocked step. Discovered implicit connection: ${data.discovered_edge}`, 'failure');
      } else {
        logToConsole(`[-] Policy Denied by Oracle: Deployment aborted and successfully rolled back.`, 'policy');
      }
    }

    // Reload active Vis.js topology
    await fetchGraphData();

  } catch (err) {
    logToConsole(`[-] Connection failed: ${err.message}`, 'failure');
  } finally {
    btn.disabled = false;
  }
}

// 3. Reset Simulation Mutator
async function resetSimulation() {
  if (!confirm("Are you sure you want to purge all active migration states inside Memgraph?")) {
    return;
  }
  
  logToConsole("[system] Resetting simulation. Clearing database mutation properties...", 'system');
  
  try {
    const res = await fetch('/api/reset', { method: 'POST' });
    const data = await res.json();
    
    if (data.success) {
      logToConsole("[+] Database successfully reset to baseline classic states!", 'success');
      document.getElementById('oracle-console').innerHTML = '<div class="console-line system">[info] Web Application initialized. Click "Deploy Next Step" to verify and mutate database status...</div>';
      isFirstLoad = true;
      await fetchGraphData();
    } else {
      logToConsole(`[-] Reset failed: ${data.error}`, 'failure');
    }
  } catch (err) {
    logToConsole(`[-] Connection failed: ${err.message}`, 'failure');
  }
}

// 4. Download Playbook
function downloadPlaybook() {
  const step = document.getElementById('btn-download').getAttribute('data-step');
  if (step) {
    window.location.href = `/api/ansible/${step}`;
  }
}

// Log writer helper for visual Terminal logs
function logToConsole(text, type = 'system') {
  const consoleContainer = document.getElementById('oracle-console');
  const line = document.createElement('div');
  line.className = `console-line ${type}`;
  line.innerText = text;
  consoleContainer.appendChild(line);
  consoleContainer.scrollTop = consoleContainer.scrollHeight;
}

// Fetch active YAML configuration and load inside textarea
async function loadYamlConfig() {
  const textarea = document.getElementById('yaml-textarea');
  textarea.disabled = true;
  textarea.placeholder = "Loading digital twin configuration...";
  
  try {
    const res = await fetch('/api/yaml');
    const data = await res.json();
    if (data.success) {
      textarea.value = data.yaml;
    } else {
      logToConsole(`[-] Failed to fetch YAML: ${data.error}`, 'failure');
    }
  } catch (err) {
    logToConsole(`[-] Connection failed loading YAML: ${err.message}`, 'failure');
  } finally {
    textarea.disabled = false;
  }
}

// Send modified YAML to backend, validate format and re-initialize database
async function saveYamlConfig() {
  const textarea = document.getElementById('yaml-textarea');
  const btn = document.getElementById('btn-save-yaml');
  const yamlContent = textarea.value;
  
  textarea.disabled = true;
  btn.disabled = true;
  const originalBtnText = btn.innerText;
  btn.innerText = "Saving & Syncing...";
  
  logToConsole("[system] Requesting YAML syntax validation & database synchronization...", 'system');
  
  try {
    const res = await fetch('/api/yaml', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yaml: yamlContent })
    });
    const data = await res.json();
    
    if (data.success) {
      logToConsole("[+] YAML Configuration saved successfully!", 'success');
      logToConsole("[+] Memgraph database successfully re-synchronized with new configuration!", 'success');
      isFirstLoad = true;
      // Reload the graph nodes
      await fetchGraphData();
    } else {
      logToConsole(`[-] YAML Sync Failed: ${data.error}`, 'failure');
      alert(`YAML Sync Failed:\n${data.error}`);
    }
  } catch (err) {
    logToConsole(`[-] Connection failed saving YAML: ${err.message}`, 'failure');
  } finally {
    textarea.disabled = false;
    btn.disabled = false;
    btn.innerText = originalBtnText;
  }
}

// Revert/Undo the last simulation step
async function revertLastStep() {
  const btn = document.getElementById('btn-revert');
  btn.disabled = true;
  
  logToConsole("[system] Requesting Oracle step revert operation...", 'system');
  
  try {
    const res = await fetch('/api/revert', { method: 'POST' });
    const data = await res.json();
    
    if (data.success) {
      logToConsole(`[+] ${data.message}`, 'success');
      if (data.reverted_step.success) {
        logToConsole(`[+] Restored cluster nodes back to Classic in Memgraph: [${data.reverted_step.cluster.map(n => n.split('.').pop()).join(', ')}]`, 'success');
      } else if (data.reverted_step.discovered_edge) {
        logToConsole(`[+] Removed temporary discovered dependency edge from Memgraph: ${data.reverted_step.discovered_edge}`, 'success');
      }
      
      // Reload graph and state
      await fetchGraphData();
    } else {
      logToConsole(`[-] Revert Failed: ${data.error}`, 'failure');
    }
  } catch (err) {
    logToConsole(`[-] Connection failed: ${err.message}`, 'failure');
  } finally {
    btn.disabled = false;
  }
}

// Zoom In animated controls
function zoomIn() {
  if (network) {
    const scale = network.getScale();
    network.moveTo({
      scale: scale * 1.3,
      animation: { duration: 200, easingFunction: 'easeInOutQuad' }
    });
  }
}

// Zoom Out animated controls
function zoomOut() {
  if (network) {
    const scale = network.getScale();
    network.moveTo({
      scale: scale / 1.3,
      animation: { duration: 200, easingFunction: 'easeInOutQuad' }
    });
  }
}

// Fit and Center graph
function zoomFit() {
  if (network) {
    network.fit({
      animation: { duration: 300, easingFunction: 'easeInOutQuad' }
    });
  }
}

// Toggle HTML5 Fullscreen Panel Mode
function toggleFullscreen() {
  const elem = document.querySelector('.canvas-panel');
  if (!document.fullscreenElement) {
    if (elem.requestFullscreen) {
      elem.requestFullscreen();
    } else if (elem.webkitRequestFullscreen) { /* Safari */
      elem.webkitRequestFullscreen();
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
}
