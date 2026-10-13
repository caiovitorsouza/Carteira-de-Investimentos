// Concorrência REAL: Postgres de verdade (embedded-postgres, só neste teste) com várias conexões
// simultâneas, usando o postgres.js do projeto e o código real de worker/repos/finance.js.
// Verifica que os limites por usuário (recebimentos e metas) não são ultrapassados por pedidos
// simultâneos com IDs distintos, que o reenvio idêntico não duplica e que usuários diferentes
// não se bloqueiam. Sem o módulo `embedded-postgres` o teste é PULADO (visível na saída).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import postgres from 'postgres';
import { createReceipt, createGoal, MAX_GOALS, MAX_RECEIPTS } from '../../worker/repos/finance.js';
import { createWatch, MAX_WATCH } from '../../worker/repos/watchlist.js';
import { FINANCE_BLOCK, WATCHLIST_BLOCK } from './helpers/pgsql.mjs';

let EmbeddedPostgres = null;
try { ({ default: EmbeddedPostgres } = await import(process.env.EMBEDDED_PG_MODULE || 'embedded-postgres')); } catch { /* opcional */ }
const skip = EmbeddedPostgres ? false : 'módulo embedded-postgres ausente (npm i --no-save embedded-postgres, ou defina EMBEDDED_PG_MODULE)';

const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });
let pg, dir, port, admin, pool;
const uuid = () => crypto.randomUUID();

