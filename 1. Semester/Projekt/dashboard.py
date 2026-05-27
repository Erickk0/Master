import streamlit as st
import matplotlib.pyplot as plt
import networkx as nx
import os
import time
import yaml
from oracle_sim import MigrationSimulator

# ---------------------------------------------------------
# Page Configuration & Aesthetics
# ---------------------------------------------------------
st.set_page_config(
    page_title="CRYME - PQC Migration Oracle Dashboard",
    page_icon="🛡️",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Premium HSL-inspired Sleek Dark Mode Styling with Glassmorphism
st.markdown("""
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@500;700&family=Inter:wght@300;400;600&display=swap');
    
    html, body, [class*="css"] {
        font-family: 'Inter', sans-serif;
    }
    
    h1, h2, h3 {
        font-family: 'Orbitron', sans-serif !important;
        letter-spacing: 1px;
    }
    
    /* Dark glassmorphism styling for cards */
    .glass-card {
        background: rgba(13, 20, 32, 0.45);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.05);
        padding: 24px;
        margin-bottom: 24px;
        box-shadow: 0 10px 40px 0 rgba(0, 0, 0, 0.45);
    }
    
    /* Terminal Console Style */
    .terminal-console {
        background-color: #05070B !important;
        color: #00FF66 !important;
        font-family: 'Courier New', Courier, monospace !important;
        border: 1px solid rgba(0, 255, 102, 0.15) !important;
        border-radius: 10px !important;
        padding: 18px !important;
        font-size: 13px !important;
        line-height: 1.6 !important;
        white-space: pre-wrap !important;
        height: 250px;
        overflow-y: auto;
        box-shadow: inset 0 0 20px rgba(0,0,0,0.9), 0 0 10px rgba(0, 255, 102, 0.05);
    }
    
    /* Large Oracle Status Badges */
    .oracle-badge-success {
        background: linear-gradient(135deg, rgba(46, 204, 113, 0.08), rgba(46, 204, 113, 0.18));
        color: #2ECC71;
        border: 1px solid rgba(46, 204, 113, 0.4);
        border-radius: 12px;
        padding: 16px;
        text-align: center;
        font-size: 24px;
        font-weight: 800;
        letter-spacing: 2px;
        box-shadow: 0 0 25px rgba(46, 204, 113, 0.15);
        margin-bottom: 20px;
        font-family: 'Orbitron', sans-serif;
    }
    
    .oracle-badge-failure {
        background: linear-gradient(135deg, rgba(231, 76, 60, 0.08), rgba(231, 76, 60, 0.18));
        color: #E74C3C;
        border: 1px solid rgba(231, 76, 60, 0.4);
        border-radius: 12px;
        padding: 16px;
        text-align: center;
        font-size: 24px;
        font-weight: 800;
        letter-spacing: 2px;
        box-shadow: 0 0 25px rgba(231, 76, 60, 0.15);
        margin-bottom: 20px;
        font-family: 'Orbitron', sans-serif;
    }
    
    .oracle-badge-policy {
        background: linear-gradient(135deg, rgba(241, 196, 15, 0.08), rgba(241, 196, 15, 0.18));
        color: #F1C40F;
        border: 1px solid rgba(241, 196, 15, 0.4);
        border-radius: 12px;
        padding: 16px;
        text-align: center;
        font-size: 24px;
        font-weight: 800;
        letter-spacing: 1.5px;
        box-shadow: 0 0 25px rgba(241, 196, 15, 0.12);
        margin-bottom: 20px;
        font-family: 'Orbitron', sans-serif;
    }
    
    .oracle-badge-idle {
        background: linear-gradient(135deg, rgba(149, 165, 166, 0.03), rgba(149, 165, 166, 0.08));
        color: #BDC3C7;
        border: 1px solid rgba(149, 165, 166, 0.2);
        border-radius: 12px;
        padding: 16px;
        text-align: center;
        font-size: 24px;
        font-weight: 800;
        letter-spacing: 2px;
        margin-bottom: 20px;
        font-family: 'Orbitron', sans-serif;
    }
    
    /* Styled timeline element */
    .history-timeline-container {
        border-left: 3px solid rgba(255,255,255,0.08);
        padding-left: 20px;
        margin-left: 10px;
    }
    
    .history-timeline-item {
        position: relative;
        margin-bottom: 20px;
    }
    
    .history-timeline-dot {
        position: absolute;
        left: -27px;
        top: 5px;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background-color: #3498db;
        border: 2px solid #0e1117;
    }
    
    /* Elegant gradients for text */
    .gradient-text {
        background: linear-gradient(45deg, #00FF66, #3498db);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        font-weight: 800;
    }
    
    /* Custom table styling */
    .styled-table {
        width: 100%;
        border-collapse: collapse;
        margin: 15px 0;
        font-size: 13px;
    }
    .styled-table th {
        background-color: rgba(255,255,255,0.03);
        color: #8A9Aad;
        text-align: left;
        padding: 10px;
        border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .styled-table td {
        padding: 10px;
        border-bottom: 1px solid rgba(255,255,255,0.02);
    }
    </style>
""", unsafe_allow_html=True)

# ---------------------------------------------------------
# Sidebar Scenario Selector & Setup
# ---------------------------------------------------------
st.sidebar.markdown("<h2 style='color:#FFF; font-size:18px;'>🛠️ Scenario & Policy</h2>", unsafe_allow_html=True)

yaml_options = {
    "Automotive PQC Use Case (digital_twin.yaml)": "digital_twin.yaml",
    "Webserver PQC Scenario (webserver_pqc_twin.yaml)": "webserver_pqc_twin.yaml"
}

selected_option = st.sidebar.selectbox("Digital Twin Scenario", list(yaml_options.keys()))
yaml_file = yaml_options[selected_option]

# Session State Initialization
if "current_yaml" not in st.session_state or st.session_state.current_yaml != yaml_file:
    st.session_state.current_yaml = yaml_file
    st.session_state.simulator = MigrationSimulator(yaml_file)
    st.session_state.step_data = None
    st.session_state.playing = False
    st.session_state.auto_step_delay = 1.5
    st.session_state.selected_variants = {}

simulator = st.session_state.simulator

# Reset functionality
if st.sidebar.button("🔄 Reset Simulation State", use_container_width=True):
    st.session_state.simulator.reset()
    st.session_state.step_data = None
    st.session_state.playing = False
    st.session_state.selected_variants = {}
    st.rerun()

st.sidebar.markdown("---")
st.sidebar.markdown("<h2 style='color:#FFF; font-size:18px;'>🧬 Auto-Migration Policy</h2>", unsafe_allow_html=True)
migration_strategy = st.sidebar.selectbox(
    "Algorithm Selection Strategy",
    ["Manual Selection", "Max Security (NIST Level 5)", "Max Performance (Balanced)"]
)

st.sidebar.markdown("---")
st.sidebar.markdown("<h2 style='color:#FFF; font-size:18px;'>⚡ Controls</h2>", unsafe_allow_html=True)

# ---------------------------------------------------------
# Main Header
# ---------------------------------------------------------
st.markdown("<h1 style='text-align: center; color: #FFF; margin-bottom: 2px; font-size: 32px;'>🛡️ CRYME: <span class='gradient-text'>PQC Migration Oracle</span></h1>", unsafe_allow_html=True)
st.markdown("<p style='text-align: center; color: #8A9Aad; font-size: 15px; margin-bottom: 25px;'>Model-Driven Migration Orchestration, Temporal Dependency & Algorithm Variant Explorer</p>", unsafe_allow_html=True)

# ---------------------------------------------------------
# Main Columns
# ---------------------------------------------------------
col1, col2 = st.columns([1.3, 1.0])

# Helper to identify currently active cluster
next_cluster = None
if not simulator.is_completed:
    unvisited_clusters = [C for C in simulator.V_c if not simulator.visited.get(C, False)]
    for Ci in unvisited_clusters:
        has_unvisited_dependency = False
        for Cj in unvisited_clusters:
            if Cj != Ci and (Ci, Cj) in simulator.E_c:
                has_unvisited_dependency = True
                break
        if not has_unvisited_dependency:
            next_cluster = list(Ci)
            break

# Auto Variant Pre-Selection based on Strategy
if next_cluster:
    for node in next_cluster:
        variants = simulator.engine.asset_variants.get(node, [])
        if variants:
            if migration_strategy == "Max Security (NIST Level 5)":
                # Find variant with highest NIST level
                sorted_vars = sorted(variants, key=lambda x: x.get('security_level', 0), reverse=True)
                st.session_state.selected_variants[node] = sorted_vars[0]
            elif migration_strategy == "Max Performance (Balanced)":
                # Find variant with highest performance or smaller key size
                sorted_vars = sorted(variants, key=lambda x: (x.get('performance') == 'high', -x.get('key_size_bytes', 99999)), reverse=True)
                st.session_state.selected_variants[node] = sorted_vars[0]

with col1:
    st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
    
    # ---------------------------------------------------------
    # Multi-Graph Tabs (Topological, Chronological, Variant Graphs)
    # ---------------------------------------------------------
    tab_topology, tab_timeline, tab_variants = st.tabs([
        "🕸️ Topological Known Graph", 
        "⌛ Chronological Step Graph (Time Dependency)", 
        "🧬 Variant Compatibility Map"
    ])
    
    with tab_topology:
        st.markdown("<h4 style='color:#FFF;'>Current Topological Known Graph (E_known)</h4>", unsafe_allow_html=True)
        G_known = simulator.engine.get_known_graph()
        
        # Color nodes
        node_colors = []
        for node in G_known.nodes():
            if next_cluster and node in next_cluster:
                node_colors.append("#2ECC71")  # Green
            elif node in simulator.S_nodes:
                node_colors.append("#9B59B6")  # Pink/Purple (Migrated)
            else:
                node_colors.append("#F1C40F")  # Yellow (Classic)
                
        fig, ax = plt.subplots(figsize=(10, 5.5), facecolor="#0d1420")
        ax.set_facecolor("#0d1420")
        
        pos = nx.spring_layout(G_known, seed=42, k=1.3)
        
        nx.draw_networkx_nodes(
            G_known, pos, 
            node_color=node_colors, 
            node_size=700, 
            edgecolors=(1.0, 1.0, 1.0, 0.1), 
            linewidths=1.2,
            ax=ax
        )
        
        # Split explicit and discovered implicit edges
        explicit_edges = []
        discovered_edges = []
        for u, v in G_known.edges():
            if G_known.has_edge(v, u) and (u, v) in simulator.engine.E_implicit:
                discovered_edges.append((u, v))
            else:
                explicit_edges.append((u, v))
                
        nx.draw_networkx_edges(
            G_known, pos, 
            edgelist=explicit_edges, 
            edge_color=(1.0, 1.0, 1.0, 0.3), 
            width=1.2, 
            arrowsize=15, 
            ax=ax
        )
        
        if discovered_edges:
            nx.draw_networkx_edges(
                G_known, pos, 
                edgelist=discovered_edges, 
                edge_color="#E74C3C", 
                width=2.2, 
                style="dashed", 
                arrowsize=15, 
                ax=ax
            )
            
        labels = {node: node.split(".")[-1] for node in G_known.nodes()}
        nx.draw_networkx_labels(
            G_known, pos, 
            labels=labels, 
            font_color="#FFFFFF", 
            font_size=8.5, 
            font_weight="bold",
            ax=ax
        )
        
        plt.axis("off")
        st.pyplot(fig)
        plt.close()
        
        # Graph legend
        st.markdown("""
            <div style='display: flex; justify-content: space-around; margin-top: 10px; font-size: 13px; color: #BDC3C7;'>
                <div><span style='background-color: #F1C40F; width: 10px; height: 10px; display: inline-block; border-radius: 50%; margin-right: 6px;'></span>Classic Node</div>
                <div><span style='background-color: #2ECC71; width: 10px; height: 10px; display: inline-block; border-radius: 50%; margin-right: 6px;'></span>Active Target Cluster</div>
                <div><span style='background-color: #9B59B6; width: 10px; height: 10px; display: inline-block; border-radius: 50%; margin-right: 6px;'></span>Post-Quantum Migrated</div>
                <div><span style='border: 1px dashed #E74C3C; width: 15px; height: 2px; display: inline-block; margin-right: 6px; margin-bottom: 4px;'></span>Discovered Dependency</div>
            </div>
        """, unsafe_allow_html=True)

    with tab_timeline:
        st.markdown("<h4 style='color:#FFF;'>Timeline Step Graph (Time Dependency)</h4>", unsafe_allow_html=True)
        
        if len(simulator.time_graph.nodes()) > 0:
            fig, ax = plt.subplots(figsize=(10, 5.5), facecolor="#0d1420")
            ax.set_facecolor("#0d1420")
            
            # Simple horizontal sequence layout
            pos_time = {node: (node * 2.0, 0) for node in simulator.time_graph.nodes()}
            
            # Draw chronological sequence
            nx.draw_networkx_nodes(
                simulator.time_graph, pos_time, 
                node_color="#3498db", 
                node_size=1200, 
                edgecolors="#FFFFFF", 
                linewidths=1.5,
                ax=ax
            )
            
            nx.draw_networkx_edges(
                simulator.time_graph, pos_time, 
                edge_color="#00FF66", 
                width=2.5, 
                arrowsize=20, 
                ax=ax
            )
            
            # Display step number and migrated components as labels
            time_labels = {}
            for node in simulator.time_graph.nodes():
                cluster_info = simulator.time_graph.nodes[node].get('cluster', [])
                comp_names = [n.split(".")[-1] for n in cluster_info]
                time_labels[node] = f"Step {node}\n" + "\n".join(comp_names)
                
            nx.draw_networkx_labels(
                simulator.time_graph, pos_time, 
                labels=time_labels, 
                font_color="#FFFFFF", 
                font_size=8, 
                font_weight="bold",
                ax=ax
            )
            
            plt.ylim(-1, 1)
            plt.axis("off")
            st.pyplot(fig)
            plt.close()
        else:
            st.markdown("<p style='color: #8A9Aad; font-style: italic; text-align:center; padding: 50px 0;'>No migration steps have successfully completed yet. Complete a step to build the timeline graph.</p>", unsafe_allow_html=True)

    with tab_variants:
        st.markdown("<h4 style='color:#FFF;'>Cryptographic PQC Variant Map</h4>", unsafe_allow_html=True)
        st.markdown("<p style='color:#8A9Aad; font-size:13px;'>Visualizes target variants for all cryptographic assets. Migrated targets and compatibility links are indicated below.</p>", unsafe_allow_html=True)
        
        # Build a temporary graph representing variants
        V_graph = nx.DiGraph()
        v_colors = []
        v_labels = {}
        
        # Add assets
        for node in simulator.engine.nodes:
            if "." in node:
                comp, asset = node.split(".", 1)
                # Ignore security control nodes in this view, just crypto assets
                if not any(x in asset for x in ["Boot", "Communication", "Access", "Manager", "Provider"]):
                    V_graph.add_node(node)
                    v_labels[node] = asset
                    
                    if node in simulator.S_nodes:
                        v_colors.append("#9B59B6") # Migrated
                    else:
                        v_colors.append("#F1C40F") # Classic
                        
        if len(V_graph.nodes()) > 0:
            fig, ax = plt.subplots(figsize=(10, 5.5), facecolor="#0d1420")
            ax.set_facecolor("#0d1420")
            
            pos_v = nx.circular_layout(V_graph)
            
            nx.draw_networkx_nodes(
                V_graph, pos_v, 
                node_color=v_colors, 
                node_size=800, 
                edgecolors=(1.0, 1.0, 1.0, 0.1), 
                linewidths=1.2,
                ax=ax
            )
            
            # Show matching compatibility links
            compat_edges = []
            for u, v in simulator.oracle.ground_truth_graph.edges():
                if u in V_graph.nodes() and v in V_graph.nodes():
                    compat_edges.append((u, v))
                    
            nx.draw_networkx_edges(
                V_graph, pos_v, 
                edgelist=compat_edges, 
                edge_color=(0.0, 1.0, 0.4, 0.25), 
                width=1.5,
                ax=ax
            )
            
            nx.draw_networkx_labels(
                V_graph, pos_v, 
                labels=v_labels, 
                font_color="#FFFFFF", 
                font_size=8.5, 
                font_weight="bold",
                ax=ax
            )
            
            plt.axis("off")
            st.pyplot(fig)
            plt.close()
        else:
            st.markdown("<p style='color: #8A9Aad; font-style: italic; text-align:center; padding: 50px 0;'>No cryptographic assets found in this digital twin topology.</p>", unsafe_allow_html=True)
            
    st.markdown("</div>", unsafe_allow_html=True)

with col2:
    # ---------------------------------------------------------
    # Oracle Status Verification Badge
    # ---------------------------------------------------------
    if st.session_state.step_data is None:
        st.markdown("<div class='oracle-badge-idle'>ORACLE STATE: IDLE</div>", unsafe_allow_html=True)
    elif st.session_state.step_data.get("action") == "complete":
        st.markdown("<div class='oracle-badge-success'>ORACLE: ✓ MIGRATION COMPLETE</div>", unsafe_allow_html=True)
    elif st.session_state.step_data.get("success"):
        st.markdown("<div class='oracle-badge-success'>ORACLE: ✓ VALID DEPLOYMENT</div>", unsafe_allow_html=True)
    elif st.session_state.step_data.get("action") == "aborted_by_policy":
        st.markdown("<div class='oracle-badge-policy'>ORACLE: ✗ POLICY DENIED</div>", unsafe_allow_html=True)
    else:
        st.markdown("<div class='oracle-badge-failure'>ORACLE: ✗ RUNTIME FAILURE</div>", unsafe_allow_html=True)
        
    # ---------------------------------------------------------
    # Oracle Terminal Logs Widget
    # ---------------------------------------------------------
    st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
    st.markdown("<h4 style='color:#FFF; margin-bottom:12px;'>💻 Oracle Verification Terminal</h4>", unsafe_allow_html=True)
    
    if st.session_state.step_data:
        logs_text = "\n".join(st.session_state.step_data.get("logs", []))
        st.markdown(f"<pre class='terminal-console'>{logs_text}</pre>", unsafe_allow_html=True)
    else:
        st.markdown("<pre class='terminal-console'>[info] System idle. Select algorithm variants and step forward to deploy components...</pre>", unsafe_allow_html=True)
        
    st.markdown("</div>", unsafe_allow_html=True)

# ---------------------------------------------------------
# Dynamic Algorithm Variant Customizer & Comparison Tab
# ---------------------------------------------------------
st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
st.markdown("<h3 style='color:#FFF; margin-bottom:15px;'>🧬 Model-Driven Algorithm Variants Selection</h3>", unsafe_allow_html=True)

if next_cluster:
    st.markdown(f"<p style='color:#8A9Aad; font-size:14px;'>The next candidate migration cluster includes: <b>{', '.join(next_cluster)}</b></p>", unsafe_allow_html=True)
    
    # Check if there are assets with PQC variants
    assets_with_variants = []
    for node in next_cluster:
        variants = simulator.engine.asset_variants.get(node, [])
        if variants:
            assets_with_variants.append((node, variants))
            
    if assets_with_variants:
        cols = st.columns(len(assets_with_variants))
        for idx, (node, variants) in enumerate(assets_with_variants):
            with cols[idx]:
                var_names = [v['algorithm'] for v in variants]
                
                # Pre-select based on session state
                pre_sel_idx = 0
                if node in st.session_state.selected_variants:
                    pre_sel_algo = st.session_state.selected_variants[node].get('algorithm')
                    if pre_sel_algo in var_names:
                        pre_sel_idx = var_names.index(pre_sel_algo)
                        
                selected_name = st.selectbox(
                    f"Variant for {node.split('.')[-1]}",
                    var_names,
                    index=pre_sel_idx,
                    disabled=(migration_strategy != "Manual Selection")
                )
                # Store selection
                chosen_var = next(v for v in variants if v['algorithm'] == selected_name)
                st.session_state.selected_variants[node] = chosen_var
                
        # Algorithm Comparative Attributes Table
        st.markdown("<h5 style='color:#FFF; margin-top:20px;'>Selected Cluster Algorithm Comparison</h5>", unsafe_allow_html=True)
        comparison_html = "<table class='styled-table'><thead><tr><th>Asset Name</th><th>Selected Algorithm</th><th>NIST Level</th><th>Key Size (Bytes)</th><th>Performance</th></tr></thead><tbody>"
        for node, var in st.session_state.selected_variants.items():
            if node in next_cluster:
                comparison_html += f"<tr><td><b>{node.split('.')[-1]}</b></td><td><span style='color:#00FF66;'>{var['algorithm']}</span></td><td>Level {var['security_level']}</td><td>{var['key_size_bytes']} bytes</td><td><span style='color:#3498db;'>{var['performance'].upper()}</span></td></tr>"
        comparison_html += "</tbody></table>"
        st.markdown(comparison_html, unsafe_allow_html=True)
    else:
        st.markdown("<p style='color: #BDC3C7; font-style: italic; font-size:13px;'>This cluster consists of security controls/modules and has no parameterized key/library variants.</p>", unsafe_allow_html=True)
else:
    st.markdown("<p style='color: #BDC3C7; font-style: italic; font-size:13px;'>No pending clusters to migrate.</p>", unsafe_allow_html=True)
st.markdown("</div>", unsafe_allow_html=True)

# ---------------------------------------------------------
# Control Panel & Playback Logic
# ---------------------------------------------------------
control_col1, control_col2 = st.columns([1.3, 1.0])

with control_col1:
    st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
    st.markdown("<h3 style='color:#FFF; margin-bottom:15px;'>🕹️ Simulation Control Center</h3>", unsafe_allow_html=True)
    
    btn_col1, btn_col2, btn_col3 = st.columns(3)
    
    # Step Forward
    with btn_col1:
        if st.button("▶️ Deploy Next Step", use_container_width=True, disabled=simulator.is_completed):
            # Pass custom variant selections
            st.session_state.step_data = simulator.step(st.session_state.selected_variants)
            st.session_state.playing = False
            st.rerun()
            
    # Auto Play Toggle
    with btn_col2:
        if not st.session_state.playing:
            if st.button("🔁 Auto Run Sequence", use_container_width=True, disabled=simulator.is_completed):
                st.session_state.playing = True
                st.rerun()
        else:
            if st.button("⏸️ Pause Sequence", use_container_width=True):
                st.session_state.playing = False
                st.rerun()
                
    # Delay slider
    with btn_col3:
        st.session_state.auto_step_delay = st.slider(
            "Step Delay (sec)", 
            min_value=0.5, 
            max_value=3.0, 
            value=st.session_state.auto_step_delay, 
            step=0.5
        )
        
    st.markdown("</div>", unsafe_allow_html=True)

# Auto play logic handler
if st.session_state.playing and not simulator.is_completed:
    time.sleep(st.session_state.auto_step_delay)
    st.session_state.step_data = simulator.step(st.session_state.selected_variants)
    st.rerun()

# ---------------------------------------------------------
# Step-by-Step Chronological History & Time Travel
# ---------------------------------------------------------
with control_col2:
    st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
    st.markdown("<h3 style='color:#FFF; margin-bottom:15px;'>⌛ Interactive Migration History</h3>", unsafe_allow_html=True)
    
    if simulator.history:
        st.markdown("<div class='history-timeline-container'>", unsafe_allow_html=True)
        for idx, h_step in enumerate(simulator.history):
            success = h_step.get("success")
            action = h_step.get("action")
            step_num = h_step.get("step")
            cluster_str = ", ".join([c.split(".")[-1] for c in h_step["cluster"]])
            
            # Form pill
            if success:
                pill = f"<span style='background-color:rgba(46, 204, 113, 0.15); color:#2ECC71; border:1px solid #2ECC71; padding:2px 8px; border-radius:10px; font-size:11px;'>SUCCESS</span>"
            elif action == "aborted_by_policy":
                pill = f"<span style='background-color:rgba(241, 196, 15, 0.15); color:#F1C40F; border:1px solid #F1C40F; padding:2px 8px; border-radius:10px; font-size:11px;'>ABORTED</span>"
            else:
                pill = f"<span style='background-color:rgba(231, 76, 60, 0.15); color:#E74C3C; border:1px solid #E74C3C; padding:2px 8px; border-radius:10px; font-size:11px;'>FAILURE</span>"
                
            dot_color = "#2ECC71" if success else ("#F1C40F" if action == "aborted_by_policy" else "#E74C3C")
            
            st.markdown(f"""
                <div class='history-timeline-item'>
                    <div class='history-timeline-dot' style='background-color:{dot_color};'></div>
                    <div style='color:#FFF; font-size:13px;'><b>Step {idx+1}:</b> {cluster_str} {pill}</div>
                </div>
            """, unsafe_allow_html=True)
            
            # Interactive Time Travel button
            if st.button(f"⌛ Restore State to Step {idx+1}", key=f"time_travel_{idx}", use_container_width=True):
                st.session_state.simulator.restore_historical_state(idx + 1)
                st.session_state.step_data = simulator.history[-1]
                st.session_state.playing = False
                st.rerun()
                
        st.markdown("</div>", unsafe_allow_html=True)
    else:
        st.markdown("<p style='color: #8A9Aad; font-style: italic; font-size: 13px;'>No migration history recorded yet. Deploy steps to populate timeline.</p>", unsafe_allow_html=True)
        
    st.markdown("</div>", unsafe_allow_html=True)

# ---------------------------------------------------------
# Generated Playbook Code Viewer
# ---------------------------------------------------------
st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
st.markdown("<h3 style='color:#FFF; margin-bottom:15px;'>📜 Dynamically Compiled Ansible Playbook</h3>", unsafe_allow_html=True)

if st.session_state.step_data and st.session_state.step_data.get("ansible_content"):
    st.code(st.session_state.step_data["ansible_content"], language="yaml")
else:
    st.markdown("<p style='color: #8A9Aad; font-style: italic; font-size: 13px;'>Deploy a step to see the dynamically compiled Ansible Playbook script.</p>", unsafe_allow_html=True)
    
st.markdown("</div>", unsafe_allow_html=True)
