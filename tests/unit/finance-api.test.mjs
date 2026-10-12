// Persistência, isolamento por usuário e migração: rotas REAIS do Worker contra um Postgres
// em memória (PGlite) com o db/schema.sql completo. Somente contas e dados fictícios.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { financeRouter } from '../../worker/routes/finance.js';
import { makeConfig } from '../../worker/lib/config.js';
import { createSession, newSessionToken } from '../../worker/lib/auth.js';
import { MAX_GOALS } from '../../worker/repos/finance.js';
import { makeDb, makeUser, SCHEMA } from './helpers/pgsql.mjs';

let db, sql, app, A, B, tokA, tokB, cfg;
const uuid = () => crypto.randomUUID();

before(async () => {
  ({ db, sql } = await makeDb());
  cfg = makeConfig({});
  app = new Hono();
  app.use('/api/*', async (c, next) => { c.set('cfg', cfg); c.set('sql', sql); await next(); });
  app.route('/api/finance', financeRouter);
  A = await makeUser(sql, 'ana.ficticia@example.test');
  B = await makeUser(sql, 'beto.ficticio@example.test');
  tokA = newSessionToken(); tokB = newSessionToken();
  await createSession(sql, A, tokA, 1);
  await createSession(sql, B, tokB, 1);
});
after(async () => { await db.close(); });

const call = (tok, method, path, body) => app.request('/api/finance' + path, {
  method,
  headers: { 'content-type': 'application/json', ...(tok ? { cookie: `${cfg.session.cookieName}=${tok}` } : {}) },
  body: body === undefined || method === 'GET' ? undefined : JSON.stringify(body),
});
const json = async (res) => res.json();
const rec = (over = {}) => ({ id: uuid(), asset: 'mxrf11', receivedOn: '2026-01-31', amountCents: 12345, note: 'teste', ...over });

test('exige sessão em todas as rotas', async () => {
  for (const [m, p] of [['GET', ''], ['POST', '/receipts'], ['PUT', '/reserve'], ['DELETE', '/goals/' + uuid()], ['PUT', '/simulators/bazin']]) {
    assert.equal((await call(null, m, p, {})).status, 401, `${m} ${p}`);
    assert.equal((await call('token-falso', m, p, {})).status, 401);
  }
});

test('migração é idempotente e preserva carteiras existentes', async () => {
  await sql`INSERT INTO instruments (ticker, name, kind) VALUES ('TEST11', 'Fundo Teste', 'fii')`;
  const pid = uuid();
  await sql`INSERT INTO positions (id, user_id, kind, ticker, quantity, avg_price) VALUES (${pid}, ${A}, 'fii', 'TEST11', 10, 100)`;
  await sql`INSERT INTO positions (id, user_id, kind, name, invested_amount) VALUES (${uuid()}, ${A}, 'cdb', 'CDB Teste', 1500)`;
  await sql`INSERT INTO portfolio_snapshots (user_id, day, total_value) VALUES (${A}, '2026-01-01', 1234.56)`;
  const antes = await sql`SELECT id, kind, ticker, quantity, avg_price, invested_amount FROM positions WHERE user_id = ${A} ORDER BY id`;
  await db.exec(SCHEMA);       // 2ª aplicação do schema inteiro
  await db.exec(SCHEMA);       // e 3ª
  const depois = await sql`SELECT id, kind, ticker, quantity, avg_price, invested_amount FROM positions WHERE user_id = ${A} ORDER BY id`;
  assert.deepEqual(depois, antes);
  assert.equal(depois.length, 2);
  assert.equal((await sql`SELECT count(*)::int n FROM portfolio_snapshots WHERE user_id = ${A}`)[0].n, 1);
  // conta antiga sem nenhum dado novo: GET devolve estruturas vazias
  const g = await json(await call(tokA, 'GET', ''));
  assert.deepEqual(g, { receipts: [], goals: [], reserve: null, simulators: {} });
});