before(async () => {
  if (skip) return;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rendum-pg-'));
  port = await freePort();
  // A pasta continua temporária; sua remoção é controlada e validada abaixo.
  pg = new EmbeddedPostgres({ databaseDir: path.join(dir, 'data'), user: 'postgres', password: 'teste-local', port, persistent: true, onLog: () => {}, onError: () => {} });
  await pg.initialise(); await pg.start(); await pg.createDatabase('rendum_test');
  const url = `postgres://postgres:teste-local@127.0.0.1:${port}/rendum_test`;
  admin = postgres(url, { max: 1, onnotice: () => {} });
  await admin.unsafe(`CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE NOT NULL)`);
  await admin.unsafe(FINANCE_BLOCK);
  await admin.unsafe(WATCHLIST_BLOCK);
  // pool com várias conexões, como o Worker em produção (prepare:false = pooler de transações)
  pool = postgres(url, { max: 20, prepare: false, onnotice: () => {}, types: { bigint: { to: 20, from: [20], serialize: String, parse: (v) => parseInt(v, 10) } } });
});
after(async () => {
  if (skip) return;
  await pool?.end({ timeout: 2 }); await admin?.end({ timeout: 2 });
  if (process.platform === 'win32' && pg?.process?.pid && pg.process.exitCode === null) {
    // pg.stop usa taskkill, que pode deixar o io_worker órfão no Windows.
    // pg_ctl encerra o cluster deste teste e aguarda todos os seus filhos.
    const { pg_ctl } = await import('@embedded-postgres/windows-' + process.arch);
    const exited = once(pg.process, 'exit');
    await promisify(execFile)(pg_ctl, ['stop', '-D', path.join(dir, 'data'), '-m', 'fast', '-w', '-t', '10'], { windowsHide: true });
    await exited;
    pg.process = undefined; // evita novo stop do processo já encerrado no exit hook da biblioteca
  } else await pg?.stop();
  if (dir) {
    // O taskkill usado pelo embedded-postgres pode retornar antes de o Windows
    // liberar os arquivos. Só removemos a pasta temporária criada por este teste.
    const target = path.resolve(dir);
    if (path.dirname(target) !== path.resolve(os.tmpdir()) || !path.basename(target).startsWith('rendum-pg-')) {
      throw new Error('Diretório temporário de teste inesperado: ' + target);
    }
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});
const newUser = async (n) => (await admin`INSERT INTO users (email) VALUES (${n + '.' + uuid() + '@example.test'}) RETURNING id`)[0].id;
const receipt = (i = 0) => ({ asset: 'TEST11', receivedOn: '2026-10-01', amountCents: 100 + i, note: null });
const goal = (i = 0) => ({ kind: 'patrimonio', name: 'm' + i, targetCents: 1000 + i, deadline: null });

test('conexões simultâneas existem de fato (pré-requisito do teste)', { skip }, async () => {
  const pids = await Promise.all(Array.from({ length: 8 }, () => pool`SELECT pg_backend_pid() AS p, pg_sleep(0.3)`.then((r) => r[0].p)));
  assert.ok(new Set(pids).size >= 4, 'esperava várias conexões distintas, veio ' + new Set(pids).size);
});

test(`metas: 12 pedidos simultâneos com a conta em ${MAX_GOALS - 1}/${MAX_GOALS} não ultrapassam o limite`, { skip }, async () => {
  const u = await newUser('metas');
  await admin`INSERT INTO financial_goals (id, user_id, kind, name, target_cents)
              SELECT gen_random_uuid(), ${u}, 'patrimonio', 'g' || g, 100 FROM generate_series(1, ${MAX_GOALS - 1}) g`;
  const res = await Promise.all(Array.from({ length: 12 }, (_, i) => createGoal(pool, u, uuid(), goal(i))));
  const criadas = res.filter((r) => r && r.created).length;
  const total = (await admin`SELECT count(*)::int n FROM financial_goals WHERE user_id = ${u}`)[0].n;
  assert.equal(total, MAX_GOALS, `total no banco: ${total} (limite ${MAX_GOALS})`);
  assert.equal(criadas, 1, 'só uma criação cabia');
  assert.equal(res.filter((r) => r && r.limit).length, 11, 'as demais recebem "limite atingido"');
});

test(`recebimentos: 12 pedidos simultâneos com a conta em ${MAX_RECEIPTS - 1}/${MAX_RECEIPTS} não ultrapassam o limite`, { skip }, async () => {
  const u = await newUser('rec');
  await admin`INSERT INTO dividend_receipts (id, user_id, asset, received_on, amount_cents)
              SELECT gen_random_uuid(), ${u}, 'TEST11', '2026-01-01', 100 FROM generate_series(1, ${MAX_RECEIPTS - 1})`;
  const res = await Promise.all(Array.from({ length: 12 }, (_, i) => createReceipt(pool, u, uuid(), receipt(i))));
  const total = (await admin`SELECT count(*)::int n FROM dividend_receipts WHERE user_id = ${u}`)[0].n;
  assert.equal(total, MAX_RECEIPTS, `total no banco: ${total} (limite ${MAX_RECEIPTS})`);
  assert.equal(res.filter((r) => r && r.created).length, 1);
  assert.equal(res.filter((r) => r && r.limit).length, 11);
});

test('reenvio simultâneo do MESMO id não duplica nem estoura o limite', { skip }, async () => {
  const u = await newUser('dup');
  const id = uuid();
  const res = await Promise.all(Array.from({ length: 10 }, () => createReceipt(pool, u, id, receipt())));
  assert.equal((await admin`SELECT count(*)::int n FROM dividend_receipts WHERE id = ${id}`)[0].n, 1);
  assert.equal(res.filter((r) => r && r.created).length, 1);
  assert.equal(res.filter((r) => r && r.row && !r.created).length, 9, 'as demais devolvem o registro já salvo');
});

test('um id que pertence a outro usuário continua resultando em conflito, mesmo sob concorrência', { skip }, async () => {
  const a = await newUser('a'), b = await newUser('b');
  const id = uuid();
  await createReceipt(pool, a, id, receipt());
  const res = await Promise.all(Array.from({ length: 6 }, () => createReceipt(pool, b, id, receipt(5))));
  assert.ok(res.every((r) => r === null), 'nenhuma resposta pode tomar o registro do outro usuário');
  assert.equal((await admin`SELECT user_id FROM dividend_receipts WHERE id = ${id}`)[0].user_id, a);
});

test('usuários diferentes não se bloqueiam: um usuário cheio não atrasa os outros', { skip }, async () => {
  const cheio = await newUser('cheio'), livres = await Promise.all([newUser('l1'), newUser('l2'), newUser('l3'), newUser('l4')]);
  // segura o "bloqueio" do usuário cheio numa transação aberta e mede os outros usuários nesse intervalo
  const seg = admin.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${'finance:receipts:' + cheio}, 0))`;
    await new Promise((r) => setTimeout(r, 1500));
  });
  await new Promise((r) => setTimeout(r, 200));
  const t0 = Date.now();
  const rs = await Promise.all(livres.map((u) => createReceipt(pool, u, uuid(), receipt())));
  const dt = Date.now() - t0;
  await seg;
  assert.ok(rs.every((r) => r && r.created), 'todos os outros usuários criaram normalmente');
  assert.ok(dt < 1000, `outros usuários não esperaram o bloqueio de ${cheio} (${dt} ms)`);
});

const watch = (i = 0) => ({ stage: 'comprar', asset: 'W' + i, kind: 'outro', name: null, reason: null, notes: null, priority: null,
  targetPriceCents: null, plannedAmountCents: 1000 + i, plannedQuantity: null, manualPriceCents: null, manualPriceOn: null });
test(`lista de interesse: 12 pedidos simultâneos com a conta em ${MAX_WATCH - 1}/${MAX_WATCH} não ultrapassam o limite; reenvio não duplica`, { skip }, async () => {
  const u = await newUser('lista');
  await admin`INSERT INTO watchlist_items (id, user_id, stage, asset, kind)
              SELECT gen_random_uuid(), ${u}, 'acompanhar', 'A' || g, 'outro' FROM generate_series(1, ${MAX_WATCH - 1}) g`;
  const res = await Promise.all(Array.from({ length: 12 }, (_, i) => createWatch(pool, u, uuid(), watch(i))));
  assert.equal((await admin`SELECT count(*)::int n FROM watchlist_items WHERE user_id = ${u}`)[0].n, MAX_WATCH);
  assert.equal(res.filter((r) => r && r.created).length, 1);
  assert.equal(res.filter((r) => r && r.limit).length, 11);
  const v = await newUser('lista-dup'); const id = uuid();
  const rs = await Promise.all(Array.from({ length: 8 }, () => createWatch(pool, v, id, watch())));
  assert.equal((await admin`SELECT count(*)::int n FROM watchlist_items WHERE id = ${id}`)[0].n, 1);
  assert.equal(rs.filter((r) => r && r.created).length, 1);
});

test('mesmo usuário: pedidos serializam pelo bloqueio por usuário (a operação espera, não falha)', { skip }, async () => {
  const u = await newUser('serial');
  const rs = await Promise.all(Array.from({ length: 30 }, (_, i) => createReceipt(pool, u, uuid(), receipt(i))));
  assert.equal(rs.filter((r) => r && r.created).length, 30);
  assert.equal((await admin`SELECT count(*)::int n FROM dividend_receipts WHERE user_id = ${u}`)[0].n, 30);
});
