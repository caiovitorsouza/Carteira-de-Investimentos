# Continuação das correções — Codex, 13/10/2026

Trabalho local. Automação pausada. Nenhum commit, push, deploy ou migração de produção.

## Herdado e processos

Claude deixou as cinco etapas, o início do Sleep Score 2.1, um validador de positions.meta ainda sem uso na rota, mensagens de elegibilidade na reserva e classificação por subtipo. Os 15 testes do modelo, incluindo 3.600 comparações determinísticas, passaram antes da continuação.

Não havia execução de testes ativa. Um io_worker órfão do Postgres de testes, com pai ausente, foi encerrado após conferir comando/PID. O observador permaneceu pausado e processos de outras tarefas foram preservados. Uma cópia do estado herdado foi guardada no diretório temporário rendum-continuacao-codex antes de editar.

## Concluído nesta continuação

- Validação ligada à transação: HTTP 400 sem exclusão/bump ao recusar metadados. Legados idênticos só no mesmo id/conta; opcionais nulos removidos; taxa/data e metadados não relacionados preservados.
- Progresso, restante e meses da reserva usam o mesmo valor elegível do Score. Valor vinculado visível separadamente, com motivo de exclusão por posição.
- API retorna classe do catálogo. ETF não vira FII por terminação 11, não herda renda mensal/comparação de FII nem D+2 sem categoria RF/RV. Cotação não reclassifica; indicadores de FII só para FIIs do catálogo.
- Apresentação liberada após confirmar ausência de sessão (401). Demora/falha mostram conferência neutra/retry; autenticados seguem à carteira.
- Agenda de duas colunas até 360 px, com dia da semana, alvos amplos e teclado correspondente. Grade semanal mantida acima disso; links de datas têm pelo menos 44 px.
- Metodologia atualizada. A soma antiga correta era 49 + 10 + 6 + 11 + 1 = 77; seis estatísticas já estavam nos 49. Agora: cálculo 31, finanças API 12, migração 5, concorrência 8, Sleep Score 15 e posições API 7 = 88 unitários/API.

## Verificação

- Direcionados: 22 unitários/API passaram; t17 38 PASS, t15 54, t18 25, t10 58, todos exit 0.
- `npm run check` completo: exit 0; sintaxe, **88/88 unitários/API**, **t1–t18 (642 PASS, zero FAIL)** e build Wrangler somente em dry-run (**254,19 KiB / gzip 64,20 KiB**).
- O executor preserva PW_MODULE para usar o runtime/navegador já preparados. A limpeza do Postgres no Windows usa pg_ctl com espera antes de remover a pasta temporária validada. As tentativas anteriores revelaram um bloqueio de arquivo na limpeza e o override descartado pelo executor; ambos corrigidos, sem mudança de dependências.
- Diff sem erros de whitespace. Nenhum processo de teste/Postgres/navegador criado nesta continuação ficou ativo; observador confirmado com paused:true.
- [Log do check](../output/playwright/continuacao-2026-10-13/check.log).
- Capturas inspecionadas: [calendário 320 claro](../output/playwright/continuacao-2026-10-13/calendario-320-claro.png), [320 escuro](../output/playwright/continuacao-2026-10-13/calendario-320-escuro.png), [reserva 390 escuro](../output/playwright/continuacao-2026-10-13/reserva-390-escuro.png), [Score 1440 escuro](../output/playwright/continuacao-2026-10-13/sleep-score-1440-escuro.png) e [sessão lenta 320](../output/playwright/continuacao-2026-10-13/sessao-lenta-320.png).
- Medição Playwright em 320 px: scrollWidth=320; dias 141×52 px. Com TEST11 vinculado acima do objetivo: valor vinculado R$ 10.200,00, considerado R$ 0,00, progresso 0%. Aos 3,2 segundos de uma sessão autenticada com resposta de 4 segundos: apresentação invisível, conferência neutra visível.

## Limitações

Nenhum dado real usado. Catálogos antigos classificados por heurística precisam de sincronização autorizada por subtipo. ETFs genéricos sem categoria RF/RV têm prazo desconhecido. Dados de resgate informados não substituem contratos. A exceção legada não normaliza registros antigos automaticamente.

WATCHLIST permanece preparada e não aplicada em produção. Seu rollback apaga itens e não é backup. Os testes não substituem catálogo/contratos reais, celular físico ou leitor de tela.

## Refinamento visual posterior

Em 13/10/2026, a interface foi refinada sobre este estado, preservando os cálculos e as correções acima. Ver [relatório do refinamento](refinamento-interface.md) para a galeria antes/depois e a verificação atual: 88 unitários/API e t1–t19 com 839 PASS, zero FAIL. Os 642 PASS citados anteriormente são o registro da suíte anterior. Automação permaneceu pausada; nenhuma publicação ou migração de produção.
