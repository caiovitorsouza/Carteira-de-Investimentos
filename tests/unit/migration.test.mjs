// Migração FINANCE em banco isolado (PGlite), partindo do schema ANTERIOR com dados no formato antigo.
// Garante: dados preservados, código já publicado inalterado, idempotência, RLS e reversão limpa.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSnapshot } from '../../worker/repos/portfolio.js';
import { makeRawDb, OLD_SCHEMA, SCHEMA, FINANCE_BLOCK, ROLLBACK } from './helpers/pgsql.mjs';

const NEW_TABLES = ['dividend_receipts', 'financial_goals', 'emergency_reserve', 'user_simulators'];
const OLD_TABLES = ['users', 'sessions', 'instruments', 'market_quotes', 'dividends', 'positions',
  'user_documents', 'portfolio_snapshots', 'refresh_runs', 'market_rates', 'email_log'];
const pid = (n) => `00000000-0000-4000-8000-00000000000${n}`;

async function legacyDb() {
  const { db, sql } = await makeRawDb();
  await db.exec(OLD_SCHEMA);
  const [{ id: uid }] = await sql`INSERT INTO users (email, password_hash, portfolio_version, first_name)
    VALUES ('legado.ficticio@example.test', 'hash-ficticio', 7, 'Legado') RETURNING id`;
  await sql`INSERT INTO users (email, password_hash) VALUES ('outro.ficticio@example.test', 'x')`;
  await sql`INSERT INTO instruments (ticker, name, kind) VALUES ('TEST11', 'Fundo Teste', 'fii'), ('TEST3', 'Acao Teste', 'acao')`;
  await sql`INSERT INTO market_quotes (ticker, price, dy_12m, last_dividend, last_ex_date, last_pay_date, pvp, fetched_at)
    VALUES ('TEST11', 101.5, 9.8, 0.9, '2026-09-30', '2026-10-15', 0.95, now())`;
  await sql`INSERT INTO dividends (ticker, ex_date, pay_date, amount) VALUES ('TEST11', '2026-09-30', '2026-10-15', 0.9)`;
  const P = [
    [pid(1), 'fii', 'TEST11', null, 10, 100, null, { t: 'tijolo', rec: 0, segment: 'tijolo_log' }],
    [pid(2), 'acao', 'TEST3', null, 5, 20.5, null, { sector: 'bancos' }],
    [pid(3), 'selic', null, 'Tesouro Selic', null, null, 1500.5, { dt: '2026-01-02' }],
    [pid(4), 'cdb', null, 'CDB Banco X', null, null, 2000, { taxa: 110, dt: '2026-02-03', venc: '2028-02-03' }],
    [pid(5), 'pre', null, 'Prefixado', null, null, 800, { taxa: 12.5 }],
    [pid(6), 'ipca', null, 'IPCA+', null, null, 900, { taxa: 6.9 }],
    [pid(7), 'lci', null, 'LCI', null, null, 700, {}],
    [pid(8), 'lca', null, 'LCA', null, null, 600, {}],
    [pid(9), 'fundo', null, 'Fundo', null, null, 500, { taxa: 10 }],
  ];
  for (const [id, kind, ticker, name, q, c, ap, meta] of P) {
    await sql`INSERT INTO positions (id, user_id, kind, ticker, name, quantity, avg_price, invested_amount, meta)
      VALUES (${id}, ${uid}, ${kind}, ${ticker}, ${name}, ${q}, ${c}, ${ap}, ${sql.json(meta)})`;
  }
  await sql`INSERT INTO user_documents (user_id, key, data) VALUES (${uid}, 'profile', ${sql.json({ perfil: 'moderado' })}),
    (${uid}, 'settings', ${sql.json({ tema: 'escuro' })}), (${uid}, 'legacy', ${sql.json({ v: 1 })})`;
  await sql`INSERT INTO portfolio_snapshots (user_id, day, total_value) VALUES (${uid}, '2026-10-01', 9000.55), (${uid}, '2026-10-02', 9100.1)`;
  await sql`INSERT INTO market_rates (key, value, source) VALUES ('selic', 14.25, 'bcb'), ('cdi', 14.15, 'fallback')`;
  await sql`INSERT INTO email_log (user_id, kind) VALUES (${uid}, 'weekly')`;
  await db.exec(`INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ('${uid}', '\\x0102'::bytea, now() + interval '1 day')`);
  return { db, sql, uid };
}
// "impressão digital" de cada tabela anterior: contagem + hash de todas as linhas
const fingerprint = async (db) => {
  const out = {};
  for (const t of OLD_TABLES) {
    out[t] = (await db.query(`SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY to_jsonb(x)::text), '')) AS h, count(*)::int AS n FROM ${t} x`)).rows[0];
  }
  return out;
};
const tableExists = async (db, t) => (await db.query('SELECT to_regclass($1) AS r', ['public.' + t])).rows[0].r !== null;

