// Baixa catálogo B3 da Brapi e popula a tabela `instruments`.
// Uso: node --env-file=.env scripts/sync-instruments.js
// (Em prod, você também pode rodar isso localmente apontando pra Supabase.)

import postgres from 'postgres';
import { fetchInstrumentList } from '../worker/services/brapi.js';
import { makeConfig } from '../worker/lib/config.js';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL ausente. Rode com: node --env-file=.env scripts/sync-instruments.js');
  process.exit(1);
}

const cfg = makeConfig(process.env);
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2 });

try {
  const list = await fetchInstrumentList(cfg);
  console.log(`Recebidos ${list.length} ativos da Brapi.`);
  let n = 0;
  for (const it of list) {
    await sql`
      INSERT INTO instruments (ticker, name, kind, sector, logo_url, avg_volume, updated_at)
      VALUES (${it.ticker}, ${it.name}, ${it.kind}, ${it.sector}, ${it.logo_url}, ${it.avg_volume}, now())
      ON CONFLICT (ticker) DO UPDATE SET
        name=EXCLUDED.name, kind=EXCLUDED.kind, sector=EXCLUDED.sector,
        logo_url=EXCLUDED.logo_url, avg_volume=EXCLUDED.avg_volume, updated_at=now()
    `;
    n++;
  }
  console.log(`Catálogo atualizado: ${n} ativos.`);
} catch (e) {
  console.error('Falha ao sincronizar catálogo:', e.message, e.stack);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
