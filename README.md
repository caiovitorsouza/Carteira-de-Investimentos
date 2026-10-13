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

Após retomar, aguarda 60 segundos sem edições; verifica sintaxe, 13 suítes e2e e os testes unitários/API
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

## Refinamentos pós-revisão (12/10/2026)

- **Limites sob concorrência (corrigido).** A contagem e a inserção de recebimentos (5.000) e metas
  (30) eram passos separados. Reproduzido num Postgres real com 12 pedidos simultâneos: a conta em
  29/30 metas terminou com 37, e a conta em 4.999/5.000 recebimentos com 5.011. Agora
  `createReceipt`/`createGoal` rodam em transação com `pg_advisory_xact_lock` **por usuário e por
  lista** (`worker/repos/finance.js`): só o mesmo usuário espera, outros não são bloqueados, a
  idempotência por `id` e o conflito de `id` de outro usuário continuam valendo, e o bloqueio some
  no COMMIT (compatível com o pooler de transações do Supabase). **Sem mudança de schema: nenhuma
  migração é necessária.** Teste: `tests/unit/concurrency.pg.test.mjs` (Postgres real via
  `embedded-postgres`, várias conexões; pulado com aviso se o módulo não estiver instalado).
- **Simulador (corrigido).** O laço continuava aplicando crescimento e aporte depois da verificação
  do mês 600, então o cenário inalcançável mostrava 601 aportes (capital 0, R$ 500/mês, rentabilidade
  0% → R$ 300.500 em vez de R$ 300.000). O caminho "alcançável" não tinha o problema. Regressões com
  resultado conhecido em `tests/unit/finance-calc.test.mjs` e t11.
- **Interface mais enxuta.** Uma frase principal por página; metodologia e ressalvas em seções
  `<details>` (Recebidos, Metas, Reserva, Simuladores), recolhidas por padrão, com resumo de 44 px,
  abertura por teclado e estado preservado ao editar. Continuam visíveis: estimado × recebido
  (título e aviso curto), origem manual, "valores nominais, sem inflação" e "não é garantia". As
  orientações por tipo de ativo da reserva ficam numa seção só, em vez de repetidas em cada posição.
- **Uma ação por estado vazio.** Sem ativos, recebimentos ou metas, a ação aparece só no estado
  vazio; o botão do cabeçalho surge quando já há registros. "Atualizar cotações" só aparece onde há
  preços (carteira e proventos estimados); não aparece em Recebidos, Metas nem Simuladores, que
  declaram usar a carteira atual.
- **Primeira entrada.** "Cadastre seu primeiro investimento", sem prometer Sleep Score, projeções ou
  independência; o glossário é indicado onde realmente está (fim da página Simuladores, com link).
- **Celular (390 px).** Navegação em uma linha (44 px; antes 92 px), trilha e subtítulo ocultos,
  ferramentas numa linha, título a 181 px do topo (antes 293 px) e conteúdo a 225–279 px (antes
  433–456 px). Em 320 px a navegação usa 3 colunas. O resumo "Como calculamos" do Sleep Score passou
  a ter 44 px de altura.
- **Máscara de moeda.** O temporizador de foco desfazia a seleção do usuário (Tab/Ctrl+A) e digitar
  concatenava os dígitos (enviava `1234520000` em vez de `20000`). Agora respeita a seleção; o foco
  inicial dos painéis só ocorre se nada foi escolhido e é cancelado ao fechar (t12).

## Melhorias de interface e lista de interesse (13/10/2026, local, não publicado)

- **Carteira, logos e menu.**
  - Logo do emissor apenas quando o arquivo é do **próprio ticker** no domínio de ícones da Brapi (`instruments.logo_url`); nos demais casos, monograma de tamanho fixo.
  - Minha carteira em tabela única agrupada por classe (grupos recolhíveis e lembrados), com detalhes ao lado da tabela em área larga ou sobre a página nas demais.
  - Menu lateral recolhível. No celular (≤ 850 px), botão **Menu** que abre a navegação por cima da página; isso substitui a navegação em uma linha descrita acima.
- **Proventos.**
  - Calendário com três categorias que nunca se somam: recebido (registro seu), anunciado (data e valor por cota da fonte de cotações) e estimativa sem data.
  - Recebidos ganhou estatísticas só dos registros: mês selecionado, comparação com o **mesmo período** do mês anterior quando o mês está em andamento, gráfico que escolhe o mês e divisão por ativo.
- **Lista de interesse.** Rotas `/api/watchlist` (exigem sessão, isolamento por usuário, criação idempotente, limite de 200 com bloqueio por usuário).
  - Etapas *Quero acompanhar* / *Planejo comprar*.
  - Aporte por valor **ou** quantidade.
  - Cotação manual sempre datada.
  - Simulação antes e depois que não grava nada e respeita unidades inteiras.
- **Sleep Score v2.1.** Metodologia, pesos fixos, cobertura e critérios da reserva em [`docs/sleep-score.md`](docs/sleep-score.md). Perder dados nunca melhora a nota; sem as três dimensões, não há nota geral.
  - Emissor, prazo de acesso e vencimento de renda fixa e fundos podem ser informados nos detalhes da aplicação. Ficam no JSON da posição, sem migração.
- **Apresentação antes do login.** Três etapas com ilustrações de dados fictícios e Entrar/Criar conta na primeira tela. Quem já está autenticado vai direto à Visão geral, e com movimento reduzido nada se move.

### Migração WATCHLIST: preparada, **não aplicada**
- Bloco aditivo `-- >>> WATCHLIST` em `db/schema.sql` (tabela `watchlist_items`, RLS ligado e sem políticas). Reversão em `db/watchlist-rollback.sql`, que remove só essa tabela.
- Testada localmente em PGlite: aditiva sobre o banco com FINANCE, idempotente, restrições de valor/quantidade e cotação datada, reversão. A concorrência foi testada em Postgres real (`embedded-postgres`).
- **Ordem quando autorizada:** migrar antes de publicar o código. Sem a tabela, só `/api/watchlist` responde erro e a página mostra "Não foi possível carregar"; o resto do app não depende dela. Confirme o projeto Supabase usado pelo Worker antes.

### Limitações deste ciclo
- Continuação das correções e resultados: [`docs/continuacao-correcoes.md`](docs/continuacao-correcoes.md).
- O resumo de 77 testes somava 83 porque repetia seis testes de estatísticas já incluídos nos 49 anteriores: 49 + 10 + 6 + 11 + 1 = 77. Após esta continuação, são 88 testes unitários/API. Essa contagem não inclui as linhas PASS de e2e nem as 3.600 comparações internas do teste de monotonicidade.
- O teste de concorrência exige o binário do `embedded-postgres` (devDependency de ~100 MB, só
  Windows/macOS/Linux x64/arm64 suportados pelo pacote). Rodou e passou no Windows; em outro ambiente
  sem o módulo ele é pulado, e o aviso aparece na saída.
- A auditoria visual com Playwright em Python (webapp-testing) foi executada fora do repositório; o
  que está versionado são as suítes em Node (t10 a t13). O contraste não passou por ferramenta
  automática. Tudo foi validado só com backend e dados fictícios, não com o banco de produção.