test('migração sobre dados no formato anterior preserva tudo e não altera o que o código publicado lê', async () => {
  const { db, sql, uid } = await legacyDb();
  const antes = await fingerprint(db);
  const snapAntes = await loadSnapshot(sql, uid);
  assert.equal(snapAntes.positions.length, 9);
  assert.equal(snapAntes.version, 7);
  for (const t of NEW_TABLES) assert.equal(await tableExists(db, t), false, t + ' ainda não deveria existir');

  await db.exec(SCHEMA);                         // schema novo completo (o que `npm run db:migrate` executa)
  assert.deepEqual(await fingerprint(db), antes, 'nenhuma linha de nenhuma tabela anterior mudou');
  assert.deepEqual(await loadSnapshot(sql, uid), snapAntes, 'o leitor da carteira (código já publicado) devolve o mesmo resultado');
  for (const t of NEW_TABLES) assert.equal((await db.query(`SELECT count(*)::int n FROM ${t}`)).rows[0].n, 0, t + ' começa vazia');
  await db.close();
});

test('aplicar só o bloco FINANCE (aditivo) sobre o schema anterior é suficiente e não toca nas tabelas antigas', async () => {
  const { db, sql, uid } = await legacyDb();
  const antes = await fingerprint(db);
  const snapAntes = await loadSnapshot(sql, uid);
  await db.exec(FINANCE_BLOCK);
  assert.deepEqual(await fingerprint(db), antes);
  assert.deepEqual(await loadSnapshot(sql, uid), snapAntes);
  for (const t of NEW_TABLES) assert.equal(await tableExists(db, t), true, t);
  await db.close();
});

test('reaplicação é segura (idempotente), inclusive depois de haver dados novos', async () => {
  const { db, sql, uid } = await legacyDb();
  await db.exec(SCHEMA);
  await sql`INSERT INTO dividend_receipts (id, user_id, asset, received_on, amount_cents) VALUES ('11111111-1111-4111-8111-111111111111', ${uid}, 'TEST11', '2026-10-01', 4242)`;
  await sql`INSERT INTO emergency_reserve (user_id, monthly_expense_cents, months, linked_position_ids) VALUES (${uid}, 300000, 6, ${sql.json([pid(3)])})`;
  const antes = await fingerprint(db);
  await db.exec(SCHEMA); await db.exec(FINANCE_BLOCK); await db.exec(SCHEMA);
  assert.deepEqual(await fingerprint(db), antes);
  assert.equal((await db.query(`SELECT amount_cents::text t FROM dividend_receipts`)).rows[0].t, '4242');
  assert.equal((await db.query(`SELECT months FROM emergency_reserve`)).rows[0].months, 6);
  await db.close();
});

test('as tabelas novas têm RLS ligado e sem políticas, como as demais', async () => {
  const { db } = await legacyDb();
  await db.exec(SCHEMA);
  const rows = (await db.query(`SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1)`, [NEW_TABLES])).rows;
  assert.equal(rows.length, 4);
  for (const r of rows) assert.equal(r.relrowsecurity, true, r.relname);
  assert.equal((await db.query(`SELECT count(*)::int n FROM pg_policies WHERE schemaname = 'public'`)).rows[0].n, 0);
  await db.close();
});

test('reversão remove só as tabelas novas e deixa o restante exatamente como estava', async () => {
  const { db, sql, uid } = await legacyDb();
  const antes = await fingerprint(db);
  await db.exec(SCHEMA);
  await sql`INSERT INTO financial_goals (id, user_id, kind, name, target_cents) VALUES ('22222222-2222-4222-8222-222222222222', ${uid}, 'patrimonio', 'x', 100)`;
  await db.exec(ROLLBACK);
  for (const t of NEW_TABLES) assert.equal(await tableExists(db, t), false, t);
  assert.deepEqual(await fingerprint(db), antes);
  await db.exec(SCHEMA);                         // reaplicar depois da reversão também funciona
  for (const t of NEW_TABLES) assert.equal(await tableExists(db, t), true, t);
  await db.close();
});
