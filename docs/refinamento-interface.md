# Refinamento visual local — 13/10/2026

Continuação sobre as alterações locais existentes. Sem commit, push, deploy ou migração de produção. Automação mantida pausada.

## Interface

- Apresentação com espaçamento pelo conteúdo, títulos e ilustrações em camadas coordenadas, rolagem nativa e Entrar/Criar conta no cabeçalho fixo. No celular/tablet, movimento simplificado; com movimento reduzido, conteúdo estático. A confirmação de sessão e o acesso direto de autenticados foram preservados.
- Sidebar inicia recolhida, expande com mouse/foco e recolhe 220 ms depois de sair. Botão circular permite manter expandida. A largura reservada é constante: a expansão não desloca nem cobre controles da página. Cápsulas, ícones circulares e destaque verde suave. No móvel, botão Menu, Escape, retorno do foco e inert.
- Carteira com Todos/Ações/FIIs/Renda fixa e filtros adicionais para classes presentes (incluindo Fundos/ETFs). Uma tabela; busca e ordenação sobre o conjunto exibido. Colunas, logos/fallback e detalhes/Aportar/Vender preservados.
- Lista de interesse com uma etapa por vez, abas por teclado, cartões compactos, motivo/observações recolhíveis e ações secundárias em menu. Simular aporte é a ação principal. Em ≥1200 px, prévia editável ao lado; abaixo, painel sob demanda. As duas apresentações usam a mesma função de simulação. Excluir o último item remove a prévia; fechar não é desfeito por resposta assíncrona.
- Calendário com resumo compacto e explicações detalhadas recolhíveis. Dia selecionado e seus eventos destacados; recebido, anunciado e estimado continuam separados. Alvos de toque e teclado da agenda estreita preservados.

Visão geral, Sleep Score, reserva, funções financeiras, backend de produção, validações, autenticação e schema não foram redesenhados ou alterados nesta tarefa. Nenhuma dependência instalada. O servidor fictício ganhou somente o tipo MIME de CSS.

## Evidências

- [Galeria comparativa](../output/playwright/refino-2026-10-13/comparar.html): estado anterior salvo no início desta tarefa × estado refinado; matriz 320/390/768/1440 px nos dois temas. Clique nas imagens para abrir integralmente.
- [Detalhes da carteira](../output/playwright/refino-2026-10-13/detalhes-carteira-1440.png).
- [Log do check](../output/playwright/refino-2026-10-13/check.log).
- t5/t14/t17 adaptados para filtros e tabela única; t15 para explicação recolhível; t16 para abas/menu e simulação sob demanda; t18 mantém regressões de sessão lenta/falha, foco e movimento reduzido. t19 cobre a matriz e o painel amplo, sem remover as verificações financeiras existentes.
- `npm run check` final: **exit 0**; sintaxe, **88/88 testes unitários/API**, **t1–t19 com 839 PASS e zero FAIL**, build Wrangler **somente dry-run** (254,19 KiB / gzip 64,20 KiB). Desses 839, 195 pertencem à matriz t19; não são somados novamente. A contagem anterior de 642 referia-se à suíte anterior; t14 passou de 82 para 84 verificações e t19 acrescentou 195.
- As duas primeiras execuções completas encontraram uma margem extra no fim do calendário e a sidebar cobrindo um botão de Metas. Ambos corrigidos, com as regressões mantidas. Diff sem erros de whitespace e sem padrões de credenciais reais nos arquivos deste refinamento. O aviso pré-existente do Wrangler 3 continua; nenhuma atualização forçada ou de dependências foi feita.

## Referências e limitações

