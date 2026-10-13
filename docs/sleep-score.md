# Sleep Score — metodologia 2.1 (outubro de 2026)

Indicador explicativo, sem validação estatística. Não prevê perdas, não garante segurança e não recomenda compras. Implementação: public/sleep-score.js; Metas e Sleep Score compartilham reserveSummary/reserveEligibility.

## Fórmulas e decisões próprias

| Dimensão | Peso fixo | Cálculo |
|---|---:|---|
| Concentração por emissor | 50% | HHI = soma dos quadrados das participações; N = 1/HHI; nota = 100 × min(1, ln(N)/ln(10)) |
| Prazo de acesso | 30% | Média por valor de toda a carteira: até 1 dia útil 100; bolsa D+2 75; até 30 dias 40; mais de 30 dias 0 |
| Cobertura considerada da reserva | 20% | 100 × min(1, valor elegível vinculado / (gastos mensais × meses)) |

Dimensões e nota geral arredondadas ao inteiro. Faixas: ≥70 poucos pontos de atenção, 40–69 alguns, <40 relevantes. Pesos, escala, faixas, cobertura mínima e elegibilidade são escolhas do modelo, não padrões financeiros nem critérios validados pelas fontes.

## Dados incompletos: limite inferior, não classificação de risco

A versão anterior excluía dados ausentes e renormalizava pesos, aumentando a nota ao apagar informações. A versão 2.1 mantém um limite inferior conservador, com cobertura suficiente. Não afirma que um dado desconhecido signifique alto/baixo risco.

- Valor sem emissor: soma-se ao maior emissor conhecido apenas para calcular o limite inferior. Não cria diversificação aparente.
- Prazo desconhecido: contribui zero ao limite inferior; continua identificado como desconhecido. O denominador é o valor total.
- Menos de 60% do valor com emissor identificado ou prazo conhecido: respectiva dimensão sem nota.
- Reserva não definida, carregando e com falha são estados distintos, todos sem nota geral. Não se usa dado anterior para esconder falhas.
- Nota geral só com as três dimensões disponíveis; pesos nunca renormalizados.

Com as mesmas posições e valores, apagar informação não aumenta a nota; pode torná-la indisponível. Completar dados corretos pode manter/subir esse limite inferior. Isso não vale para alterações de posições, cotações ou correções de informações erradas.

## Emissores e classes

Tesouro Direto conta como Tesouro Nacional. Raiz de quatro caracteres da B3 aproxima um emissor (PETR3/PETR4 juntos), mas não identifica todos os grupos econômicos e pode agrupar emissores distintos. Renda fixa privada/fundos usam emissor informado, com normalização simples de grafias. Fundos/ETFs contam como exposição única por produto; suas carteiras internas não são conhecidas.

A classe de bolsa vem de instruments.kind, nunca do sufixo 11 nem da classe enviada pelo cliente. A sincronização usa subType da Brapi (stock/unit, fii, etf, bdr). O tipo genérico fund é ambíguo. Atualizar preços não reclassifica ativos.

Por compatibilidade com o schema publicado, ETF novo usa a estrutura de posição de ação (quantidade/preço médio). A classe real do catálogo prevalece na exibição e cálculos, inclusive para ETFs antigos gravados como FII. Não se presume renda mensal de FII/ação para ETF. Anúncios e recebimentos continuam separados.

Limitação operacional: catálogos antigos classificados por heurística precisam de sincronização autorizada pelo subtipo. Nenhum catálogo ou dado real foi sincronizado nesta correção.

## Prazo não é liquidez nem estabilidade

- Tesouro: recompra diária a preço de mercado, sujeita a horários e processamento da instituição.
- Ações/FIIs do catálogo: D+2 após negociação. Não medimos compradores/volume/tempo até vender.
- ETF de renda fixa: D+1; ETF de renda variável: D+2. A classe genérica etf não distingue esses produtos: prazo desconhecido, sem inferência por ticker/nome.
- Renda fixa privada/fundos: prazo informado. Deve incluir cotização e liquidação, além de carências. Datas de até 30 dias usam dias de calendário; o nível até 1 dia útil é uma categoria, não agendamento bancário.

## Reserva: vínculos versus cobertura

Valor vinculado soma tudo que o usuário marcou. Cobertura considerada só soma posições elegíveis; progresso, valor restante e meses cobertos em Metas usam o mesmo critério da dimensão reserva do Score.

- Selic: elegível por escolha do modelo, apoiada na indicação do Tesouro para reserva. Resgate continua sujeito a mercado e não garante saldo.
- Prefixado/IPCA+ e bolsa (inclusive ETFs): não elegíveis, devido à variação de mercado no resgate/venda.
- CDB, LCI, LCA e fundos: precisam de acesso até 1 dia útil e resgate: estavel informado pelo usuário. Sem prazo/forma de resgate, não contam.
- Exclusões, dados ausentes e vínculos que não existem mais aparecem separadamente.

Não se verificam crédito, garantias, contratos, taxas ou extratos. Valores de renda fixa são estimados pelo Rendum, podendo diferir do resgate líquido.

## Validação e compatibilidade

PUT /api/portfolio valida emissor, liq, liqData, resgate e venc na transação, antes de apagar posições. Emissor: texto até 60 caracteres; enums fechados; datas reais entre 1900–2200; liqData obrigatória somente para liq: data.

Valor legado inválido pode ser reenviado sem alteração apenas no mesmo id da mesma conta. Novos valores inválidos e cópias para outro id são recusados. Limpar campo remove a chave; taxa, data original e metadados não relacionados são preservados. Nenhuma migração de positions.meta.

## Fontes primárias e limites

As fontes sustentam conceitos e regras dos produtos, não os pesos ou a nota Rendum:

- [DOJ: HHI](https://www.justice.gov/atr/herfindahl-hirschman-index) (participações normalizadas 0–1, equivalentes à escala percentual).
- [B3: códigos](https://borainvestir.b3.com.br/glossario/codigos-das-acoes/) e [liquidação](https://borainvestir.b3.com.br/glossario/data-de-liquidacao/).
- [B3: ETF renda fixa D+1](https://www.b3.com.br/pt_br/produtos-e-servicos/negociacao/renda-fixa/etf-de-renda-fixa.htm) e [renda variável D+2](https://www.b3.com.br/pt_br/produtos-e-servicos/negociacao/renda-variavel/etf-de-renda-variavel.htm).
- [Tesouro: regras e preço de mercado](https://www.tesourodireto.com.br/en/sobre-o-tesouro/regras-e-regulamento) e [Selic para reserva](https://www.tesourodireto.com.br/produtos/titulos/selic).
- [Brapi: tipos/subtipos](https://brapi.dev/docs/acoes/list).

Não mede volatilidade, correlação, crédito, FGC, fundamentos, volume, diversificação interna de fundos ou adequação pessoal completa. Setor, vencimentos e falta de cotação são informativos, sem peso.

## Regressões

sleep-score.test.mjs cobre os quatro defeitos de perda de informação e 3.600 comparações determinísticas. positions-api.test.mjs testa validação/atomicidade/legados/isolamento/catálogo. t17 testa reserva, falha/retry, ETFs e interface; t15 testa largura e altura dos alvos e teclado; t18 testa sessão lenta e falha de autenticação.