// Teste de fumaça das rotas, rodando contra o mock Express (sem Postgres).
// Uso: inicie o mock (npm run mock) e rode: npm test
import { test } from 'node:test';
import assert from 'node:assert';

const BASE = process.env.TEST_BASE || 'http://localhost:3000';
let cookie = '';

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

test('cadastro cria sessão', async () => {
  const email = `t${Date.now()}@teste.com`;
  const r = await call('POST', '/api/auth/register', { email, password: 'senha12345' });
  assert.strictEqual(r.status, 201);
  assert.ok(r.data.user.id);
});

test('me devolve o usuário logado', async () => {
  const r = await call('GET', '/api/auth/me');
  assert.strictEqual(r.status, 200);
});

test('busca encontra MXRF11', async () => {
  const r = await call('GET', '/api/market/search?q=mxrf');
  assert.strictEqual(r.status, 200);
  assert.ok(r.data.results.some((x) => x.ticker === 'MXRF11'));
});

test('cotação traz preço', async () => {
  const r = await call('GET', '/api/market/quote/HGLG11');
  assert.strictEqual(r.status, 200);
  assert.ok(r.data.price > 0);
});

test('salvar e recarregar a carteira', async () => {
  const save = await call('PUT', '/api/portfolio', {
    version: 0,
    positions: [{ id: 'x1', kind: 'fii', ticker: 'MXRF11', name: 'Maxi', q: 100, c: 9.8 }],
  });
  assert.strictEqual(save.status, 200);
  assert.strictEqual(save.data.version, 1);

  const load = await call('GET', '/api/portfolio');
  assert.strictEqual(load.data.positions.length, 1);
  assert.ok(load.data.positions[0].a > 0, 'cotação automática aplicada');
});

test('conflito de versão retorna 409', async () => {
  const r = await call('PUT', '/api/portfolio', { version: 0, positions: [] });
  assert.strictEqual(r.status, 409);
});
