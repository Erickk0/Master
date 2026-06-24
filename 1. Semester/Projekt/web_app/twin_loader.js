async function populateMemgraphWithTwin(session, twin) {
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

    for (const nb of comp.not_before || []) {
      await session.run(`
        MATCH (c1:Component {id: $c1})
        MATCH (c2:Component {id: $c2})
        CREATE (c1)-[:TEMPORAL_CONSTRAINT {type: 'not_before'}]->(c2)
      `, { c1: compId, c2: nb });
    }
  }

  for (const gDep of twin.global_dependencies || []) {
    const nodes = gDep.nodes || [];
    if (nodes.length >= 2) {
      const u = nodes[0];
      const v = nodes[1];

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

module.exports = { populateMemgraphWithTwin };
