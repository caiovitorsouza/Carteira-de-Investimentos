# Carteira — plataforma Full-Stack (Node.js + Express + PostgreSQL + Brapi)

Evolução do seu site: em vez de guardar tudo no navegador (`localStorage`), agora
há **contas de usuário**, os dados ficam no **banco de dados** (acessível do
celular e do PC) e as **cotações são atualizadas sozinhas** pela API da
[Brapi](https://brapi.dev). Adicionar um ativo virou **só digitar o ticker**:
nome, preço, DY e P/VP vêm automáticos.

## O que tem aqui

```
carteira-fullstack/
├─ db/schema.sql            # estrutura do banco (tabelas)
├─ src/
│  ├─ server.js             # servidor Express (junta tudo)
│  ├─ lib/                  # config, conexão com o banco, autenticação
│  ├─ services/             # brapi.js (API financeira) e quotes.js (motor de cotações)
│  ├─ repos/portfolio.js    # ler/salvar a carteira no banco
│  ├─ routes/               # auth.js, market.js, portfolio.js (a API REST)
│  └─ jobs/scheduler.js     # atualiza cotações sozinho, em horário de pregão
├─ scripts/
│  ├─ migrate.js            # cria as tabelas
│  └─ sync-instruments.js   # baixa a lista de ações/FIIs (para o autocompletar)
├─ public/                  # front-end (index.html + api.js)
├─ dev/mock-server.js       # servidor de DEMONSTRAÇÃO (sem banco, dados na memória)
└─ test/api.test.js         # testes automáticos das rotas
```

---

## Jeito mais rápido de ver funcionando (sem instalar banco)

Serve para ver login + busca com autocompletar + cotação automática na hora.
Os dados ficam só na memória e somem quando você fecha.

```bash
cd carteira-fullstack
npm install            # instala as dependências
npm run mock           # sobe o servidor de demonstração
```

Abra **http://localhost:3000**, crie uma conta e adicione, por exemplo, `HGLG11`.

---

## Rodar de verdade (com PostgreSQL)

### 1. Pré-requisitos
- **Node.js 20+** → https://nodejs.org
- **PostgreSQL 14+** → https://www.postgresql.org/download/
  (ou, mais fácil, um banco gratuito na nuvem: [Neon](https://neon.tech) ou [Supabase](https://supabase.com))
- Um **token da Brapi** (grátis) → https://brapi.dev/dashboard

### 2. Configurar
```bash
cd carteira-fullstack
npm install
cp .env.example .env
```
Abra o arquivo `.env` e preencha:
- `DATABASE_URL` com o endereço do seu banco
  (ex.: `postgres://usuario:senha@localhost:5432/carteira`;
  os bancos da nuvem te dão essa linha pronta — se for da nuvem, ponha também `PG_SSL=true`).
- `BRAPI_TOKEN` com o seu token da Brapi.
- `BRAPI_PLAN` com `free` (ou `pro`, se você assinar — o plano Pro libera o P/VP de todos os FIIs).

### 3. Criar as tabelas e carregar o catálogo de ativos
```bash
npm run db:migrate          # cria as tabelas no banco
npm run sync:instruments    # baixa ações e FIIs da B3 (alimenta o autocompletar)
```

### 4. Ligar
```bash
ENABLE_SCHEDULER=1 npm start
```
Abra **http://localhost:3000**. O `ENABLE_SCHEDULER=1` liga o robô que atualiza
as cotações a cada 5 min em horário de pregão (ajustável em `QUOTE_REFRESH_CRON`).

### Testes
```bash
npm run mock      # num terminal
npm test          # noutro terminal
```

---

## A API REST (resumo)

| Método | Rota | O que faz |
|---|---|---|
| POST | `/api/auth/register` | cria conta (`{email, password}`) e já loga |
| POST | `/api/auth/login` | entra |
| POST | `/api/auth/logout` | sai |
| GET | `/api/auth/me` | diz quem está logado |
| GET | `/api/market/search?q=mxrf` | autocompletar de tickers |
| GET | `/api/market/quote/:ticker` | cotação de um ativo |
| GET | `/api/portfolio` | carrega a carteira (posições + cotações + perfil) |
| PUT | `/api/portfolio` | salva a carteira (com controle de versão) |
| POST | `/api/portfolio/refresh` | força atualizar as cotações agora |

A sessão fica num **cookie** `httpOnly` (não some ao fechar a aba e o navegador
não deixa JavaScript malicioso ler o token). A senha é guardada com **argon2id**,
nunca em texto puro.

---

## Como o banco foi pensado

- **`users`** — conta: e-mail, hash da senha e um `portfolio_version` (um número
  que sobe a cada gravação, para dois aparelhos não sobrescreverem um ao outro).
- **`sessions`** — logins ativos (guarda só o hash do token do cookie).
- **`instruments`** — catálogo de todos os ativos da B3 (é o que alimenta a busca).
- **`market_quotes`** — cache das cotações: preço, DY, P/VP, último dividendo.
  É **compartilhado**: uma consulta à Brapi serve a todos os usuários que têm
  aquele ativo, economizando chamadas à API.
- **`positions`** — a carteira de cada um: para FII/ação guarda só **quantidade**
  e **preço médio** (o resto é lido do cache); renda fixa guarda o valor aplicado.
- **`user_documents`** — perfil de investidor, taxas e preferências, em JSON.
- **`portfolio_snapshots`** — um ponto por dia para o gráfico de evolução.

Por que separar `positions` de `market_quotes`? Porque o preço do MXRF11 é o
mesmo para todo mundo (fica no cache, atualizado uma vez), enquanto *quantas
cotas você tem* é só seu. Assim o robô atualiza o preço **uma vez** e todas as
carteiras já veem o valor novo.

---

## Observações honestas

- A **API de FIIs da Brapi (P/VP, DY 12m)** é do plano **Pro**. Nos planos
  gratuitos o site funciona com **preço e dividendos** (o P/VP fica vazio até você
  assinar, ou você digita à mão). O sandbox da Brapi libera `MXRF11` e `HGLG11`
  para teste sem token.
- Cotações da Brapi têm **atraso** (não são tempo real ao segundo) — é o normal
  para esse tipo de serviço e suficiente para acompanhar a carteira.
- O front em `public/` é uma base enxuta com **login, lista de ativos, adicionar
  por ticker e dicas em accordions**. Dá para trazer de volta as telas ricas das
  versões anteriores (perfil, projeção, mercado) ligando-as às rotas em `api.js`.
- Isto é uma ferramenta de acompanhamento e educação, **não é recomendação de
  investimento**.