Os quatro PNGs aprovados e o fragmento de apresentação em `Documentos/transferencia-claude/referencias-visuais` foram lidos. As páginas de [parallax](https://21st.dev/@osmosupply/components/parallax-scrolling), [calendário](https://21st.dev/@designali-in/components/calendar) e [estatísticas](https://21st.dev/@ephraimduncan/components/stats-4) abriram no extrator, mas suas demonstrações interativas não foram executadas. A [sidebar online](https://21st.dev/@wensity/components/sidebar) falhou nesse acesso. A direção visual usa os mockups locais e os critérios do pedido; não representa uma cópia certificada das referências online.

Capturas estáticas não mostram parallax. Testes em Chromium com dados fictícios e toque emulado; não substituem aparelho físico ou leitor de tela. Preços, pagamentos e nomes das capturas são exemplos. Nenhum dado real, e-mail ou banco de produção foi acessado.

## Segunda etapa (Claude, 13/10/2026)

Continuação sobre o trabalho acima, sem alterar cálculos, backend de produção, validações, Sleep Score nem critérios de reserva.

- **Lateral:** a coluna reservada passa a ser a da barra recolhida (72 px), sem a faixa vazia de 152 px. Com cursor ou foco, a barra se expande **por cima** do conteúdo (sombra suave), sem deslocar nada; recolhe 220 ms depois de sair. Ao escolher uma página com o cursor, recolhe na hora (o foco vai para o título) e fica recolhida até o cursor sair, para que um novo clique não mude o layout entre pressionar e soltar; pelo teclado (Tab), volta a expandir normalmente. O botão circular do rodapé saiu; "Manter menu aberto" fica discreto no cabeçalho da barra (aparece com a barra expandida, alcançável por teclado, `aria-pressed`). Fixada, a barra ocupa a própria coluna (o conteúdo se ajusta uma vez, por escolha do usuário). Itens em cápsulas com ícone em círculo; página ativa em cápsula clara com ícone em círculo escuro.
- **Detalhes de ações e fundos:** cabeçalho com logo, ticker, nome e classe (chip curto, nome completo para leitor de tela); cotação atual em destaque com a atualização discreta; grade de duas colunas (quantidade, preço médio, valor da posição, total investido, resultado, participação); ações logo abaixo (Aportar mais, Vender cotas, Remover); comparação de 12 meses, detalhes técnicos, dados do Sleep Score e links recolhidos. O painel fica ao lado da tabela quando a área da carteira tem ≥ 820 px (antes 980: a 1280 px a área medida é ~1.110 px e o painel abre ao lado); abaixo disso, painel vindo da direita; no celular, folha inferior. A Visão geral abre o mesmo painel vindo da direita. O texto "Seu ativo renderia…" virou um cenário estimado com as hipóteses explícitas.
- **Minha carteira:** colunas distribuídas pela largura (o ativo tem 30%, os números dividem o resto, alinhados à direita e separados); com os detalhes abertos, ativo/valor/resultado equilibrados; linhas ~10 px mais baixas sem reduzir as áreas de toque (botão do ativo ≥ 40 px). No celular, a disposição muda (resultado sob o valor).
- **Proventos:** título único "Proventos"; abas e período na mesma faixa; resumos compactos; legenda curta; linhas de evento sem repetir "Registrado por você", "Anunciado:" e "Estimado pela…" (o selo de estado diz isso); explicações reunidas em "Entenda os dados" (recolhido).
- **Meus planos** (antes Lista de interesse; `#planos`, com `#interesse` preservado): um aviso único; abas e "Adicionar plano" na mesma faixa; motivo curto à vista e observações sob demanda; simulação com destaques (aporte usado, quantidade, saldo restante), participação antes/depois, distribuição em barras antes/depois e metodologia recolhida. Corrigido: a prévia lateral ficava vazia quando a janela cruzava 1200 px.
- **Visão geral:** só o bloco "Proventos estimados" mudou, para **"Seu próximo passo"**: um plano de "Planejo comprar" escolhido pelo usuário (sem escolha, o de maior prioridade **definida por ele**), com logo, aporte ou quantidade planejada e prévia compacta da participação antes/depois pela mesma simulação. Sem plano: "Criar meu primeiro plano". Sem aporte definido ou sem cotação: diz por quê, sem número. A escolha fica em `settings.proximoPasso`, documento da própria conta já salvo com a carteira (sem migração). Os proventos estimados seguem na página Proventos.
- **Nomes e textos:** Simuladores → **Cenários** (`#cenarios`, com `#simuladores` preservado). Avisos de concentração descrevem o dado, sem mandar diversificar; "Mês novo — hora do aporte" virou "Início do mês".
- **Apresentação:** etapas contínuas (sem divisores e com menos espaço vazio) e uma camada de anéis ao fundo em ritmo próprio; títulos e ilustrações seguem com movimento coordenado só em tela larga; celular sem movimento; movimento reduzido estático.
- **Metas:** o parágrafo que repetia o subtítulo saiu (a frase sobre a carteira atual foi para o subtítulo); motivos de "fora do Sleep Score" encurtados na lista (o texto completo fica no título e para leitor de tela); estado vazio da reserva em uma linha.
- **Texto quebrado na prévia ("Data invÃ¡lida"):** o código estava correto. O servidor fictício respondia JSON sem `charset`; o PowerShell 5.1 lê isso como Latin-1, e os dados da prévia salvos/restaurados por ele voltaram corrompidos. O servidor fictício agora declara `charset=utf-8`. O Worker de produção (Hono) também envia `application/json` sem charset; navegadores leem como UTF-8 (RFC 8259), então não afeta usuários.

Pendências: as dicas do questionário de perfil em Cenários ainda têm frases prescritivas e exemplos de tickers (fora do escopo pedido: não reescrever a aplicação inteira); a referência online da lateral (21st.dev) não pôde ser executada aqui; nenhum teste em aparelho físico ou com leitor de tela real.

## Prévia

Prévia fictícia em `http://127.0.0.1:8787/`. Começa na apresentação. Entrar com `previa@example.test` / `Previa123!` (dados de teste, não uma conta real). A galeria é servida em `http://127.0.0.1:8788/` ao final desta tarefa.

O servidor de prévia é `tests/e2e/server.mjs`, somente loopback e dados em memória. Os dados fictícios encontrados antes de liberar a porta para o check foram preservados e restaurados. Reiniciar o servidor perde o estado em memória. A automação permanece pausada.