test('recebimento: cria, persiste centavos inteiros e data de calendário sem deslocamento', async () => {
  const r = rec({ id: uuid(), receivedOn: '2026-01-31', amountCents: 10 });
  const res = await call(tokA, 'POST', '/receipts', r);
  assert.equal(res.status, 201);
  const out = await json(res);
  assert.equal(out.created, true);
  assert.equal(out.receipt.asset, 'MXRF11');                  // ticker normalizado
  assert.equal(out.receipt.receivedOn, '2026-01-31');
  assert.equal(out.receipt.amountCents, 10);
  assert.ok(Number.isInteger(out.receipt.amountCents));
  const g = await json(await call(tokA, 'GET', ''));
  assert.equal(g.receipts.length, 1);
  assert.deepEqual(g.receipts[0], { id: r.id, asset: 'MXRF11', receivedOn: '2026-01-31', amountCents: 10, note: 'teste' });
  // valor guardado como bigint no banco
  assert.equal((await sql`SELECT amount_cents::text t FROM dividend_receipts WHERE id = ${r.id}`)[0].t, '10');
});

test('recebimento não altera carteira, posições nem versão do portfólio', async () => {
  const antes = await sql`SELECT (SELECT count(*)::int FROM positions) p, (SELECT count(*)::int FROM portfolio_snapshots) s,
    (SELECT portfolio_version FROM users WHERE id = ${A}) v, (SELECT coalesce(sum(invested_amount),0)::text FROM positions) i,
    (SELECT coalesce(sum(quantity),0)::text FROM positions) q`;
  const res = await call(tokA, 'POST', '/receipts', rec({ asset: 'TEST11', amountCents: 999999 }));
  assert.equal(res.status, 201);
  const depois = await sql`SELECT (SELECT count(*)::int FROM positions) p, (SELECT count(*)::int FROM portfolio_snapshots) s,
    (SELECT portfolio_version FROM users WHERE id = ${A}) v, (SELECT coalesce(sum(invested_amount),0)::text FROM positions) i,
    (SELECT coalesce(sum(quantity),0)::text FROM positions) q`;
  assert.deepEqual(depois, antes);
});

test('reenvio do mesmo id não duplica (idempotência)', async () => {
  const r = rec();
  const a = await call(tokA, 'POST', '/receipts', r);
  const b = await call(tokA, 'POST', '/receipts', r);
  assert.equal(a.status, 201);
  assert.equal(b.status, 200);
  assert.equal((await json(b)).created, false);
  assert.equal((await sql`SELECT count(*)::int n FROM dividend_receipts WHERE id = ${r.id}`)[0].n, 1);
});

test('isolamento: outro usuário não vê, não altera, não apaga e não toma o id', async () => {
  const r = rec({ asset: 'KNRI11', amountCents: 5000 });
  assert.equal((await call(tokA, 'POST', '/receipts', r)).status, 201);

  const gB = await json(await call(tokB, 'GET', ''));
  assert.equal(gB.receipts.length, 0);

  assert.equal((await call(tokB, 'PUT', '/receipts/' + r.id, { ...r, amountCents: 1 })).status, 404);
  assert.equal((await call(tokB, 'DELETE', '/receipts/' + r.id)).status, 404);
  const tomar = await call(tokB, 'POST', '/receipts', { ...r, amountCents: 1 });
  assert.equal(tomar.status, 409);
  assert.equal((await json(tomar)).error, 'id_em_uso');

  const row = (await sql`SELECT user_id, amount_cents::text t FROM dividend_receipts WHERE id = ${r.id}`)[0];
  assert.equal(row.user_id, A);
  assert.equal(row.t, '5000');
  assert.equal((await sql`SELECT count(*)::int n FROM dividend_receipts WHERE user_id = ${B}`)[0].n, 0);
});

test('editar e excluir recebimento; segunda exclusão responde 404', async () => {
  const r = rec({ asset: 'HGLG11', amountCents: 100 });
  await call(tokA, 'POST', '/receipts', r);
  const put = await call(tokA, 'PUT', '/receipts/' + r.id, { ...r, amountCents: 250, receivedOn: '2026-02-28', note: '' });
  assert.equal(put.status, 200);
  const got = (await json(put)).receipt;
  assert.equal(got.amountCents, 250);
  assert.equal(got.receivedOn, '2026-02-28');
  assert.equal(got.note, null);
  assert.equal((await call(tokA, 'DELETE', '/receipts/' + r.id)).status, 200);
  assert.equal((await call(tokA, 'DELETE', '/receipts/' + r.id)).status, 404);
  assert.equal((await sql`SELECT count(*)::int n FROM dividend_receipts WHERE id = ${r.id}`)[0].n, 0);
});

