// Entry point do Cloudflare Worker.
// Servimos a API (/api/*) com Hono + Postgres (Supabase).
// Assets estáticos de public/ são servidos pelo binding [assets] do
// wrangler.toml — a plataforma tenta o asset primeiro; se não existe,
// cai aqui e o worker delega de volta via env.ASSETS.fetch() quando a
// rota não é /api/*.

import { Hono } from 'hono';
import { makeConfig } from './lib/config.js';
import { makeSql, closeSql } from './lib/db.js';
import { authRouter } from './routes/auth.js';
import { marketRouter } from './routes/market.js';
import { portfolioRouter } from './routes/portfolio.js';
import { userRouter } from './routes/user.js';
import { adminRouter } from './routes/admin.js';
import { handleScheduled } from './jobs/scheduled.js';

const app = new Hono();

// Middleware das rotas /api/*: injeta cfg + sql e fecha o pool no fim
// via ctx.waitUntil (sem bloquear a response).
app.use('/api/*', async (c, next) => {
  const cfg = makeConfig(c.env);
  const sql = makeSql(c.env);
  c.set('cfg', cfg);
  c.set('sql', sql);
  try {
    await next();
  } finally {
    c.executionCtx.waitUntil(closeSql(sql));
  }
});

// Health check
app.get('/api/health', (c) => c.json({ ok: true, ts: Date.now() }));

// Rotas da API
app.route('/api/auth', authRouter);
app.route('/api/market', marketRouter);
app.route('/api/portfolio', portfolioRouter);
app.route('/api/user', userRouter);
app.route('/api/admin', adminRouter);

// Erros centrais → JSON 500
app.onError((err, c) => {
  console.error('[erro]', err.message, err.stack);
  return c.json({ error: 'erro_interno' }, 500);
});

// 404: /api/* respondem JSON; qualquer outra coisa (ex: SPA deep link)
// delega pros assets, que já têm not_found_handling="single-page-application"
// e vão servir index.html.
app.notFound((c) => {
  const p = new URL(c.req.url).pathname;
  if (p.startsWith('/api/')) return c.json({ error: 'rota_nao_encontrada' }, 404);
  // Deep link SPA — devolve pro assets binding
  return c.env.ASSETS.fetch(c.req.raw);
});

export default {
  async fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleScheduled(event, env, ctx));
  },
};
