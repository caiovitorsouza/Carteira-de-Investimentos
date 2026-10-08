-- Carteira: esquema PostgreSQL (idempotente). Rode com: npm run db:migrate
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- e-mail sem diferenciar maiúsculas
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- busca por nome

-- 1) CONTAS ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             citext NOT NULL UNIQUE,
  password_hash     text   NOT NULL,                 -- argon2id
  portfolio_version integer NOT NULL DEFAULT 0,      -- controle otimista entre aparelhos
  created_at        timestamptz NOT NULL DEFAULT now(),
  last_login_at     timestamptz
);

CREATE TABLE IF NOT EXISTS sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  bytea NOT NULL UNIQUE,                 -- sha256 do token; o token em si só existe no cookie
  user_agent  text,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_exp_idx  ON sessions(expires_at);

-- 2) CACHE DE ATIVOS DO MERCADO (compartilhado por todos os usuários) -------
CREATE TABLE IF NOT EXISTS instruments (
  ticker      text PRIMARY KEY CHECK (ticker = upper(ticker)),
  name        text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('fii','acao','etf','bdr','outro')),
  segment     text,
  sector      text,
  logo_url    text,
  avg_volume  numeric,                               -- ordena a busca: mais negociados primeiro
  active      boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS instruments_ticker_prefix ON instruments (ticker text_pattern_ops);
CREATE INDEX IF NOT EXISTS instruments_name_trgm     ON instruments USING gin (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS market_quotes (
  ticker           text PRIMARY KEY REFERENCES instruments(ticker) ON DELETE CASCADE,
  price            numeric(18,6),
  prev_close       numeric(18,6),
  change_pct       numeric(10,4),
  volume           numeric,
  dy_12m           numeric(10,4),                    -- em % (12,34 = 12,34%)
  last_dividend    numeric(18,6),
  last_ex_date     date,                             -- "data com"
  last_pay_date    date,
  pvp              numeric(10,4),
  nav_per_share    numeric(18,6),
  source           text NOT NULL DEFAULT 'brapi',
  fetched_at       timestamptz,                      -- último preço
  fundamentals_at  timestamptz,                      -- último P/VP e indicadores
  last_error       text
);

CREATE TABLE IF NOT EXISTS dividends (
  ticker    text NOT NULL REFERENCES instruments(ticker) ON DELETE CASCADE,
  ex_date   date NOT NULL,
  pay_date  date,
  amount    numeric(18,8) NOT NULL,
  kind      text NOT NULL DEFAULT 'rendimento',
  PRIMARY KEY (ticker, ex_date, kind)
);

-- 3) CARTEIRA DO USUÁRIO ----------------------------------------------------
CREATE TABLE IF NOT EXISTS positions (
  id               uuid PRIMARY KEY,                 -- gerado no cliente (idempotência)
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN ('fii','acao','selic','cdb','fundo')),
  ticker           text REFERENCES instruments(ticker),
  name             text,
  quantity         numeric(24,8) CHECK (quantity IS NULL OR quantity > 0),
  avg_price        numeric(18,6) CHECK (avg_price IS NULL OR avg_price > 0),
  invested_amount  numeric(18,2) CHECK (invested_amount IS NULL OR invested_amount >= 0),
  meta             jsonb NOT NULL DEFAULT '{}'::jsonb, -- renda fixa: taxa, vencimento, banco... | FII: tipo, dividendos recebidos
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT positions_shape CHECK (
    (kind IN ('fii','acao') AND ticker IS NOT NULL AND quantity IS NOT NULL AND avg_price IS NOT NULL)
 OR (kind IN ('selic','cdb','fundo') AND ticker IS NULL AND invested_amount IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS positions_user_ticker_uq ON positions(user_id, ticker) WHERE ticker IS NOT NULL;
CREATE INDEX IF NOT EXISTS positions_user_idx   ON positions(user_id);
CREATE INDEX IF NOT EXISTS positions_ticker_idx ON positions(ticker) WHERE ticker IS NOT NULL;

-- Perfil de investidor, taxas de referência, projeção: documentos JSON por usuário
CREATE TABLE IF NOT EXISTS user_documents (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key         text NOT NULL CHECK (key IN ('profile','settings','legacy')),
  data        jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

-- Evolução do patrimônio (um ponto por dia)
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day          date NOT NULL,
  total_value  numeric(18,2) NOT NULL,
  PRIMARY KEY (user_id, day)
);

-- 4) OBSERVABILIDADE DO MOTOR DE COTAÇÕES -----------------------------------
CREATE TABLE IF NOT EXISTS refresh_runs (
  id           bigserial PRIMARY KEY,
  kind         text NOT NULL,                        -- 'prices' | 'full' | 'instruments'
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  tickers      integer,
  ok           integer,
  failed       integer,
  note         text
);

-- 5) TAXAS DE MERCADO (cache global de Selic/CDI/IPCA, atualizado do BCB) ---
CREATE TABLE IF NOT EXISTS market_rates (
  key         text PRIMARY KEY,                     -- 'selic','cdi','ipca','pre_curto','pre_longo','ipca_longo'
  value       numeric(10,4) NOT NULL,               -- % ao ano
  source      text,                                 -- 'bcb','manual','fallback'
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- MIGRAÇÕES IDEMPOTENTES ----------------------------------------------------
-- Permitir novos tipos de renda fixa (pre, ipca, lci, lca) no esquema de posições.
-- As ALTER TABLE abaixo são idempotentes: só rodam se o constraint existir.
ALTER TABLE positions DROP CONSTRAINT IF EXISTS positions_kind_check;
ALTER TABLE positions ADD CONSTRAINT positions_kind_check
  CHECK (kind IN ('fii','acao','selic','cdb','pre','ipca','lci','lca','fundo'));

ALTER TABLE positions DROP CONSTRAINT IF EXISTS positions_shape;
ALTER TABLE positions ADD CONSTRAINT positions_shape CHECK (
    (kind IN ('fii','acao') AND ticker IS NOT NULL AND quantity IS NOT NULL AND avg_price IS NOT NULL)
 OR (kind IN ('selic','cdb','pre','ipca','lci','lca','fundo') AND ticker IS NULL AND invested_amount IS NOT NULL)
);