test('validação do servidor recusa valores, datas e textos inválidos sem gravar nada', async () => {
  const antes = (await sql`SELECT count(*)::int n FROM dividend_receipts`)[0].n;
  const casos = [
    { amountCents: 0 }, { amountCents: -5 }, { amountCents: 1.5 }, { amountCents: '100' }, { amountCents: null },
    { amountCents: 10 ** 14 }, { receivedOn: '2026-02-30' }, { receivedOn: '31/01/2026' }, { receivedOn: '2026-01-31T00:00:00Z' },
    { receivedOn: '2099-01-01' }, { asset: '' }, { asset: '   ' }, { asset: 'x'.repeat(41) }, { note: 'n'.repeat(201) },
    { id: 'nao-e-uuid' },
  ];
  for (const c of casos) {
    const res = await call(tokA, 'POST', '/receipts', rec(c));
    assert.equal(res.status, 400, JSON.stringify(c));
  }
  assert.equal((await sql`SELECT count(*)::int n FROM dividend_receipts`)[0].n, antes);
  assert.equal((await call(tokA, 'POST', '/receipts', null)).status, 400);
});

test('metas: criar, editar, excluir, limite e isolamento', async () => {
  const g = { id: uuid(), kind: 'patrimonio', name: '  Meta  de   100 mil ', targetCents: 10_000_000, deadline: '2030-12-31' };
  const c = await call(tokA, 'POST', '/goals', g);
  assert.equal(c.status, 201);
  assert.equal((await json(c)).goal.name, 'Meta de 100 mil');
  assert.equal((await call(tokA, 'POST', '/goals', g)).status, 200);          // reenvio
  assert.equal((await sql`SELECT count(*)::int n FROM financial_goals WHERE id = ${g.id}`)[0].n, 1);
  const up = await call(tokA, 'PUT', '/goals/' + g.id, { ...g, kind: 'renda_mensal', targetCents: 500000, deadline: null });
  assert.equal((await json(up)).goal.deadline, null);
  assert.equal((await call(tokB, 'PUT', '/goals/' + g.id, g)).status, 404);
  assert.equal((await call(tokB, 'DELETE', '/goals/' + g.id)).status, 404);
  assert.equal((await call(tokB, 'POST', '/goals', g)).status, 409);
  for (const bad of [{ kind: 'x' }, { name: '' }, { targetCents: 0 }, { targetCents: 1.2 }, { deadline: '2026-02-31' }]) {
    assert.equal((await call(tokA, 'POST', '/goals', { ...g, id: uuid(), ...bad })).status, 400, JSON.stringify(bad));
  }
  assert.equal((await call(tokA, 'DELETE', '/goals/' + g.id)).status, 200);
  // limite por usuário
  for (let i = 0; i < MAX_GOALS; i++) assert.equal((await call(tokB, 'POST', '/goals', { ...g, id: uuid(), name: 'm' + i })).status, 201);
  assert.equal((await call(tokB, 'POST', '/goals', { ...g, id: uuid() })).status, 422);
  await sql`DELETE FROM financial_goals WHERE user_id = ${B}`;
});

test('reserva: salva, atualiza, valida vínculos, isola e remove', async () => {
  const r = { monthlyExpenseCents: 300000, months: 6, linkedPositionIds: ['pos-1', 'pos-1', 'pos_2'] };
  const put = await call(tokA, 'PUT', '/reserve', r);
  assert.equal(put.status, 200);
  assert.deepEqual((await json(put)).reserve, { monthlyExpenseCents: 300000, months: 6, linkedPositionIds: ['pos-1', 'pos_2'] });
  await call(tokA, 'PUT', '/reserve', { ...r, months: 12, linkedPositionIds: [] });
  assert.equal((await sql`SELECT count(*)::int n FROM emergency_reserve WHERE user_id = ${A}`)[0].n, 1);   // upsert
  assert.equal((await json(await call(tokB, 'GET', ''))).reserve, null);
  for (const bad of [{ monthlyExpenseCents: 0 }, { months: 0 }, { months: 61 }, { months: 1.5 }, { linkedPositionIds: 'x' },
    { linkedPositionIds: ['a b'] }, { linkedPositionIds: Array(101).fill('a') }, { monthlyExpenseCents: 9_000_000_000_000, months: 60 }]) {
    assert.equal((await call(tokA, 'PUT', '/reserve', { ...r, ...bad })).status, 400, JSON.stringify(bad));
  }
  assert.equal((await call(tokB, 'DELETE', '/reserve')).status, 404);
  assert.equal((await call(tokA, 'DELETE', '/reserve')).status, 200);
  assert.equal((await json(await call(tokA, 'GET', ''))).reserve, null);
});

