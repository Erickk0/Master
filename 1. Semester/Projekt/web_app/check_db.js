const neo4j = require('neo4j-driver');
const driver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('', ''));

async function check() {
  const session = driver.session();
  try {
    const res = await session.run("MATCH (s:MigrationStep) RETURN s.step as step, s.status as status ORDER BY s.step");
    console.log("Nodes in DB:");
    res.records.forEach(r => {
      console.log(`Step: ${r.get('step')}, Status: ${r.get('status')}`);
    });
    
    const edgeRes = await session.run("MATCH (u:MigrationStep)-[r:TRANSITION_TO]->(v:MigrationStep) RETURN u.step as u_step, v.step as v_step");
    console.log("\\nEdges:");
    edgeRes.records.forEach(r => {
      console.log(`Edge: ${r.get('u_step')} -> ${r.get('v_step')}`);
    });
    
  } finally {
    await session.close();
    driver.close();
  }
}

check();
