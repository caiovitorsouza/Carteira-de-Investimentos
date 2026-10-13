# Testes de navegador (e2e) do Rendum

Rodam o `public/index.html` real num Chromium automatizado contra `server.mjs`,
um servidor de teste que simula a API com **dados fictícios** (não usa Supabase,
Cloudflare, carteira real nem envia e-mails).

```bash
npm install
npx playwright install chromium
npm run test:e2e
```

Defina `RENDUM_SHOTS=<pasta>` para o t11 salvar capturas de tela. Cada arquivo começa com a carteira semeada (`/__ctl?seed=1`) num servidor novo.

O executor `run-all.mjs` funciona também no Windows, inclusive em caminhos com
espaços e acentos. Interrompe no primeiro arquivo que falhar, detecta linhas
`FAIL` mesmo quando o teste retorna saída zero e recusa uma porta 8787 já ocupada.
O servidor fictício só escuta em `127.0.0.1`; variáveis de credenciais são
removidas do ambiente dos testes. O executor Bash continua disponível.

| Arquivo | Cobre |
|---|---|
| t1 | login/cadastro, mostrar senha, erros, envio duplicado |
| t2 | painel, ocultar valores, modais, salvar com falha e nova tentativa, Bazin, independência |
| t3 | falha ao carregar, resgate com falha + retry, adicionar |
| t4 | adicionar ativo com falha/retry sem duplicar |
| t5 | tema claro/escuro, navegação, calendário de proventos (anúncios, estimativas sem data, mês seguinte), filtros, concorrência na atualização |
| t6 | **regressão do resgate**: máscara (digitação e colagem), valor no formulário → envio → persistido → saldo, clique duplo e Enter repetido em resgate/venda/aporte, retry sem duplicar |
| t7 | **colagem real** com Ctrl+V pela área de transferência do navegador ("100", "R$ 250", "1.234,56") em resgate e aporte, com o valor enviado ao servidor |
| t8 | **navegação**: lateral fixa na altura da janela (desktop, iPad horizontal, mudança de altura), rolagem própria só quando necessário, abas sem números, foco e endereços, "Adicionar ativo" só em Visão geral e Minha carteira, menu do celular abre sobre a página e fecha com Escape |
| t9 | **fim da rolagem**: sem efeito elástico e sem espaço vazio além do último conteúdo, em desktop, iPad e celular |
| t10 | **proventos recebidos, metas e reserva**: registro/edição/exclusão com confirmação, envio duplicado bloqueado, falha preservando o formulário e reenvio sem duplicar, totais por mês/ano e filtros, estimado x recebido, ocultar valores, falha ao carregar |
| t11 | **simuladores editáveis** (independência com inflação, entradas inválidas, inalcançável, salvar/recarregar, Bazin com origem dos dados), ocultar valores, temas claro/escuro em 390 e 1440 px, movimento reduzido |
| t12 | **regressão de foco**: o foco inicial do painel não rouba um campo já escolhido (valor, observação, data) e o temporizador é cancelado ao fechar; a máscara de moeda não desfaz a seleção do usuário (digitar sobre o valor selecionado o substitui) |
| t13 | **refinamentos de interface**: primeira entrada sem promessas e com glossário localizado, estados vazios com ação única, ações do cabeçalho por página (cotações só onde há preços), seções expansíveis por teclado, celular compacto (botão Menu) em 390 e 320 px nos dois temas |
| t14 | **carteira, logos e menu lateral**: logo só do próprio ticker (recusa outro ticker, ícone genérico e falha de carregamento → monograma de tamanho fixo), Visão geral preservada com logos, seleção horizontal por classe, uma tabela completa, busca e ordenação no conjunto exibido, sem resultados ≠ carteira vazia, ausência de dado não vira zero, detalhes ao lado da tabela (teclado, Escape, foco, ações por cima) e sobre a página em tela intermediária, links só conferidos, ocultar valores (inclui quantidade), menu automático por mouse/foco, pin pelo botão, sem deslocamento do conteúdo e com nomes acessíveis, menu do celular, movimento reduzido, nada cortado em 320/390/768/1440 px claro/escuro com 7 e 100 ativos, nenhum pedido externo |

| t15 | **calendário e estatísticas de proventos**: recebido, anunciado e estimativa com totais separados (sem total geral), legenda só do que existe, estimativas fora da grade, seleção de dia com logos e subtotal, teclado (setas, Home, Enter, Page Up/Down, um dia na ordem do Tab), anúncio futuro sem atalho e sem valor inventado, anúncio passado → registro pré-preenchido com ativo e data (valor informado por você), falha ao carregar recebimentos, valores ocultos, Recebidos com mês em andamento comparado ao mesmo período do mês anterior, mês sem base sem percentual, gráfico como seletor de mês, divisão por ativo, ano anterior, 320/390/768 px nos dois temas, Visão geral preservada |

