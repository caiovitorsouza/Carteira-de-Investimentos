// Lista de interesse: rotas REAIS do Worker contra Postgres em memória (PGlite) com o db/schema.sql
// completo, e a migração WATCHLIST partindo do schema já com o bloco FINANCE. Só dados fictícios.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { watchlistRouter } from '../../worker/routes/watchlist.js';
import { makeConfig } from '../../worker/lib/config.js';
import { createSession, newSessionToken } from '../../worker/lib/auth.js';
import { validateWatchItem } from '../../worker/lib/watchlist.js';
import { MAX_WATCH } from '../../worker/repos/watchlist.js';
import { makeDb, makeRawDb, makeUser, OLD_SCHEMA, FINANCE_BLOCK, WATCHLIST_BLOCK, WATCHLIST_ROLLBACK, SCHEMA } from './helpers/pgsql.mjs';

let db, sql, app, A, B, tokA, tokB, cfg;
const uuid = () => crypto.randomUUID();
before(async () => {
  ({ db, sql } = await makeDb());
  cfg = makeConfig({});
  app = new Hono();
  app.use('/api/*', async (c, next) => { c.set('cfg', cfg); c.set('sql', sql); await next(); });
  app.route('/api/watchlist', watchlistRouter);
  A = await makeUser(sql, 'ana.lista@example.test');
  B = await makeUser(sql, 'beto.lista@example.test');
  tokA = newSessionToken(); tokB = newSessionToken();
  await createSession(sql, A, tokA, 1); await createSession(sql, B, tokB, 1);
});
after(async () => { await db.close(); });

const call = (tok, method, path, body) => app.request('/api/watchlist' + path, {
  method,
  headers: { 'content-type': 'application/json', ...(tok ? { cookie: `${cfg.session.cookieName}=${tok}` } : {}) },
  body: body === undefined || method === 'GET' ? undefined : JSON.stringify(body),
});
const item = (over = {}) => ({ id: uuid(), stage: 'acompanhar', asset: 'wish11', kind: 'fii', name: 'Fundo Fictício',
  reason: 'Diversificar em logística', notes: null, priority: 2, targetPriceCents: 950, plannedAmountCents: null,
  plannedQuantity: 10, manualPriceCents: null, manualPriceOn: null, ...over });

test('lista: exige sessão em todas as rotas', async () => {
  for (const [m, p] of [['GET', ''], ['POST', ''], ['PUT', '/' + uuid()], ['DELETE', '/' + uuid()]]) {
    assert.equal((await call(null, m, p, {})).status, 401, `${m} ${p}`);
    assert.equal((await call('token-falso', m, p, {})).status, 401);
  }
});

test('lista: cria, normaliza o ticker, persiste centavos e quantidade; reenvio do mesmo id não duplica', async () => {
  const it = item();
  const r = await call(tokA, 'POST', '', it);
  assert.equal(r.status, 201);
  const out = await r.json();
  assert.equal(out.item.asset, 'WISH11');
  assert.equal(out.item.plannedQuantity, 10);
  assert.equal(out.item.targetPriceCents, 950);
  const again = await call(tokA, 'POST', '', it);
  assert.equal(again.status, 200);
  assert.equal((await again.json()).created, false);
  const g = await (await call(tokA, 'GET', '')).json();
  assert.equal(g.items.length, 1);
  assert.deepEqual(g.items[0], { id: it.id, stage: 'acompanhar', asset: 'WISH11', kind: 'fii', name: 'Fundo Fictício',
    reason: 'Diversificar em logística', notes: null, priority: 2, targetPriceCents: 950, plannedAmountCents: null,
    plannedQuantity: 10, manualPriceCents: null, manualPriceOn: null });
});

test('lista: mover entre etapas e editar; cotação manual sempre datada', async () => {
  const it = item({ asset: 'Tesouro IPCA+ 2035', kind: 'rf', plannedQuantity: null, plannedAmountCents: 150000, manualPriceCents: 300000, manualPriceOn: '2026-10-01' });
  await call(tokA, 'POST', '', it);
  const r = await call(tokA, 'PUT', '/' + it.id, { ...it, stage: 'comprar', priority: 1 });
  assert.equal(r.status, 200);
  const out = (await r.json()).item;
  assert.deepEqual([out.stage, out.priority, out.asset, out.manualPriceOn], ['comprar', 1, 'Tesouro IPCA+ 2035', '2026-10-01']);
});