test('premissas dos simuladores: persistem por usuário e rejeitam inválidas', async () => {
  const ind = { initialCents: null, monthlyContributionCents: 70000, desiredIncomeCents: 400000, returnBp: 1100, incomeRateBp: 650, inflationBp: 450, extra: 'ignorado' };
  const put = await call(tokA, 'PUT', '/simulators/independence', ind);
  assert.equal(put.status, 200);
  const g = await json(await call(tokA, 'GET', ''));
  assert.equal(g.simulators.independence.returnBp, 1100);
  assert.equal(g.simulators.independence.inflationBp, 450);
  assert.equal(g.simulators.independence.initialCents, null);
  assert.equal('extra' in g.simulators.independence, false);
  assert.deepEqual((await json(await call(tokB, 'GET', ''))).simulators, {});
  const bz = { ticker: 'bbas3', priceCents: 5620, annualDividendCents: 480, rateBp: 600, priceOrigin: 'ilustrativo', dividendOrigin: 'manual' };
  assert.equal((await call(tokA, 'PUT', '/simulators/bazin', bz)).status, 200);
  const g2 = await json(await call(tokA, 'GET', ''));
  assert.equal(g2.simulators.bazin.ticker, 'BBAS3');
  assert.equal(g2.simulators.bazin.priceOrigin, 'ilustrativo');
  assert.equal(g2.simulators.bazin.dividendOrigin, 'manual');
  for (const bad of [{ rateBp: 0 }, { rateBp: 10001 }, { annualDividendCents: 0 }, { annualDividendCents: 1.5 }, { priceCents: -1 }]) {
    assert.equal((await call(tokA, 'PUT', '/simulators/bazin', { ...bz, ...bad })).status, 400, JSON.stringify(bad));
  }
  for (const bad of [{ desiredIncomeCents: 0 }, { incomeRateBp: 0 }, { returnBp: -6000 }, { inflationBp: -1 }, { monthlyContributionCents: -5 }]) {
    assert.equal((await call(tokA, 'PUT', '/simulators/independence', { ...ind, ...bad })).status, 400, JSON.stringify(bad));
  }
  assert.equal((await call(tokA, 'PUT', '/simulators/outro', ind)).status, 400);
  assert.equal((await call(tokB, 'DELETE', '/simulators/bazin')).status, 404);
  assert.equal((await call(tokA, 'DELETE', '/simulators/bazin')).status, 200);
});

test('excluir a conta remove os dados financeiros (cascata)', async () => {
  const C = await makeUser(sql, 'carla.ficticia@example.test');
  const tok = newSessionToken(); await createSession(sql, C, tok, 1);
  await call(tok, 'POST', '/receipts', rec());
  await call(tok, 'POST', '/goals', { id: uuid(), kind: 'patrimonio', name: 'x', targetCents: 100 });
  await call(tok, 'PUT', '/reserve', { monthlyExpenseCents: 100, months: 1, linkedPositionIds: [] });
  await call(tok, 'PUT', '/simulators/bazin', { priceCents: null, annualDividendCents: 100, rateBp: 600 });
  await sql`DELETE FROM users WHERE id = ${C}`;
  for (const t of ['dividend_receipts', 'financial_goals', 'emergency_reserve', 'user_simulators']) {
    assert.equal((await db.query(`SELECT count(*)::int n FROM ${t} WHERE user_id = $1`, [C])).rows[0].n, 0, t);
  }
});
