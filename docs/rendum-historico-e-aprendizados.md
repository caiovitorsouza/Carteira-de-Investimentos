# Rendum — histórico do projeto e aprendizados

Atualizado em 11/10/2026. Reúne tudo o que foi construído, decidido e aprendido nas conversas sobre o Rendum.

---

## 1. O que é o Rendum

Carteira de investimentos pessoal (FIIs, ações e renda fixa) para quem quer aprender e ter previsibilidade ao investir.

- **Site no ar:** https://rendum.caiovitormsouza.workers.dev/
- **Repositório:** github.com/caiovitorsouza/Carteira-de-Investimentos
- **Publicação:** todo merge/push na `main` dispara deploy automático no Cloudflare (leva cerca de 3–5 minutos).
- **Nome anterior:** Rendi (o domínio mudou para `rendum`).

---

## 2. Arquitetura atual

| Parte | Tecnologia | Onde fica |
|---|---|---|
| Frontend | HTML, CSS e JavaScript puros, num único arquivo | `public/index.html` + `public/api.js` |
| Backend | Hono no Cloudflare Workers | `worker/` (rotas em `worker/routes/`, banco em `worker/repos/`) |
| Banco | Supabase (Postgres) via postgres.js | Transaction Pooler, porta 6543, `prepare:false` |
| Fontes | WOFF2 locais (Newsreader 400/500, Public Sans 400/500/600) + licenças OFL | `public/fonts/` |
| Testes | Playwright + servidor de teste com dados fictícios | `tests/e2e/` (não é publicado) |

- `wrangler.toml`: worker `rendum`, assets em `./public` (SPA), cron triggers.
- **Crons (UTC; BRT = UTC−3):**
  - cotações a cada 5 min, das 10h às 18h BRT, em dias úteis;
  - taxas do Banco Central às 9h BRT;
  - e-mail semanal no domingo;
  - e-mail mensal nos dias 1–3.
- **Segredos** (no Cloudflare, nunca no código): `DATABASE_URL`, `BRAPI_TOKEN`, `RESEND_API_KEY`.
- **Catálogo:** cerca de 2000 ativos, carregados pelo endpoint `POST /api/admin/sync-catalog`.

---

## 3. Linha do tempo

1. **Migração Render + Neon → Cloudflare Workers + Supabase.** Motivo: o Render não conseguia conectar ao Supabase por IPv6.
2. **Correções de deploy:**
   - PBKDF2 reduzido para 100 mil iterações (o Workers recusa mais);
   - crons com nomes de dia (MON-FRI/SUN);
   - schema rodado no SQL Editor;
   - campo de busca restaurado;
   - catálogo populado.
3. **Marca e visual:** escolha do estilo "Linear" e do nome Rendum. Primeiro escuro com verde-limão, depois modo claro com verde esmeralda.
4. **Componentes do painel:**
   - SmartInsights (alertas);
   - SleepScore;
   - calendário de proventos;
   - meta de independência financeira;
   - calculadora Bazin;
   - glossário.
