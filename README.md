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

## Automação local

O observador inicia **pausado a cada processo novo**. A retomada explícita permite
commit e push dos arquivos validados, quando a integração Cloudflare estiver
confirmada e o envio estiver ativado localmente. O deploy é feito pelo Cloudflare
ao receber o push em `main`; o observador não executa deploy local.

Comandos completos no PowerShell, dentro de `Rendum-repo`:

```powershell
# Iniciar pausado; manter este terminal aberto
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-auto.ps1
# Pausar em outro terminal e aguardar confirmação antes de editar
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\control-auto.ps1 -Action pause
# Retomar explicitamente após concluir e revisar o trabalho
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\control-auto.ps1 -Action resume
# Conferir estado
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\control-auto.ps1 -Action status
# Parar (também funciona para o simulador antigo)
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\stop-auto.ps1
# Simular um único ciclo, sem commit/push
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-auto.ps1 -Once
```

Com Node e Git no PATH, os equivalentes são `npm run auto:start`,
`npm run auto:pause`, `npm run auto:resume`, `npm run auto:status`,
`npm run auto:stop` e `npm run auto:simulate`. Os scripts Windows encontram Git
for Windows e Node portátil em `../.rendum-tools/node-*-win-x64`.
Use `npm ci` e `npx playwright install chromium` para preparar os testes.

Após retomar, aguarda 60 segundos sem edições; verifica sintaxe, 12 suítes e2e e os testes unitários/API
com dados fictícios e build Wrangler dry-run. Edições durante checks invalidam o
ciclo. Pausar interrompe os checks e confirma a pausa antes de permitir trabalho.
Um lock impede duas instâncias. Conflitos, índice previamente preparado,
divergência entre HEAD e origin/main, possíveis segredos ou checks falhos
interrompem a automação. Não faz force push, pull, migrações ou correção forçada.
Se commit já ocorreu quando chega a pausa, o push fica pendente para revisão
manual. Uma operação Git já iniciada precisa terminar antes da confirmação.

Logs, builds e estado ficam em `.rendum-auto/`, ignorada pelo Git. Arquivos de
ambiente, credenciais, chaves, bancos e temporários são excluídos; a triagem de
conteúdo não substitui a revisão humana de segredos. O marcador local
`publishing-enabled.json` exige repositório `caiovitorsouza/Carteira-de-Investimentos`,
branch `main` e `integrationConfirmed: true`. Só deve ser criado após conferir
Settings → Builds no Cloudflare e concluir a revisão. Não é uma credencial.

Claude e Codex devem seguir [AGENTS.md](AGENTS.md): pausar no início da sessão,
manter a pausa durante o trabalho, revisar e validar ao concluir e retomar
explicitamente com autorização para envio. Um processo persistente não detecta
novos chats; o agente deve pausá-lo na abertura de cada sessão.
Se houver lock antigo, confira que o PID em `lock/owner.json` encerrou antes de
remover somente esse lock. Nunca remova lock de processo vivo.

### Cloudflare e auditoria

O check histórico `Workers Builds: rendum` do commit `663758a` foi concluído
com sucesso, conforme relatório de preparação. A configuração atual e a versão
ativa exigem conferência no painel; build aprovado sozinho não comprova produção.
Em 12/10/2026, o usuário confirmou no painel: repositório
`caiovitorsouza/Carteira-de-Investimentos`, produção `main`, builds automáticos
habilitados, deploy `npx wrangler deploy`, build command `None` e root `/`.
Essa conferência autoriza a ativação local; a publicação de cada commit deve
ser verificada separadamente.

A auditoria da preparação contou 7 **pacotes afetados** (5 altos, 2 moderados),
todos na árvore de desenvolvimento do Wrangler: `@fastify/busboy` (multipart/DoS
e injeção CRLF), `esbuild` (acesso ao servidor de desenvolvimento), `miniflare`
(herda Undici/ws), `sharp` (bibliotecas de imagens), `undici` (HTTP/WebSocket,
injeção e esgotamento de recursos), `wrangler` (herda as dependências) e `ws`
(memória e DoS). Não são 7 falhas independentes; há múltiplos avisos e propagação.
Eles não integram o bundle do Worker e não impedem por si só o observador com
testes fictícios locais e build dry-run. As ferramentas continuam afetadas;
a migração para Wrangler 4 requer revisão própria. Nenhum fix forçado aplicado.

## Proventos recebidos, metas e simuladores editáveis

