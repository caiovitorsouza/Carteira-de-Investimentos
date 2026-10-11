# Carteira — plataforma Full-Stack (Cloudflare Workers + Supabase + Brapi)

Site de carteira de investimentos: contas de usuário, dados no banco (acessível
do celular e do PC) e cotações atualizadas sozinhas pela API da
[Brapi](https://brapi.dev). Adicionar um ativo é só digitar o ticker — nome,
preço, DY e P/VP vêm automáticos.

Deploy em Cloudflare Workers (edge, nunca dorme) + banco no Supabase.

## Estrutura

```
carteira-de-investimentos/
├─ worker/                   # backend (Hono + postgres.js, Cloudflare Workers)
│  ├─ index.js               # entry point (fetch + scheduled)
│  ├─ lib/                   # config, db, auth (PBKDF2 via Web Crypto)
│  ├─ middleware/            # requireAuth
│  ├─ repos/portfolio.js     # ler/salvar carteira no Postgres
│  ├─ routes/                # auth, market, portfolio, user
│  ├─ services/              # brapi, quotes, rates, email
│  └─ jobs/scheduled.js      # cron triggers (cotações, taxas BCB, e-mails)
├─ public/                   # front-end (index.html + api.js)
├─ db/schema.sql             # schema do Postgres (rodar no Supabase SQL Editor)
├─ scripts/
│  ├─ migrate.js             # aplica o schema localmente (idempotente)
│  └─ sync-instruments.js    # baixa catálogo B3 da Brapi -> tabela instruments
├─ wrangler.toml             # config do Cloudflare Worker
└─ DEPLOY_CLOUDFLARE.md      # passo a passo do deploy
```

## Setup rápido

```bash
# 1. Dependências
npm install

# 2. Variáveis locais (pra rodar os scripts)
cp .env.example .env
# edita .env e coloca:
#   DATABASE_URL=postgresql://postgres.<ref>:<senha>@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
#   BRAPI_TOKEN=<seu token>

# 3. Prepara o banco
npm run db:migrate          # cria as tabelas (idempotente)
npm run sync:instruments    # sincroniza catálogo B3 (~2 min)

# 4. Login no Cloudflare
npx wrangler login

# 5. Secrets do Worker (cola o valor quando pedir)
npx wrangler secret put DATABASE_URL
npx wrangler secret put BRAPI_TOKEN

# 6. Deploy
npm run deploy
```

URL final: `https://carteira-de-investimentos.<seu-subdominio>.workers.dev`.

Passo a passo detalhado: [DEPLOY_CLOUDFLARE.md](./DEPLOY_CLOUDFLARE.md).

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Roda o worker local em `http://localhost:8787` |
| `npm run deploy` | Publica a versão atual no Cloudflare |
| `npm run tail` | Mostra logs do worker ao vivo |
| `npm run db:migrate` | Aplica `db/schema.sql` no banco (precisa do `.env`) |
| `npm run sync:instruments` | Baixa catálogo da Brapi pro banco (precisa do `.env`) |

## Stack

- **Backend:** Cloudflare Workers + [Hono](https://hono.dev) + [postgres.js](https://github.com/porsager/postgres)
- **Banco:** [Supabase](https://supabase.com) (Postgres com Transaction Pooler)
- **Dados de mercado:** [Brapi.dev](https://brapi.dev) (cotações B3)
- **Taxas macro:** [BCB SGS](https://api.bcb.gov.br) (Selic, CDI, IPCA — grátis)
- **E-mail (opcional):** [Resend](https://resend.com)
- **Scheduler:** Cloudflare Cron Triggers
- **Auth:** PBKDF2-SHA256 via Web Crypto + cookies de sessão

## Agendamentos

Configurados em `wrangler.toml` (horários em UTC):

- **Cotações** — a cada 5 min, 10h–18h BRT, dias úteis
- **Taxas BCB** — 9h BRT dias úteis
- **E-mail semanal** — domingo 19h BRT (só se `EMAIL_ENABLED=true`)
- **E-mail mensal** — primeiro dia útil 9h BRT (só se `EMAIL_ENABLED=true`)
