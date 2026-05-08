import yaml
from neo4j import GraphDatabase

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
        
        # Erstelle die Hauptkomponente
        tx.run("""
            CREATE (c:Component {id: $id, name: $name, type: $type})
        """, id=comp_id, name=comp['name'], type=comp['type'])

        # Erstelle Security Controls
        for control in comp.get('security_controls', []):
            control_id = f"{comp_id}_{control['control_name'].replace(' ', '_')}"
            tx.run("""
                MATCH (c:Component {id: $comp_id})
                CREATE (ctrl:SecurityControl {id: $ctrl_id, name: $name})
                CREATE (c)-[:HAS_CONTROL]->(ctrl)
            """, comp_id=comp_id, ctrl_id=control_id, name=control['control_name'])

        # Erstelle Cryptographic Assets
        for asset in comp.get('cryptographic_assets', []):
            tx.run("""
                MATCH (c:Component {id: $comp_id})
                CREATE (a:CryptoAsset {id: $asset_id, type: $type, algorithm: $algo})
                CREATE (c)-[:HAS_ASSET]->(a)
            """, comp_id=comp_id, asset_id=asset['asset_id'], type=asset['asset_type'], algo=asset['algorithm'])

        # 2. Implizite und Explizite Abhängigkeiten innerhalb der Komponente verknüpfen
        for dep in comp.get('dependencies', {}).get('implicit', []):
            # Formatiere Control-ID passend zum Erstellungsschritt oben
            src_ctrl_id = f"{comp_id}_{dep['source'].replace(' ', '_')}"
            target_asset_id = dep['target']
            
            tx.run("""
                MATCH (src:SecurityControl {id: $src_id})
                MATCH (target:CryptoAsset {id: $target_id})
                CREATE (src)-[:IMPLICIT_DEPENDENCY {type: $dep_type}]->(target)
            """, src_id=src_ctrl_id, target_id=target_asset_id, dep_type=dep['type'])

def main():
    yaml_data = load_yaml("/Users/erickzeiler/Desktop/Master/1. Semester/Projekt/webserver_pqc_twin.yaml")
    
    print("Verbinde mit Memgraph Graph-Datenbank...")
    with GraphDatabase.driver(URI, auth=AUTH) as driver:
        with driver.session() as session:
            print("Bereinige alte Daten...")
            session.execute_write(clear_database)
            
            print("Importiere Digital Twin Struktur...")
            session.execute_write(create_graph_data, yaml_data['digital_twin'])
            
    print("AP 3 abgeschlossen: Datenbank erfolgreich befüllt!")

if __name__ == "__main__":
    main()