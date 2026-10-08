// Cria as tabelas no Postgres. Uso: npm run db:migrate
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/lib/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');

try {
  await pool.query(sql);
  console.log('Banco migrado com sucesso.');
} catch (e) {
  console.error('Falha na migração:', e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
