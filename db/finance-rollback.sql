-- REVERSÃO da migração FINANCE (proventos recebidos, metas, reserva, premissas).
-- Remove SOMENTE as quatro tabelas novas; nenhuma tabela anterior é tocada.
-- Use apenas se precisar desfazer: apaga os dados registrados nessas tabelas. Não é executado
-- por `npm run db:migrate`. Execute manualmente (SQL Editor do Supabase) e só depois de
-- publicar a versão anterior do código, se necessário.
DROP TABLE IF EXISTS dividend_receipts;
DROP TABLE IF EXISTS financial_goals;
DROP TABLE IF EXISTS emergency_reserve;
DROP TABLE IF EXISTS user_simulators;
