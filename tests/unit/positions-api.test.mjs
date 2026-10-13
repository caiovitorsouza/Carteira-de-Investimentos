// Rotas reais, sessões fictícias e PGlite. Nenhuma chamada à rede ou ao banco de produção.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { makeDb, makeUser } from './helpers/pgsql.mjs';
import { portfolioRouter } from '../../worker/routes/portfolio.js';
import { loadSnapshot } from '../../worker/repos/portfolio.js';
import { validatePositionMeta } from '../../worker/lib/positions.js';
import { makeConfig } from '../../worker/lib/config.js';
import { createSession, newSessionToken } from '../../worker/lib/auth.js';
import { instrumentKindOf } from '../../worker/services/brapi.js';
import { refreshTickers } from '../../worker/services/quotes.js';

let db, sql, app, cfg, user, token;
before(async () => {
  ({ db, sql } = await makeDb()); cfg = makeConfig({});
  user = await makeUser(sql, 'metadados@example.test'); token = newSessionToken();
  await createSession(sql, user, token, 1);
  app = new Hono(); app.use('/api/*', async (c, next) => { c.set('cfg', cfg); c.set('sql', sql); await next(); });
  app.route('/api/portfolio', portfolioRouter);
});
after(async () => db.close());
const pos = (extra = {}) => ({ id: crypto.randomUUID(), kind: 'cdb', nome: 'Banco fictício', ap: 1000, dt: '2026-01-02', taxa: 105, ...extra });
const save = async (positions) => app.request('/api/portfolio', { method: 'PUT',
  headers: { 'content-type': 'application/json', cookie: cfg.session.cookieName + '=' + token },
  body: JSON.stringify({ version: (await loadSnapshot(sql, user)).version, positions }) });

test('metadados: tipos, limites, enums, datas reais e combinação de liquidez', () => {
  for (const data of [{ emissor: {} }, { emissor: 'x'.repeat(61) }, { emissor: ' X' }, { emissor: 'X\nY' },
    { liq: 'BAD' }, { resgate: 'BAD' }, { liq: 'data' }, { liqData: '2026-01-01' },
    { liq: 'data', liqData: '2026-02-31' }, { venc: '2099-99-99' }, { venc: 20260101 }]) {
    assert.ok(validatePositionMeta(pos(data)), JSON.stringify(data));
  }
  assert.equal(validatePositionMeta(pos({ emissor: 'Banco X', liq: 'data', liqData: '2028-02-29', resgate: 'estavel', venc: '2030-01-01' })), null);
});

test('API: recusa metadados inválidos antes de apagar linhas ou aumentar a versão', async () => {
  const original = pos(); assert.equal((await save([original])).status, 200);
  const before = await loadSnapshot(sql, user);
  for (const over of [{ emissor: {} }, { liq: 'BAD' }, { liq: 'data', liqData: '2026-02-31' }, { venc: '2099-99-99' }, { resgate: [] }]) {
    const r = await save([{ ...original, ...over }]); assert.equal(r.status, 400);
    assert.ok((await r.json()).field);
    assert.deepEqual(await loadSnapshot(sql, user), before);
  }
  assert.equal((await save([null])).status, 400);
  assert.deepEqual(await loadSnapshot(sql, user), before);
});

test('API: persiste e apaga os dados opcionais, preservando taxa, data e outros metadados', async () => {
  const p = pos({ emissor: 'Banco X', liq: 'ate1', resgate: 'estavel', venc: '2027-12-31', observacaoLegada: 'preservar' });
  assert.equal((await save([p])).status, 200);
  assert.deepEqual((await loadSnapshot(sql, user)).positions[0], p);
  const cleared = { ...p, emissor: null, liq: null, resgate: null, venc: null };
  assert.equal((await save([cleared])).status, 200);
  const actual = (await loadSnapshot(sql, user)).positions[0];
  for (const k of ['emissor', 'liq', 'resgate', 'venc']) assert.ok(!(k in actual));
  assert.equal(actual.taxa, 105); assert.equal(actual.dt, p.dt); assert.equal(actual.observacaoLegada, p.observacaoLegada);
});

test('API: dado legado inválido só é preservado no mesmo id e na mesma conta', async () => {
  const p = pos(); await save([p]);
  await sql`UPDATE positions SET meta = ${sql.json({ dt: p.dt, taxa: p.taxa, liq: 'legado', emissor: { nome: 'antigo' } })} WHERE id = ${p.id}`;
  const legacy = (await loadSnapshot(sql, user)).positions[0];
  assert.equal((await save([legacy])).status, 200);
  assert.equal((await save([{ ...legacy, id: crypto.randomUUID() }])).status, 400);
  const other = await makeUser(sql, 'outra-conta@example.test');
  const foreign = pos({ emissor: {} });
  await sql`INSERT INTO positions(id,user_id,kind,name,invested_amount,meta) VALUES (${foreign.id},${other},'cdb','Outro',100,${sql.json({ emissor: {} })})`;
  assert.equal((await save([foreign])).status, 400);
  assert.equal((await loadSnapshot(sql, other)).positions.length, 1);
});

test('classe: o catálogo prevalece sobre a classe enviada pelo cliente; ETF legado não vira FII', async () => {
  await sql`INSERT INTO instruments(ticker,kind,name) VALUES ('ETFQ11','etf','ETF fictício')`;
  const p = pos({ kind: 'fii', ticker: 'ETFQ11', name: 'ETF fictício', q: 10, c: 50, classe: 'acao' });
  delete p.nome; delete p.ap;
  assert.equal((await save([p])).status, 200);
  const out = (await loadSnapshot(sql, user)).positions[0];
  assert.equal(out.classe, 'etf'); assert.equal(out.kind, 'fii'); assert.equal(out.q, 10);
});

test('catálogo: tipo fund e sufixo 11 não distinguem FII e ETF', () => {
  assert.equal(instrumentKindOf({ stock: 'TEST11', type: 'fund' }), 'outro');
  assert.equal(instrumentKindOf({ stock: 'TEST11', subType: 'etf' }), 'etf');
  assert.equal(instrumentKindOf({ subType: 'fii' }), 'fii');
  assert.equal(instrumentKindOf({ subType: 'unit' }), 'acao');
  assert.equal(instrumentKindOf({ type: 'stock' }), 'acao');
  assert.equal(instrumentKindOf({ subType: 'novo', type: 'fund' }), 'outro');
});

test('cotações: atualizar um ETF não o reclassifica nem pede indicadores de FII', async () => {
  const oldFetch = globalThis.fetch, requests = [];
  globalThis.fetch = async url => { requests.push(String(url)); return Response.json({ results: [{ symbol: 'ETFQ11', regularMarketPrice: 55 }] }); };
  try {
    const r = await refreshTickers(sql, cfg, ['ETFQ11']);
    assert.equal(r.ok, 1); assert.equal(requests.length, 1);
    assert.equal((await sql`SELECT kind FROM instruments WHERE ticker='ETFQ11'`)[0].kind, 'etf');
  } finally { globalThis.fetch = oldFetch; }
});