| t16 | **lista de interesse e simulação**: item no menu, estado vazio com ação única, cadastro com valor OU quantidade, cotação manual sempre datada, quantidade inteira para ação/FII, falha preservando o formulário e reenvio com o mesmo id, envio único com cliques repetidos, abas exclusivas por etapa, menu secundário acessível, cotação da fonte × da carteira × manual identificadas, preço de interesse separado, total planejado sem contar duas vezes, mover entre etapas (envio único, falha avisada), editar e excluir com confirmação, persistência, simulação por valor (unidades inteiras e saldo não utilizado) e por quantidade, valor menor que uma cota, renda fixa sem cotação, recusa sem preço, nada gravado ao simular, valores ocultos, falha ao carregar, 320/390 px nos dois temas |

| t17 | **Sleep Score v2**: composição da Visão geral preservada, avaliação parcial sem reserva, completa com reserva, indisponível com prazo de acesso desconhecido, dimensões e contribuições que somam a nota, cobertura e limitações separadas, fontes com links seguros, informar emissor/prazo/vencimento de uma aplicação (validação, gravação na posição, recálculo), Tesouro e bolsa por regra (sem edição), teclado e foco, valores ocultos, 320/390 px nos dois temas |

| t18 | **apresentação antes do login**: autenticado vai direto à Visão geral sem a apresentação aparecer (inclusive com resposta lenta), Entrar/Criar conta na primeira tela, três etapas com os títulos definidos, ilustrações identificadas como fictícias, sem alegações inventadas, rolagem nativa, movimento coordenado de títulos/ilustrações só no computador, conteúdo sempre visível e acesso fixo, foco ao entrar e voltar, movimento reduzido sem animação, 320/390/768 px nos dois temas |

O t14 também verifica o total da posição nos detalhes e a confirmação de Aportar/Vender (prévia, cancelamento sem envio, gravação no servidor, painel e tabela atualizados, persistência após recarregar e retorno do foco) no painel lateral e no painel modal.

`server.mjs` também aceita `/__ctl?wl=1` (lista de interesse fictícia; `failWatchLoad`, `failWatchWrite`, `watchDelay`), responde a cotação fictícia só para `WISH11`, `/__ctl?recs=1` (recebimentos fictícios no mês atual, no mês anterior, no ano anterior e de um ativo fora da carteira), `/__ctl?many=100` (carteira fictícia com N ativos: nomes longos, valores grandes, sem cotação, sem nome) e serve logos fictícios em `/__test-logo/` (só `TEST11.svg` existe; os demais respondem 404 para simular falha).

Regressões da continuação: t15 mede largura e altura dos alvos e teclado na agenda de duas colunas a 320 px; t17 cobre nota sem reserva, falha/retry, cobertura considerada e ETF legado; t18 cobre sessão de 4 segundos e falha/retry sem mostrar apresentação a autenticados. Unitários/API e linhas PASS de e2e têm contagens separadas.
## Matriz visual

| Arquivo | Cobre |
|---|---|
| t19 | **matriz do refinamento visual**: 320/390/768/1440 px nos dois temas; filtros, tabela completa, toque/inert, hover/foco sem deslocamento ou bloqueio dos controles, abas por teclado, ações com Escape/foco, total planejado, simulação em painel amplo ou sheet, unidades/saldo e nenhuma escrita, remoção da prévia ao excluir o último item, seleção do dia, explicação recolhível, acesso permanente na apresentação, rolagem nativa e movimento reduzido. Capturas em `output/playwright/refino-2026-10-13/`. |

Segunda etapa do refinamento (nomes **Meus planos** e **Cenários**, endereços antigos `#interesse` e `#simuladores` preservados): t5 confere os endereços antigos; t2 e t15 conferem "Seu próximo passo" no lugar dos proventos estimados da Visão geral (o calendário de proventos segue coberto por t5 e t15); t14 confere a lateral sem faixa vazia (expansão por cima, fixar no cabeçalho por teclado), o painel de detalhes com cotação em destaque e grade de posição, o painel ao lado já em 1280 px e o painel vindo da direita em tela intermediária (900 px); t16/t19 conferem os destaques da simulação (aporte usado, quantidade, saldo restante) e um único aviso de que nada é gravado. O servidor fictício responde com `charset=utf-8` (clientes como o PowerShell 5.1 liam o JSON como Latin-1).
