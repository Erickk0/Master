const fs = require('fs');
const express = require('express');

const STATE_PATH = process.env.CRYME_STATE_PATH || '/state/runtime.json';
const PORT = Number(process.env.PORT || 3001);

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return {
      migration_step: 0,
      profile: 'classic-rsa-ecdhe',
      service: 'cryme-api',
      algorithms: {
        'Webserver_Classic.Cert_RSA2048': 'RSA-2048',
        'Webserver_Classic.KeyExchange_ECDHE': 'ECDHE',
        'Webserver_Classic.TLS_1.2_/_1.3_Communication': 'TLS1.2/1.3',
        'Client_Browser.KeyExchange_ECDHE': 'ECDHE'
      },
      deployed_at: null
    };
  }
}

const app = express();

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'cryme-api' });
});

app.get('/api/status', (_req, res) => {
  const state = loadState();
  res.json({
    service: 'cryme-api',
    live: true,
    migration_step: state.migration_step,
    profile: state.profile,
    algorithms: state.algorithms,
    deployed_at: state.deployed_at,
    uptime_seconds: Math.floor(process.uptime())
  });
});

app.get('/api/data', (_req, res) => {
  const state = loadState();
  res.json({
    message: 'CRYME live service response',
    migration_step: state.migration_step,
    tls_profile: state.profile,
    crypto_state: state.algorithms
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`cryme-api listening on :${PORT}`);
});
