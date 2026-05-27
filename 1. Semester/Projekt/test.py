import yaml
from neo4j import GraphDatabase
import os

# Verbindung zu Memgraph (läuft standardmäßig auf Port 7687, genau wie Neo4j)
URI = "bolt://localhost:7687"
# Memgraph erfordert in der Standardkonfiguration oft keine Authentifizierung, 
# passe dies an, falls du Nutzer/Passwort gesetzt hast.
AUTH = ("", "") 

def load_yaml(file_path):
    with open(file_path, 'r', encoding='utf-8') as file:
        return yaml.safe_load(file)

def clear_database(tx):
    """Löscht die bestehende Datenbank für einen sauberen Import."""
    tx.run("MATCH (n) DETACH DELETE n")

def create_graph_data(tx, twin_data):
    # 1. Komponenten und Assets anlegen
    for comp in twin_data.get('components', []):
        comp_id = comp['component_id']
        comp_phase = comp.get('phase', 0)
        
        # Erstelle die Hauptkomponente mit Model-Driven Phasen-Attribut
        tx.run("""
            CREATE (c:Component {id: $id, name: $name, type: $type, phase: $phase})
        """, id=comp_id, name=comp['name'], type=comp['type'], phase=comp_phase)

        # Erstelle Security Controls
        for control in comp.get('security_controls', []):
            control_id = f"{comp_id}_{control['control_name'].replace(' ', '_')}"
            tx.run("""
                MATCH (c:Component {id: $comp_id})
                CREATE (ctrl:SecurityControl {id: $ctrl_id, name: $name})
                CREATE (c)-[:HAS_CONTROL]->(ctrl)
            """, comp_id=comp_id, ctrl_id=control_id, name=control['control_name'])

        # Erstelle Cryptographic Assets und ihre PQC-Varianten
        for asset in comp.get('cryptographic_assets', []):
            asset_id = asset['asset_id']
            full_asset_id = f"{comp_id}_{asset_id}"
            
            tx.run("""
                MATCH (c:Component {id: $comp_id})
                CREATE (a:CryptoAsset {id: $asset_id, type: $type, algorithm: $algo})
                CREATE (c)-[:HAS_ASSET]->(a)
            """, comp_id=comp_id, asset_id=full_asset_id, type=asset['asset_type'], algo=asset['algorithm'])

            # Import PQC variants for this asset
            for var in asset.get('migration_variants', []):
                var_id = f"{full_asset_id}_{var['variant_id']}"
                tx.run("""
                    MATCH (a:CryptoAsset {id: $asset_id})
                    CREATE (v:PQCVariant {id: $var_id, algorithm: $algo, security_level: $level, key_size: $size, performance: $perf})
                    CREATE (a)-[:HAS_VARIANT]->(v)
                """, asset_id=full_asset_id, var_id=var_id, algo=var['algorithm'], 
                     level=var['security_level'], size=var['key_size_bytes'], perf=var['performance'])

    # 2. Implizite und Explizite Abhängigkeiten innerhalb der Komponente verknüpfen
    for comp in twin_data.get('components', []):
        comp_id = comp['component_id']
        
        for dep in comp.get('dependencies', {}).get('implicit', []):
            src_ctrl_id = f"{comp_id}_{dep['source'].replace(' ', '_')}"
            target_asset_id = f"{comp_id}_{dep['target']}"
            
            tx.run("""
                MATCH (src:SecurityControl {id: $src_id})
                MATCH (target:CryptoAsset {id: $target_id})
                CREATE (src)-[:IMPLICIT_DEPENDENCY {type: $dep_type}]->(target)
            """, src_id=src_ctrl_id, target_id=target_asset_id, dep_type=dep['type'])

    # 3. Model-Driven Temporal Constraints (not_before) verknüpfen
    for comp in twin_data.get('components', []):
        comp_id = comp['component_id']
        for nb_comp in comp.get('not_before', []):
            tx.run("""
                MATCH (c1:Component {id: $c1_id})
                MATCH (c2:Component {id: $c2_id})
                CREATE (c1)-[:TEMPORAL_CONSTRAINT {type: "not_before"}]->(c2)
            """, c1_id=comp_id, c2_id=nb_comp)

def main():
    # generalized to support both digital twin files
    files = ["digital_twin.yaml", "webserver_pqc_twin.yaml"]
    
    print("Verbinde mit Memgraph Graph-Datenbank...")
    try:
        driver = GraphDatabase.driver(URI, auth=AUTH)
        # Verify connection
        driver.verify_connectivity()
    except Exception as e:
        print(f"Warnung: Keine aktive Memgraph-Instanz gefunden ({e}). Graph-Import übersprungen.")
        return

    with driver as drv:
        with drv.session() as session:
            print("Bereinige alte Daten...")
            session.execute_write(clear_database)
            
            for f in files:
                full_path = f"/Users/erickzeiler/Desktop/Master/1. Semester/Projekt/{f}"
                if os.path.exists(full_path):
                    print(f"Importiere {f} Struktur...")
                    yaml_data = load_yaml(full_path)
                    session.execute_write(create_graph_data, yaml_data['digital_twin'])
                    
    print("Graph-Datenbank erfolgreich befüllt!")

if __name__ == "__main__":
    main()