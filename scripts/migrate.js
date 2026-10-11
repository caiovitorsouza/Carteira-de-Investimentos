// Cria as tabelas no Supabase. Uso: npm run db:migrate
// Lê DATABASE_URL de .env (local, Node 20+ já carrega --env-file).
// Com Supabase, você também pode rodar o db/schema.sql diretamente no
// SQL Editor — este script é só pra conveniência local.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL ausente. Rode com: node --env-file=.env scripts/migrate.js');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

try {
  // Executa como um bloco único — o schema é idempotente.
  await sql.unsafe(schema);
  console.log('Banco migrado com sucesso.');
} catch (e) {
  console.error('Falha na migração:', e.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