test('lista: isolamento — outro usuário não vê, não altera, não apaga e não toma o id', async () => {
  const it = item({ asset: 'PRIV11' });
  await call(tokA, 'POST', '', it);
  const gB = await (await call(tokB, 'GET', '')).json();
  assert.equal(gB.items.length, 0);
  assert.equal((await call(tokB, 'PUT', '/' + it.id, item({ id: it.id }))).status, 404);
  assert.equal((await call(tokB, 'DELETE', '/' + it.id)).status, 404);
  assert.equal((await call(tokB, 'POST', '', { ...it })).status, 409);           // id já é de A
  const gA = await (await call(tokA, 'GET', '')).json();
  assert.ok(gA.items.some((x) => x.id === it.id && x.asset === 'PRIV11'));
});

test('lista: validação do servidor recusa dados inválidos sem gravar', async () => {
  const antes = (await sql`SELECT count(*)::int n FROM watchlist_items`)[0].n;
  const casos = [
    [{ asset: '' }, 'ativo_invalido'],
    [{ kind: 'cripto' }, 'classe_invalida'],
    [{ stage: 'comprado' }, 'etapa_invalida'],
    [{ priority: 4 }, 'prioridade_invalida'],
    [{ plannedAmountCents: 1000, plannedQuantity: 3 }, 'aporte_valor_ou_quantidade'],
    [{ plannedQuantity: 1.5 }, 'quantidade_inteira'],
    [{ kind: 'rf', plannedQuantity: 2 }, 'quantidade_nao_se_aplica'],
    [{ plannedQuantity: -1 }, 'quantidade_invalida'],
    [{ targetPriceCents: 1.5 }, 'preco_interesse_invalido'],
    [{ manualPriceCents: 1000 }, 'cotacao_manual_sem_data'],
    [{ manualPriceCents: 1000, manualPriceOn: '2099-01-01' }, 'data_cotacao_futura'],
    [{ manualPriceCents: 1000, manualPriceOn: '2026-02-31' }, 'data_cotacao_invalida'],
    [{ notes: 'x'.repeat(1001) }, 'observacoes_invalidas'],
  ];
  for (const [over, erro] of casos) {
    const r = await call(tokA, 'POST', '', item(over));
    assert.equal(r.status, 400, JSON.stringify(over));
    assert.equal((await r.json()).error, erro, JSON.stringify(over));
  }
  assert.equal((await call(tokA, 'POST', '', { ...item(), id: 'nao-e-uuid' })).status, 400);
  assert.equal((await sql`SELECT count(*)::int n FROM watchlist_items`)[0].n, antes);
  // ação/FII aceitam quantidade inteira; "outro" aceita fração (ex.: ETF no exterior)
  assert.equal(validateWatchItem(item({ kind: 'outro', plannedQuantity: 0.12345678 })).ok, true);
  assert.equal(validateWatchItem(item({ kind: 'outro', plannedQuantity: 0.123456789 })).error, 'quantidade_invalida');
});

test('lista: limite por usuário e exclusão', async () => {
  const U = await makeUser(sql, 'cheio.lista@example.test');
  const tok = newSessionToken(); await createSession(sql, U, tok, 1);
  await sql`INSERT INTO watchlist_items (id, user_id, stage, asset, kind)
            SELECT gen_random_uuid(), ${U}, 'acompanhar', 'A' || g, 'outro' FROM generate_series(1, ${MAX_WATCH - 1}) g`;
  assert.equal((await call(tok, 'POST', '', item())).status, 201);
  const r = await call(tok, 'POST', '', item());
  assert.equal(r.status, 422);
  assert.equal((await r.json()).error, 'limite_atingido');
  const id = (await (await call(tok, 'GET', '')).json()).items[0].id;
  assert.equal((await call(tok, 'DELETE', '/' + id)).status, 200);
  assert.equal((await call(tok, 'DELETE', '/' + id)).status, 404);
});

test('lista: não toca na carteira; excluir a conta remove os itens (cascata)', async () => {
  const U = await makeUser(sql, 'cascata.lista@example.test');
  const tok = newSessionToken(); await createSession(sql, U, tok, 1);
  const v0 = (await sql`SELECT portfolio_version v FROM users WHERE id = ${U}`)[0].v;
  await call(tok, 'POST', '', item({ stage: 'comprar', plannedQuantity: 3 }));
  assert.equal((await sql`SELECT count(*)::int n FROM positions WHERE user_id = ${U}`)[0].n, 0);
  assert.equal((await sql`SELECT portfolio_version v FROM users WHERE id = ${U}`)[0].v, v0);
  await sql`DELETE FROM users WHERE id = ${U}`;
  assert.equal((await sql`SELECT count(*)::int n FROM watchlist_items WHERE user_id = ${U}`)[0].n, 0);
});

