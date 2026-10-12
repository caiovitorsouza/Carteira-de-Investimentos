// Executa os testes unitários e de API (PGlite em memória). Sem rede, sem banco real,
// sem credenciais: as variáveis sensíveis são removidas do ambiente.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const dir = fileURLToPath(new URL('./', import.meta.url));
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) =>
  !/TOKEN|SECRET|PASSWORD|DATABASE|RESEND|BRAPI|NODE_OPTIONS|NODE_EXTRA_CA_CERTS/i.test(k)));
env.EMAIL_ENABLED = 'false';
const files = readdirSync(dir).filter(f => f.endsWith('.test.mjs')).sort().map(f => dir + f);
const r = spawnSync(process.execPath, ['--test', ...files], { env, stdio: 'inherit' });
process.exitCode = r.status === 0 ? 0 : (r.status || 1);
