// Servidor de DEMONSTRAÇÃO, sem Postgres e sem Brapi. Guarda tudo na memória.
// Serve para você ver login + busca + cotação automática funcionando antes de
// instalar o banco. Uso: npm run mock   (abre http://localhost:3000)
//
// NÃO use em produção: dados somem quando o processo reinicia e a senha é
// comparada em texto puro só para simplificar a demonstração.
import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(cookieParser());

const users = new Map();     // email -> { id, email, password }
const sessions = new Map();  // token -> userId
const carteiras = new Map(); // userId -> snapshot
let seq = 1;

// Catálogo e cotações fictícios (bastam para a demonstração do autocompletar).
const CAT = [
  { ticker: 'MXRF11', name: 'Maxi Renda FII', kind: 'fii', sector: 'Papel', price: 10.42, dy_12m: 12.8, pvp: 1.01, last_dividend: 0.10 },
  { ticker: 'HGLG11', name: 'CSHG Logística FII', kind: 'fii', sector: 'Logística', price: 158.3, dy_12m: 8.4, pvp: 0.92, last_dividend: 1.10 },
  { ticker: 'KNCR11', name: 'Kinea Rendimentos FII', kind: 'fii', sector: 'Papel', price: 104.1, dy_12m: 11.2, pvp: 1.0, last_dividend: 1.05 },
  { ticker: 'XPML11', name: 'XP Malls FII', kind: 'fii', sector: 'Shoppings', price: 112.5, dy_12m: 9.1, pvp: 0.95, last_dividend: 0.88 },
  { ticker: 'PETR4', name: 'Petrobras PN', kind: 'acao', sector: 'Petróleo', price: 39.7, dy_12m: 14.2, pvp: 1.1, last_dividend: 0 },
  { ticker: 'ITUB4', name: 'Itaú Unibanco PN', kind: 'acao', sector: 'Bancos', price: 36.2, dy_12m: 6.1, pvp: 1.8, last_dividend: 0 },
  { ticker: 'VALE3', name: 'Vale ON', kind: 'acao', sector: 'Mineração', price: 61.4, dy_12m: 9.0, pvp: 1.2, last_dividend: 0 },
];
const jitter = (v) => +(v * (1 + (Math.random() - 0.5) * 0.01)).toFixed(2); // ±0,5%

const uid = (req) => sessions.get(req.cookies.carteira_session);
const setCookie = (res, token) =>
  res.cookie('carteira_session', token, { httpOnly: true, sameSite: 'lax', path: '/' });

app.post('/api/auth/register', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password || password.length < 8) return res.status(400).json({ error: 'dados_invalidos' });
  if (users.has(email)) return res.status(409).json({ error: 'email_em_uso' });
  const user = { id: 'u' + seq++, email, password };
  users.set(email, user);
  const token = crypto.randomBytes(16).toString('hex');
  sessions.set(token, user.id);
  setCookie(res, token);
  res.status(201).json({ user: { id: user.id, email } });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = users.get(email);
  if (!user || user.password !== password) return res.status(401).json({ error: 'credenciais_invalidas' });
  const token = crypto.randomBytes(16).toString('hex');
  sessions.set(token, user.id);
  setCookie(res, token);
  res.json({ user: { id: user.id, email } });
});

app.post('/api/auth/logout', (req, res) => {
  sessions.delete(req.cookies.carteira_session);
  res.clearCookie('carteira_session', { path: '/' });
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const id = uid(req);
  if (!id) return res.status(401).json({ error: 'nao_autenticado' });
  const user = [...users.values()].find((u) => u.id === id);
  res.json({ user: { id, email: user.email } });
});

const guard = (req, res, next) => (uid(req) ? next() : res.status(401).json({ error: 'nao_autenticado' }));

app.get('/api/market/search', guard, (req, res) => {
  const q = String(req.query.q || '').toUpperCase();
  res.json({ results: CAT.filter((c) => c.ticker.includes(q) || c.name.toUpperCase().includes(q)).slice(0, 12) });
});

app.get('/api/market/quote/:ticker', guard, (req, res) => {
  const base = CAT.find((c) => c.ticker === req.params.ticker.toUpperCase());
  if (!base) return res.status(404).json({ error: 'ticker_nao_encontrado' });
  res.json({ ...base, price: jitter(base.price), fetched_at: new Date().toISOString() });
});

app.get('/api/portfolio', guard, (req, res) => {
  const snap = carteiras.get(uid(req)) || { version: 0, positions: [], profile: null, legacy: null, settings: null, hist: [] };
  // aplica a cotação "ao vivo" às posições de mercado
  snap.positions = (snap.positions || []).map((p) => {
    if (!p.ticker) return p;
    const base = CAT.find((c) => c.ticker === p.ticker);
    return base ? { ...p, a: jitter(base.price), dy12: base.dy_12m, pvp: base.pvp, d: base.last_dividend } : p;
  });
  res.json(snap);
});

app.put('/api/portfolio', guard, (req, res) => {
  const cur = carteiras.get(uid(req)) || { version: 0 };
  if (req.body.version != null && req.body.version !== cur.version)
    return res.status(409).json({ error: 'conflito', current: cur.version });
  const version = (cur.version || 0) + 1;
  carteiras.set(uid(req), { ...req.body, version });
  res.json({ version });
});

app.post('/api/portfolio/refresh', guard, (req, res) => res.json({ tickers: 0, ok: 0, failed: 0 }));
app.post('/api/portfolio/snapshot', guard, (req, res) => res.json({ ok: true }));
app.get('/api/health', (_req, res) => res.json({ ok: true, mock: true }));

app.use(express.static(path.join(__dirname, '..', 'public')));
app.listen(process.env.PORT || 3000, () =>
  console.log('MOCK em http://localhost:' + (process.env.PORT || 3000) + '  (dados só na memória)')
);
