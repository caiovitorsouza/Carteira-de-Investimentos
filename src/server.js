// Servidor Express: junta middlewares, rotas e serve o front-end.
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './lib/config.js';
import { authRouter } from './routes/auth.js';
import { marketRouter } from './routes/market.js';
import { portfolioRouter } from './routes/portfolio.js';
import { userRouter } from './routes/user.js';
import { startQuoteScheduler } from './jobs/scheduler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

if (config.trustProxy) app.set('trust proxy', config.trustProxy);
app.use(helmet({ contentSecurityPolicy: false })); // o front usa CDN de fontes
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.use('/api/auth', authRouter);
app.use('/api/market', marketRouter);
app.use('/api/portfolio', portfolioRouter);
app.use('/api/user', userRouter);

// Front-end estático (coloque o index.html em /public).
app.use(express.static(path.join(__dirname, '..', 'public')));

// Tratador de erros central.
app.use((err, _req, res, _next) => {
  console.error('[erro]', err.message);
  res.status(500).json({ error: 'erro_interno' });
});

app.listen(config.port, () => {
  console.log(`API em http://localhost:${config.port}  (${config.env})`);
  if (config.env === 'production' || process.env.ENABLE_SCHEDULER) startQuoteScheduler();
});
