// Baixa a lista de ações e FIIs da B3 (Brapi) e popula a tabela `instruments`,
// que alimenta a busca com autocompletar. Uso: npm run sync:instruments
import { pool } from '../src/lib/db.js';
import { fetchInstrumentList } from '../src/services/brapi.js';

try {
  const list = await fetchInstrumentList();
  console.log(`Recebidos ${list.length} ativos da Brapi.`);
  let n = 0;
  for (const it of list) {
    await pool.query(
      `INSERT INTO instruments (ticker, name, kind, sector, logo_url, avg_volume, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6, now())
       ON CONFLICT (ticker) DO UPDATE SET
         name=EXCLUDED.name, kind=EXCLUDED.kind, sector=EXCLUDED.sector,
         logo_url=EXCLUDED.logo_url, avg_volume=EXCLUDED.avg_volume, updated_at=now()`,
      [it.ticker, it.name, it.kind, it.sector, it.logo_url, it.avg_volume]
    );
    n++;
  }
  console.log(`Catálogo atualizado: ${n} ativos.`);
} catch (e) {
  console.error('Falha ao sincronizar catálogo:', e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
