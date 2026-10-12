// Rotas de proventos recebidos, metas, reserva de emergência e premissas dos simuladores.
// Tudo exige sessão e é filtrado pelo usuário autenticado (nunca por id vindo do corpo).
import { Hono } from 'hono';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  isUuid, validateReceipt, validateGoal, validateReserve, validateSimulator,
} from '../lib/finance.js';
import {
  loadFinance, createReceipt, updateReceipt, deleteReceipt,
  createGoal, updateGoal, deleteGoal, saveReserve, deleteReserve,
  saveSimulator, deleteSimulator,
} from '../repos/finance.js';

export const financeRouter = new Hono();
financeRouter.use('*', requireAuth);

const readBody = (c) => c.req.json().catch(() => null);
const invalid = (c, r) => c.json({ error: r.error, field: r.field ?? null }, 400);
const badId = (c) => c.json({ error: 'id_invalido' }, 400);

financeRouter.get('/', async (c) => c.json(await loadFinance(c.get('sql'), c.get('user').id)));

/* recebimentos informados pelo usuário */
financeRouter.post('/receipts', async (c) => {
  const body = await readBody(c);
  if (!isUuid(body?.id)) return badId(c);
  const v = validateReceipt(body);
  if (!v.ok) return invalid(c, v);
  const r = await createReceipt(c.get('sql'), c.get('user').id, body.id, v.value);
  if (!r) return c.json({ error: 'id_em_uso' }, 409);
  if (r.limit) return c.json({ error: 'limite_atingido' }, 422);
  return c.json({ receipt: r.row, created: r.created }, r.created ? 201 : 200);
});
financeRouter.put('/receipts/:id', async (c) => {
  const id = c.req.param('id');
  if (!isUuid(id)) return badId(c);
  const v = validateReceipt(await readBody(c));
  if (!v.ok) return invalid(c, v);
  const row = await updateReceipt(c.get('sql'), c.get('user').id, id, v.value);
  return row ? c.json({ receipt: row }) : c.json({ error: 'nao_encontrado' }, 404);
});
financeRouter.delete('/receipts/:id', async (c) => {
  const id = c.req.param('id');
  if (!isUuid(id)) return badId(c);
  const done = await deleteReceipt(c.get('sql'), c.get('user').id, id);
  return done ? c.json({ ok: true }) : c.json({ error: 'nao_encontrado' }, 404);
});

/* metas */
financeRouter.post('/goals', async (c) => {
  const body = await readBody(c);
  if (!isUuid(body?.id)) return badId(c);
  const v = validateGoal(body);
  if (!v.ok) return invalid(c, v);
  const r = await createGoal(c.get('sql'), c.get('user').id, body.id, v.value);
  if (!r) return c.json({ error: 'id_em_uso' }, 409);
  if (r.limit) return c.json({ error: 'limite_atingido' }, 422);
  return c.json({ goal: r.row, created: r.created }, r.created ? 201 : 200);
});
financeRouter.put('/goals/:id', async (c) => {
  const id = c.req.param('id');
  if (!isUuid(id)) return badId(c);
  const v = validateGoal(await readBody(c));
  if (!v.ok) return invalid(c, v);
  const row = await updateGoal(c.get('sql'), c.get('user').id, id, v.value);
  return row ? c.json({ goal: row }) : c.json({ error: 'nao_encontrado' }, 404);
});
financeRouter.delete('/goals/:id', async (c) => {
  const id = c.req.param('id');
  if (!isUuid(id)) return badId(c);
  const done = await deleteGoal(c.get('sql'), c.get('user').id, id);
  return done ? c.json({ ok: true }) : c.json({ error: 'nao_encontrado' }, 404);
});

/* reserva de emergência */
financeRouter.put('/reserve', async (c) => {
  const v = validateReserve(await readBody(c));
  if (!v.ok) return invalid(c, v);
  return c.json({ reserve: await saveReserve(c.get('sql'), c.get('user').id, v.value) });
});
financeRouter.delete('/reserve', async (c) => {
  const done = await deleteReserve(c.get('sql'), c.get('user').id);
  return done ? c.json({ ok: true }) : c.json({ error: 'nao_encontrado' }, 404);
});

/* premissas dos simuladores */
financeRouter.put('/simulators/:key', async (c) => {
  const key = c.req.param('key');
  const v = validateSimulator(key, await readBody(c));
  if (!v.ok) return invalid(c, v);
  return c.json({ key, data: await saveSimulator(c.get('sql'), c.get('user').id, key, v.value) });
});
financeRouter.delete('/simulators/:key', async (c) => {
  const key = c.req.param('key');
  if (key !== 'independence' && key !== 'bazin') return c.json({ error: 'simulador_invalido' }, 400);
  const done = await deleteSimulator(c.get('sql'), c.get('user').id, key);
  return done ? c.json({ ok: true }) : c.json({ error: 'nao_encontrado' }, 404);
});
