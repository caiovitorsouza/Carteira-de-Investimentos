// Rotas da lista de interesse. Exigem sessão e filtram pelo usuário autenticado
// (nunca por id vindo do corpo). Nenhuma rota registra compra nem altera a carteira.
import { Hono } from 'hono';
import { requireAuth } from '../middleware/requireAuth.js';
import { isUuid } from '../lib/finance.js';
import { validateWatchItem } from '../lib/watchlist.js';
import { listWatch, createWatch, updateWatch, deleteWatch } from '../repos/watchlist.js';

export const watchlistRouter = new Hono();
watchlistRouter.use('*', requireAuth);

const readBody = (c) => c.req.json().catch(() => null);
const invalid = (c, r) => c.json({ error: r.error, field: r.field ?? null }, 400);
const badId = (c) => c.json({ error: 'id_invalido' }, 400);

watchlistRouter.get('/', async (c) => c.json({ items: await listWatch(c.get('sql'), c.get('user').id) }));

watchlistRouter.post('/', async (c) => {
  const body = await readBody(c);
  if (!isUuid(body?.id)) return badId(c);
  const v = validateWatchItem(body);
  if (!v.ok) return invalid(c, v);
  const r = await createWatch(c.get('sql'), c.get('user').id, body.id, v.value);
  if (!r) return c.json({ error: 'id_em_uso' }, 409);
  if (r.limit) return c.json({ error: 'limite_atingido' }, 422);
  return c.json({ item: r.row, created: r.created }, r.created ? 201 : 200);
});

watchlistRouter.put('/:id', async (c) => {
  const id = c.req.param('id');
  if (!isUuid(id)) return badId(c);
  const v = validateWatchItem(await readBody(c));
  if (!v.ok) return invalid(c, v);
  const row = await updateWatch(c.get('sql'), c.get('user').id, id, v.value);
  return row ? c.json({ item: row }) : c.json({ error: 'nao_encontrado' }, 404);
});

watchlistRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  if (!isUuid(id)) return badId(c);
  const done = await deleteWatch(c.get('sql'), c.get('user').id, id);
  return done ? c.json({ ok: true }) : c.json({ error: 'nao_encontrado' }, 404);
});
