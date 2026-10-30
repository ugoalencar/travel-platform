'use strict';
const { Client } = require('pg');
(async () => {
  for (const port of [4100, 5183]) {
    try { const r = await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(4000) }); console.log(`HTTP ${port}: ${r.status}`); }
    catch (e) { console.log(`HTTP ${port}: ${e.code || ''} ${e.message}`); }
  }
  const c = new Client({ host: '127.0.0.1', port: 55644, database: 'travel_platform_teste', user: 'teste_admin', password: 'teste_admin_local', connectionTimeoutMillis: 4000 });
  try { await c.connect(); console.log('PG:', (await c.query('select current_database() db')).rows); }
  catch (e) { console.log('PG:', e.code, e.message); process.exitCode = 1; }
  finally { await c.end(); }
})();
