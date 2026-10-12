# Testes de navegador (e2e) do Rendum

Rodam o `public/index.html` real num Chromium automatizado contra `server.mjs`,
um servidor de teste que simula a API com **dados fictícios** (não usa Supabase,
Cloudflare, carteira real nem envia e-mails).

```bash
npm install
npx playwright install chromium
npm run test:e2e
```

Cada arquivo começa com a carteira semeada (`/__ctl?seed=1`) num servidor novo.

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
| t5 | tema claro/escuro, navegação, calendário de proventos, filtros, concorrência na atualização |
| t6 | **regressão do resgate**: máscara (digitação e colagem), valor no formulário → envio → persistido → saldo, clique duplo e Enter repetido em resgate/venda/aporte, retry sem duplicar |
| t7 | **colagem real** com Ctrl+V pela área de transferência do navegador ("100", "R$ 250", "1.234,56") em resgate e aporte, com o valor enviado ao servidor |
| t8 | **navegação**: lateral fixa na altura da janela (desktop, iPad horizontal, mudança de altura), rolagem própria só quando necessário, abas sem números, foco e endereços, "Adicionar ativo" só em Visão geral e Minha carteira |
| t9 | **fim da rolagem**: sem efeito elástico e sem espaço vazio além do último conteúdo, em desktop, iPad e celular |
