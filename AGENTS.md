# Automação local — Codex e Claude

Em cada nova sessão, antes de editar, confira se há observador ativo:
`powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\control-auto.ps1 -Action status`.
Se ativo, execute o mesmo comando com `-Action pause` e aguarde a mensagem
`Pausada; pode editar`. A ausência de observador significa que não há envio ativo.
Se a pausa não for confirmada, pare usando `scripts/stop-auto.ps1` e confira que
`.rendum-auto/lock` desapareceu antes de editar. Nunca remova lock de processo vivo.

O observador deve ser iniciado pausado em cada sessão. Se um processo persistir
entre sessões, pause-o imediatamente no início da próxima; o processo não detecta
a abertura de chats do Claude ou Codex.

Durante o trabalho, mantenha a pausa. Ao concluir, revise o diff e segredos,
execute `npm run check` e relate o resultado. Retome com `-Action resume` somente
quando o usuário tiver autorizado envio automático para a sessão/trabalho atual.
Essa retomada é explícita e reinicia a espera de 60 segundos. Se houver falhas,
conflitos ou divergência remota, mantenha pausado e explique o impedimento.
Nunca use correção npm forçada, force push ou descarte de alterações para
desbloquear a automação. Não versione `.rendum-auto`, ambientes ou credenciais.

A automação realiza commit/push após validação; o Cloudflare realiza o deploy
pela integração Git. Confirme separadamente commit, push, build e versão ativa.