Rotas `/api/finance/*` (exigem sessão; tudo filtrado pelo usuário autenticado):
`worker/routes/finance.js`, `worker/repos/finance.js`, validação em
`worker/lib/finance.js`, regras de cálculo puras em `public/finance-calc.js`
(compartilhadas por navegador, Worker e testes). Tabelas novas em `db/schema.sql`
(bloco `FINANCE`; migração aditiva e idempotente: `dividend_receipts`,
`financial_goals`, `emergency_reserve`, `user_simulators`). Rode `npm run db:migrate`
antes de publicar; carteiras existentes não são tocadas.

- **Recebidos** (Proventos → aba *Recebidos*): ativo, data, valor total e observação,
  informados pelo usuário; editar/excluir com confirmação; totais por mês e ano e filtros
  por ativo. O calendário *Estimados* é preservado e nada é convertido automaticamente.
  Registrar não altera caixa, posição nem patrimônio, e o valor não depende da quantidade
  de cotas. Não há confirmação por corretora.
- **Metas**: patrimônio (compara com o patrimônio atual das posições) e renda mensal
  (compara com a renda mensal *estimada*, não recebida); valor-alvo, prazo opcional.
  **Reserva**: gastos mensais, meses de cobertura e posições vinculadas pelo usuário;
  nada é classificado como reserva automaticamente.
- **Simuladores**: independência com capital inicial (vazio = patrimônio atual), aporte,
  renda desejada, rentabilidade, taxa para estimar renda e inflação opcional (valores
  nominais x poder de compra); Bazin com proventos e taxa editáveis, origem
  (ilustrativa x manual) e preço opcional. Premissas salvas por botão, no servidor.

### Decisões
- Dinheiro em centavos inteiros (`bigint`), percentuais em pontos-base, datas em `DATE`
  trafegando como `AAAA-MM-DD`, sem `Date`/fuso.
- Taxa anual → mensal por `(1+a)^(1/12)−1` (não `a/12`), inclusive para a taxa de renda;
  isso muda levemente o prazo em relação ao cálculo anterior (que dividia por 12).
  Aportes ficam constantes em valor nominal; teto de 50 anos para “inalcançável”.
- Criação idempotente: o cliente gera o `id` uma vez por painel; reenviar não duplica, e
  um `id` de outro usuário responde 409 sem tocar nos dados dele.
- Sem chave estrangeira para `positions` (o salvamento da carteira recria essas linhas);
  vínculos da reserva guardam ids, e ids que não existem mais são ignorados e podados.
- “Ocultar valores”: textos, rótulos acessíveis, avisos e campos monetários (viram
  senha) são mascarados; o gráfico mensal não é desenhado e a barra/porcentagem de
  progresso é ocultada, pois a razão revelaria os valores.
- Avisos de sucesso não trazem valores e só aparecem após a confirmação do servidor.

### Limitações
- Sem edição simultânea entre aparelhos (última gravação vence) e sem importação de
  extratos. Limites: 5.000 recebimentos e 30 metas por usuário.
- A lista ilustrativa do Bazin continua sendo dado de exemplo, não cotação.
- Campos monetários dos painéis usam a máscara existente (digitação pelos centavos); sem
  seleção o cursor vai ao fim; uma seleção do usuário (Tab/Ctrl+A) é respeitada e substituída.
- Testes de banco usam PGlite (Postgres em memória), não o Supabase real; a migração
  em produção e o contraste visual por ferramenta automática não foram verificados.
- `npm run test:unit` roda cálculos, validação, persistência, isolamento e migração.

### Migração e ordem de publicação (FINANCE)
- **Ordem:** migrar o banco **antes** de publicar o código. A migração é aditiva (4 tabelas novas,
  RLS ligado e sem políticas, como as demais) e compatível com o código antigo, que ignora as
  tabelas novas. O inverso (código novo sem migração) faz só `/api/finance/*` responder erro, e a
  interface mostra o aviso "Não foi possível carregar"; a carteira não é afetada.
- **Como:** `npm run db:migrate` (precisa do `.env`, não versionado) executa o `db/schema.sql`
  inteiro, de forma idempotente. Em 12/10/2026 apenas o bloco `FINANCE` foi aplicado ao banco de
  produção pelo painel/MCP do Supabase (projeto confirmado pelas gravações dos crons do Worker).
- **Reversão:** `db/finance-rollback.sql` remove somente as 4 tabelas novas (apaga os dados nelas).
- **Testes:** `tests/unit/migration.test.mjs` parte do schema anterior (`tests/unit/fixtures`) com
  dados no formato antigo e confere preservação por hash, o leitor da carteira, idempotência, RLS e
  reversão, em banco isolado (PGlite).
- O `DEPLOY_CLOUDFLARE.md` cita outra ref de projeto Supabase; confira qual `DATABASE_URL` está no
  secret do Worker antes de rodar migrações manualmente.
