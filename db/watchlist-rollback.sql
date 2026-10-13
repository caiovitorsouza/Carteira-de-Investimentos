-- REVERSÃO da migração WATCHLIST (lista de interesse).
-- Remove SOMENTE a tabela watchlist_items; nenhuma outra tabela é tocada.
-- Apaga os itens registrados nessa lista. Não é executado por `npm run db:migrate`.
-- Execute manualmente e só depois de publicar uma versão do código que não use a lista.
DROP TABLE IF EXISTS watchlist_items;
