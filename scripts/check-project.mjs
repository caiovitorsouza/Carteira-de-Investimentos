// Offline checks: never load .env or run database, email or production jobs.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) =>
  !/TOKEN|SECRET|PASSWORD|DATABASE|RESEND|BRAPI|NODE_OPTIONS|NODE_EXTRA_CA_CERTS/i.test(k)));
env.EMAIL_ENABLED = 'false';
env.WRANGLER_LOG_PATH = path.join(root, '.rendum-auto', 'wrangler.log');
function run(args) {
  const r = spawnSync(process.execPath, args, { cwd: root, env, stdio: 'inherit' });
  if (r.error || r.status !== 0) process.exit(r.status || 1);
}
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : /\.(mjs|cjs|js)$/.test(p) ? [p] : [];
  });
}
for (const dir of ['worker', 'scripts', 'tests', 'public']) {
  for (const file of files(dir)) run(['--check', file]);
}
run(['tests/unit/run-all.mjs']);
run(['tests/e2e/run-all.mjs']);
// Build only; no deployment, login, migrations or production requests.
run(['node_modules/wrangler/bin/wrangler.js', 'deploy', '--dry-run',
  '--outdir', '.rendum-auto/build']);
console.log('Verificações concluídas: sintaxe, testes unitários/API, e2e fictício e build sem publicação.');
