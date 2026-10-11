// Endpoints administrativos: sync de catalogo da B3 (instruments).
// Requer autenticacao — so o user logado consegue chamar.

import { Hono } from 'hono';
import { requireAuth } from '../middleware/requireAuth.js';
import { fetchInstrumentList } from '../services/brapi.js';

export const adminRouter = new Hono();
adminRouter.use('*', requireAuth);

// POST /api/admin/sync-catalog
// Baixa catalogo B3 da Brapi e popula a tabela instruments.
// Executa em batches de 100 pra nao explodir memoria.
adminRouter.post('/sync-catalog', async (c) => {
  const sql = c.get('sql');
  const cfg = c.get('cfg');

  const started = Date.now();
  let list;
  try {
    list = await fetchInstrumentList(cfg);
  } catch (e) {
    return c.json({ error: 'brapi_failed', detail: e.message }, 502);
  }

  if (!Array.isArray(list) || list.length === 0) {
    return c.json({ error: 'catalogo_vazio' }, 500);
  }

  let inserted = 0, failed = 0;
  const batchSize = 100;

  for (let i = 0; i < list.length; i += batchSize) {
    const batch = list.slice(i, i + batchSize);
    try {
      // sql.helpers permite insert em bulk com postgres.js
      await sql`
        INSERT INTO instruments ${sql(batch, 'ticker', 'name', 'kind', 'sector', 'logo_url', 'avg_volume')}
        ON CONFLICT (ticker) DO UPDATE SET
          name = EXCLUDED.name,
          kind = EXCLUDED.kind,
          sector = EXCLUDED.sector,
          logo_url = EXCLUDED.logo_url,
          avg_volume = EXCLUDED.avg_volume,
          updated_at = now()
      `;
      inserted += batch.length;
    } catch (e) {
      console.error('[admin/sync-catalog] batch failed:', e.message);
      failed += batch.length;
    }
  }

  const elapsedMs = Date.now() - started;
  console.log(`[admin/sync-catalog] ${inserted} ok, ${failed} falhas em ${elapsedMs}ms`);
  return c.json({ ok: true, total: list.length, inserted, failed, elapsedMs });
});