/* ------------------------------------------------------------- migração WATCHLIST */
const OLD_AND_FINANCE = ['users', 'sessions', 'instruments', 'market_quotes', 'dividends', 'positions', 'user_documents',
  'portfolio_snapshots', 'refresh_runs', 'market_rates', 'email_log', 'dividend_receipts', 'financial_goals', 'emergency_reserve', 'user_simulators'];
const fingerprint = async (d) => {
  const out = {};
  for (const t of OLD_AND_FINANCE) out[t] = (await d.query(`SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY to_jsonb(x)::text), '')) AS h, count(*)::int AS n FROM ${t} x`)).rows[0];
  return out;
};
const exists = async (d, t) => (await d.query('SELECT to_regclass($1) AS r', ['public.' + t])).rows[0].r !== null;
async function bancoComFinance() {
  const { db: d, sql: s } = await makeRawDb();
  await d.exec(OLD_SCHEMA); await d.exec(FINANCE_BLOCK);
  const [{ id }] = await s`INSERT INTO users (email, password_hash, portfolio_version) VALUES ('legado.lista@example.test', 'x', 3) RETURNING id`;
  await s`INSERT INTO instruments (ticker, name, kind) VALUES ('TEST11', 'Fundo Teste', 'fii')`;
  await s`INSERT INTO positions (id, user_id, kind, ticker, quantity, avg_price) VALUES (${uuid()}, ${id}, 'fii', 'TEST11', 10, 100)`;
  await s`INSERT INTO dividend_receipts (id, user_id, asset, received_on, amount_cents) VALUES (${uuid()}, ${id}, 'TEST11', '2026-10-01', 4242)`;
  await s`INSERT INTO financial_goals (id, user_id, kind, name, target_cents) VALUES (${uuid()}, ${id}, 'patrimonio', 'meta', 100000)`;
  return { d, s, id };
}
test('migração WATCHLIST: aditiva sobre o banco com FINANCE, idempotente, RLS ligado e sem políticas', async () => {
  const { d } = await bancoComFinance();
  const antes = await fingerprint(d);
  assert.equal(await exists(d, 'watchlist_items'), false);
  await d.exec(WATCHLIST_BLOCK);
  assert.deepEqual(await fingerprint(d), antes, 'nenhuma linha das tabelas anteriores mudou');
  assert.equal(await exists(d, 'watchlist_items'), true);
  await d.exec(SCHEMA); await d.exec(WATCHLIST_BLOCK);              // reaplicar o schema inteiro e o bloco
  assert.deepEqual(await fingerprint(d), antes);
  const rls = (await d.query(`SELECT relrowsecurity r FROM pg_class WHERE relname = 'watchlist_items'`)).rows[0].r;
  assert.equal(rls, true);
  assert.equal((await d.query(`SELECT count(*)::int n FROM pg_policies WHERE schemaname = 'public'`)).rows[0].n, 0);
  await d.close();
});
test('migração WATCHLIST: o banco recusa valor e quantidade juntos e cotação manual sem data', async () => {
  const { d, s, id } = await bancoComFinance();
  await d.exec(WATCHLIST_BLOCK);
  await assert.rejects(async () => { await s`INSERT INTO watchlist_items (id, user_id, stage, asset, kind, planned_amount_cents, planned_quantity) VALUES (${uuid()}, ${id}, 'comprar', 'X', 'acao', 100, 1)`; }, /watchlist_aporte_unico/);
  await assert.rejects(async () => { await s`INSERT INTO watchlist_items (id, user_id, stage, asset, kind, manual_price_cents) VALUES (${uuid()}, ${id}, 'comprar', 'X', 'acao', 100)`; }, /watchlist_cotacao_datada/);
  await d.close();
});
test('reversão WATCHLIST remove só a lista e deixa carteira e dados financeiros intactos', async () => {
  const { d, s, id } = await bancoComFinance();
  const antes = await fingerprint(d);
  await d.exec(WATCHLIST_BLOCK);
  await s`INSERT INTO watchlist_items (id, user_id, stage, asset, kind) VALUES (${uuid()}, ${id}, 'acompanhar', 'X', 'outro')`;
  await d.exec(WATCHLIST_ROLLBACK);
  assert.equal(await exists(d, 'watchlist_items'), false);
  assert.deepEqual(await fingerprint(d), antes);
  await d.exec(WATCHLIST_BLOCK);
  assert.equal(await exists(d, 'watchlist_items'), true);
  await d.close();
});