5. **Refino final (PR #1, junto com o papel mineral):**
   - login acessível;
   - ocultar valores;
   - status honesto das cotações;
   - proventos marcados como estimados;
   - Bazin editável;
   - salvamento seguro;
   - painéis modais acessíveis.
6. **Direção visual "papel mineral"**, a partir do protótipo `rendum-final.html`:
   - navegação lateral;
   - tabelas;
   - tema claro e escuro;
   - fontes Newsreader e Public Sans;
   - entrada "Vamos começar." seguida do formulário.
7. **PR #2:** lateral fixa na altura da janela, abas sem numeração, "Adicionar ativo" só em Visão geral e Minha carteira.
8. **PR #3:** a página não passa do fim do conteúdo (efeito elástico desligado).

---

## 4. Como o site funciona hoje

### Páginas
- **Visão geral:** patrimônio, renda mensal estimada, nº de ativos, status das cotações, distribuição por classe, maiores posições, agenda de proventos, Sleep Score e pontos de atenção.
- **Minha carteira:** tabela com busca, filtro por classe e ordenação. Clicar num ativo abre os detalhes (aportar, vender/resgatar, remover).
- **Proventos:** calendário mensal (lista no celular), valores sem data separados, datas de meses seguintes fora do total.
- **Simuladores:** independência financeira e preço-teto Bazin, com as premissas visíveis, mais o glossário.

### Regras de negócio importantes
- **Proventos:** são sempre **estimados**; não existe fonte que confirme pagamentos.
  - Itens sem data ou com data inválida vão para "Data não informada" (o sistema nunca assume dia 15).
  - Datas são lidas sem fuso, para que "15" não vire "14".
- **Insights:**
  - O alerta de reserva diz só o que o sistema vê: "nenhum Selic/CDB cadastrado".
  - Renda fixa concentrada não é tratada como risco.
  - O alerta de concentração vale para um ativo de renda variável acima de 20%.
- **Sleep Score:** indicador simplificado (nota fixa por tipo de ativo, ponderada pelo valor). Não mede volatilidade.
- **Independência:** premissas fixas de 10% ao ano de rentabilidade e 7% ao ano de yield, valores nominais (sem inflação).
- **Bazin:** preço-teto = proventos anuais ÷ taxa de referência (padrão 6%). A lista de ativos tem **dados ilustrativos**.
- **Máscara de moeda:** a digitação preenche pelos centavos ("1","0","0","0","0" = R$ 100,00); **colar** é lido em reais ("100" = R$ 100,00).
- **Resgate de renda fixa:** o capital aplicado cai na proporção do resgate: `ap × (1 − valor/atual)`.

### Salvamento e segurança dos fluxos
- O sucesso só é anunciado depois que o servidor confirma.
- Em falha, a alteração fica na tela e aparece "Tentar salvar de novo", que reenvia a carteira inteira e não duplica a operação.
- Os salvamentos são serializados.
- Durante "Atualizar cotações", adicionar e editar ficam bloqueados; uma resposta atrasada não sobrescreve alterações locais.
- Se a carteira não carregar, o painel fica bloqueado (não vira carteira vazia editável).
- Ao fechar, o painel desabilita seus botões (evita operação repetida por Enter ou clique duplo).

### Privacidade
- "Ocultar valores" mascara todo valor monetário, inclusive em notificações, tooltips e textos acessíveis.
- Só a preferência fica no navegador (`localStorage`).

---

## 5. Aprendizados técnicos

| Problema | Causa | Solução |
|---|---|---|
| Render não conectava ao Supabase | IPv6 | Migrar para Cloudflare Workers |
| Hash de senha recusado | Workers limita PBKDF2 | 100 mil iterações |
| Cron inválido `0 22 * * 0` | No Cloudflare, 1 = domingo | Usar MON/FRI/SUN |
| Insight "sem reserva" errado | Código lia `aplicado`, que não existe | Usar `.atual` |
| Teste de resgate falhando | O teste digitava "100" (vira R$ 1,00), esperava `ap` errado e reaproveitava estado | Teste corrigido e isolado |
| Enter repetido aplicava resgate 3–4 vezes | Botão continuava ativo durante o fechamento do painel | Desabilitar controles ao fechar |
| Colar "100" virava R$ 1,00 | A máscara tratava colagem como centavos | Colagem lida em reais |
| Lateral não ficava fixa | `overflow-x: hidden` no html/body cria contêiner de rolagem e anula `sticky` | `overflow-x: clip` |
| Página passava do fim no iPhone/iPad | Efeito elástico do Safari | `overscroll-behavior-y: none` |
| Tema não funcionava | Bloco antigo removia `data-theme` | Bloco removido |
| Aviso "branch sem remoto" | Clone só com a `main` no refspec de fetch | Adicionar refspec da branch e configurar o upstream |
| Prévia com acento quebrado | Página sem `<meta charset>` | Recolocar o charset |

- **Prévia isolada:** uma prévia de branch do Cloudflare usa os mesmos segredos do worker, ou seja, o Supabase real. Para revisar sem mexer na carteira real, usar a prévia publicada no Claude ("Prévia Rendum"), com backend simulado no navegador.
- **Rede deste ambiente:** não alcança o site publicado nem CDNs. A conferência é feita pelo leitor de páginas (WebFetch), que guarda cache de 15 min por endereço (usar `?v=...` para forçar).
- **GitHub:** o GraphQL não funciona aqui; PRs e merges são feitos pela API REST (`gh api repos/.../pulls`).

---

## 6. Testes automatizados (`tests/e2e/`)

Rodar: `npm i -D playwright && npx playwright install chromium`, depois `./tests/e2e/run-all.sh`.

**Último resultado:** 214 verificações, 0 falhas.

| Arquivo | Cobre |
|---|---|
| t1 | entrada "Vamos começar", login/cadastro, mostrar senha, erros, envio duplicado |
| t2 | painel, ocultar valores, modais, salvar com falha e nova tentativa, Bazin, independência |
| t3 | falha ao carregar, resgate com falha e nova tentativa, adicionar |
| t4 | adicionar com falha e nova tentativa, sem duplicar |
| t5 | tema, navegação, calendário de proventos, filtros, concorrência |
| t6 | regressão do resgate: máscara, formulário → envio → persistido → saldo, clique duplo e Enter |
| t7 | colagem real com Ctrl+V ("100", "R$ 250", "1.234,56") |
| t8 | lateral fixa (desktop, iPad, mudança de altura), abas sem números, "Adicionar ativo" por página |
| t9 | fim da rolagem sem espaço vazio e sem efeito elástico |

**Limitação:** o Safari real nunca foi testado; iPad e iPhone são simulados no Chromium.

---

## 7. Identidade visual (papel mineral)

| Função | Tema claro | Tema escuro |
|---|---|---|
| Fundo | #F3F2EC | #19251E |
| Superfícies | #FDFDF9 | #213127 |
| Texto | #24382F | #EFF1E7 |
| Texto secundário | #5D695F | #B7C2B3 |
| Bordas | #D6DDD3 | #3B5141 |
| Ação | #205C46 | #A6C9A9 (texto escuro no botão) |
| Seleção | #E8EEE4 | #304734 |
| Lateral | #193D30 | #142B20 |

- **Tipografia:** Newsreader nos títulos; Public Sans no restante, com números tabulares.
- **Tema:** segue o sistema e guarda a escolha manual.
- **Estilo:** sem partículas, brilhos ou animação contínua. Transições curtas, bordas finas e sombras mínimas.

---

## 8. Forma de trabalhar combinada

- Mudanças grandes ficam em branch separada, com PR e prévia isolada antes.
- **Desde 11/10/2026, o Caio autorizou publicar direto**, sem precisar da revisão dele, quando o pedido for claro.
- Nunca usar dados reais da carteira nos testes nem enviar e-mails.
- Não declarar como verificado o que não foi executado.
- Sem modo demonstração e sem recuperação de senha (por decisão anterior).

---

## 9. Pendências possíveis

- O título e a descrição de compartilhamento (og:title) ainda usam "Sua carteira clara. Seu próximo passo consciente."
- Os dados do Bazin são fixos; poderiam vir de dividendos reais.
- Confirmar no Safari do iPad e do iPhone a lateral fixa e o fim da rolagem.
- Os mockups antigos (`public/mockup*.html`) ainda são publicados.
