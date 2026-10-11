# Deploy no Cloudflare Workers — Passo a passo

Esse guia leva do zero ao site rodando em `https://carteira-de-investimentos.<seu-subdominio>.workers.dev` em ~15 minutos.

> **Arquitetura:** um único Cloudflare Worker serve a API em `/api/*` E os arquivos estáticos de `public/` (via Workers Static Assets). Nada de Pages separado. Nada de servidor dormindo.

---

## 1) O que você precisa ter

- Conta no **Cloudflare** (grátis) — crie em https://dash.cloudflare.com/sign-up
- Conta no **Supabase** (já tem — projeto "Rendi" em `sa-east-1`)
- Conta no **Brapi** (já tem — pega o token em https://brapi.dev/dashboard)
- **Node.js 20+** instalado no seu computador (`node -v`)

---

## 2) Instalar dependências localmente

Na pasta do projeto (`carteira-de-investimentos/`):

```bash
npm install
```

Isso baixa `hono`, `postgres` e `wrangler` (CLI do Cloudflare).

---

## 3) Conseguir a string de conexão do Supabase

1. Entra no painel do Supabase, projeto **Rendi**
2. Clica no botão **Connect** no topo da página (ou em **Project Settings → Database**)
3. Vai pra aba **Transaction pooler** (porta `6543`)
   - **IMPORTANTE:** não é o "Direct connection" (porta 5432), não é o "Session pooler" (porta 5432) — é o **Transaction pooler** mesmo. Workers precisa dele porque:
     - É IPv4 (Cloudflare suporta)
     - É short-lived (ideal pra serverless)
     - Suporta muitas conexões simultâneas
4. Copia a string. Vai parecer:
   ```
   postgresql://postgres.oyinfnejkghqssdteecl:[YOUR-PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
   ```
5. Troca `[YOUR-PASSWORD]` pela senha do banco (a mesma que você usou pra rodar o schema no SQL Editor)

Testa localmente antes de ir pro Workers:

```bash
# Cria .env na raiz do projeto com DATABASE_URL
echo 'DATABASE_URL=postgresql://postgres.oyinfnejkghqssdteecl:SUA_SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres' > .env
echo 'BRAPI_TOKEN=seu_token_brapi' >> .env

# Confirma que o schema tá aplicado (idempotente — pode rodar quantas vezes quiser)
node --env-file=.env scripts/migrate.js

# Popula o catálogo de ativos (sincroniza B3 da Brapi — leva uns 2 min)
node --env-file=.env scripts/sync-instruments.js
```

Se os dois comandos rodarem sem erro, o banco tá pronto. 🎉

---

## 4) Login no Cloudflare via Wrangler

```bash
npx wrangler login
```

Abre o navegador, autoriza, pronto.

---

## 5) Configurar os secrets do Worker

Secrets ficam criptografados no Cloudflare, não vão pro git. Rode cada comando e cola o valor quando pedir:

```bash
npx wrangler secret put DATABASE_URL
# Cola a connection string do passo 3 e dá Enter

npx wrangler secret put BRAPI_TOKEN
# Cola seu token da Brapi
```

> **Se quiser habilitar e-mail depois** (opcional, agora tá desligado):
> ```bash
> npx wrangler secret put RESEND_API_KEY
> ```
> E muda `EMAIL_ENABLED = "false"` pra `"true"` no `wrangler.toml`.

---

## 6) Primeiro deploy

```bash
npx wrangler deploy
```

Isso faz:
1. Faz bundle do código do worker (worker/)
2. Faz upload dos assets de public/
3. Registra os 4 cron triggers (cotações a cada 5 min no pregão, taxas BCB, e-mails)
4. Deploya tudo

Vai aparecer no final algo tipo:
```
Deployed carteira-de-investimentos triggers (1.3 sec)
  schedule: */5 13-21 * * 1-5
  schedule: 0 12 * * 1-5
  schedule: 0 22 * * 0
  schedule: 0 12 1,2,3 * *
Published carteira-de-investimentos
  https://carteira-de-investimentos.<seu-subdominio>.workers.dev
```

Abre o link. **Pronto. Site no ar.**

---

## 7) Testar end-to-end

1. Acessa o link do passo 6
2. Cria uma conta (email + senha ≥ 8 caracteres)
3. Faz login
4. Adiciona um FII (ex: `MXRF11`) — se o preço aparecer, Brapi tá OK
5. Fecha o navegador, abre de novo — a sessão persiste? ✓
6. Confere o painel do Supabase: Table Editor → `users` tem seu usuário? ✓
7. Vê os logs em tempo real:
   ```bash
   npx wrangler tail
   ```

---

## 8) (Opcional) Domínio custom

Pra apontar `carteira.seu-dominio.com`:

1. Cloudflare Dashboard → Workers & Pages → `carteira-de-investimentos` → Settings → Triggers → **Custom Domains → Add Custom Domain**
2. Coloca o domínio. Se já tá no Cloudflare, propagação é instantânea.
3. Edita `wrangler.toml`:
   ```toml
   [vars]
   PUBLIC_ORIGIN = "https://carteira.seu-dominio.com"
   ```
4. `npx wrangler deploy`

---

## Fazer mudanças depois

Qualquer alteração em `worker/` ou `public/`:
```bash
npx wrangler deploy
```

Ver logs ao vivo:
```bash
npx wrangler tail
```

Testar localmente antes:
```bash
npx wrangler dev
```
(abre em http://localhost:8787)

---

## O que mudou do Render

| Antes (Render) | Agora (Cloudflare) |
|---|---|
| Express + argon2 + pg + node-cron | Hono + PBKDF2 + postgres.js + Cron Triggers |
| Dormia depois de 15 min | Sempre acordado (edge, 300+ cidades) |
| 1 processo Node | Isolates automáticos |
| Logs em uma aba | `wrangler tail` + dashboard |
| Deploy: `git push` | `wrangler deploy` |
| Config: ENV no painel | Secrets + `wrangler.toml` |

### Limites do plano free do Workers

- 100 mil requests/dia (muito pra 1 usuário)
- 10ms de CPU por request (ok pra queries normais)
- 30s de wall-clock pro scheduled (ok pro refresh de cotações)

Se um dia estourar, migra pro Workers Paid ($5/mês): 10M requests + 50ms CPU.

---

## Troubleshooting

### "DATABASE_URL ausente"
Rodar `npx wrangler secret put DATABASE_URL` de novo. Confere com `npx wrangler secret list`.

### "password authentication failed"
Senha errada na connection string. Reseta no Supabase: Project Settings → Database → Reset database password → copia a nova senha e refaz o secret.

### Site abre mas /api/health dá erro
Logs: `npx wrangler tail` — abre no navegador, qualquer erro vai aparecer em tempo real.

### Cotações não atualizam
Confere se o cron triggered: Cloudflare Dashboard → Workers → carteira-de-investimentos → Triggers. Cada entrada deve aparecer com "last fired" preenchido se já tiver sido horário.

### Supabase diz "connection limit reached"
Transaction pooler aguenta 100+ conexões simultâneas no plano free. Se bater limite, revê se o Worker tá fechando conexões (deve estar via `ctx.waitUntil(closeSql(sql))`).

---

Qualquer coisa trava, me chama — a gente diagnostica.
