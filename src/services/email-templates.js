// Templates HTML para e-mails. Mantém a identidade visual do site:
// paleta papel + verde floresta, serifa Georgia pros títulos (sistema), sans pros corpos.
// Clientes de e-mail não suportam fontes customizadas via @import — usa só sistema.
import { config } from '../lib/config.js';
import { pickFirstName } from './email.js';

const brl = new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' });
const pct = (v) => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';

// Variações aleatórias dos cumprimentos pra não ficar sempre a mesma frase
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function layout({ title, previewText, bodyHtml, unsubUrl, appUrl }) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${title}</title>
</head>
<body style="margin:0; padding:0; background:#F5F2E9; font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#122018; line-height:1.5;">
  <!-- preheader (texto da preview no inbox) -->
  <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${previewText}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F2E9;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px; width:100%; background:#FFFCF4; border-radius:20px; border:1px solid rgba(18,32,24,.08); overflow:hidden; box-shadow: 0 20px 50px -30px rgba(18,32,24,.2);">
          <!-- cabeçalho -->
          <tr>
            <td style="padding:28px 32px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-right:10px; vertical-align:middle;">
                    <div style="width:32px; height:32px; background:#1E5435; border-radius:8px; text-align:center; line-height:32px;">
                      <span style="color:#F5F2E9; font-size:16px;">✓</span>
                    </div>
                  </td>
                  <td style="vertical-align:middle;">
                    <span style="font-family: Georgia, 'Times New Roman', serif; font-size:20px; font-weight:600; letter-spacing:-0.01em; color:#122018;">Carteira</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- corpo -->
          <tr>
            <td style="padding:24px 32px 32px;">
              ${bodyHtml}
            </td>
          </tr>
          <!-- footer -->
          <tr>
            <td style="padding:20px 32px 28px; border-top:1px solid rgba(18,32,24,.08); font-size:12px; color:#6E7A72; text-align:center;">
              Você tá recebendo porque se cadastrou em <a href="${appUrl}" style="color:#1E5435; text-decoration:none;">carteira-de-investimentos.onrender.com</a>.<br>
              <a href="${unsubUrl}" style="color:#6E7A72; text-decoration:underline;">Não quero mais esse tipo de e-mail</a>
            </td>
          </tr>
        </table>
        <div style="margin-top:16px; font-size:11.5px; color:#6E7A72;">
          Carteira · Investir com previsibilidade.
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function btn(label, href) {
  return `<a href="${href}" style="display:inline-block; background:#1E5435; color:#F5F2E9; text-decoration:none; font-weight:600; padding:12px 24px; border-radius:999px; font-size:14.5px; margin-top:14px;">${label}</a>`;
}

function btnGhost(label, href) {
  return `<a href="${href}" style="display:inline-block; background:transparent; color:#1E5435; text-decoration:none; font-weight:600; padding:11px 20px; border-radius:999px; font-size:14px; border:1.5px solid #1E5435; margin:6px 4px 0;">${label}</a>`;
}

function serif(size, color) {
  return `font-family: Georgia, 'Times New Roman', serif; font-size:${size}px; font-weight:600; letter-spacing:-0.015em; line-height:1.15; color:${color || '#122018'};`;
}

function num(size, color) {
  return `font-family: 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size:${size}px; font-weight:600; color:${color || '#1E5435'};`;
}

// ============================================================================
// RESUMO SEMANAL — domingo 19h
// ============================================================================
export function weeklyRecapEmail(user, data) {
  const nome = pickFirstName(user);
  const url = config.publicOrigin;
  const unsub = `${url}/api/user/unsubscribe/${user.unsub_token}?kind=weekly`;

  const patrimonio = Number(data.patrimonio || 0);
  const variacao = Number(data.variacao_pct || 0);
  const rendaMes = Number(data.renda_mes || 0);
  const dica = data.dica || null;
  const corVar = variacao >= 0 ? '#1E5435' : '#A13A2E';
  const sinalVar = variacao >= 0 ? '▲' : '▼';

  const saudacoes = [
    `Oi, ${nome}.`,
    `Boa noite, ${nome}.`,
    `Fala, ${nome}.`,
    `${nome}, bora ver como foi a semana?`,
  ];
  const encerramentos = [
    'Até semana que vem.',
    'Boa noite, até semana que vem.',
    'Semana que vem a gente conversa de novo.',
    'Boa semana que começa.',
  ];

  const bodyHtml = `
    <p style="margin:0 0 6px; color:#6E7A72; font-size:14px;">${pick(saudacoes)}</p>
    <h1 style="${serif(26)} margin:0 0 20px;">Seu resumo da semana.</h1>

    <!-- Patrimônio -->
    <div style="background:linear-gradient(135deg, rgba(30,84,53,0.08), rgba(30,84,53,0.02)); border-radius:16px; padding:20px 22px; margin:0 0 18px;">
      <div style="font-size:12.5px; color:#6E7A72; margin-bottom:4px;">Patrimônio atual</div>
      <div style="${num(32)}; margin-bottom:6px;">${brl.format(patrimonio)}</div>
      <div style="font-size:13.5px; color:${corVar}; font-weight:600;">
        ${sinalVar} ${pct(variacao)} na semana
      </div>
    </div>

    ${rendaMes > 0 ? `
    <div style="padding:14px 18px; background:rgba(30,84,53,0.06); border-radius:12px; margin:0 0 18px;">
      <div style="font-size:13px; color:#2A3B32;">
        Nesse mês, você tá projetando receber
        <b style="${num(16)}">${brl.format(rendaMes)}</b>
        em dividendos.
      </div>
    </div>
    ` : ''}

    ${dica ? `
    <h2 style="${serif(18)} margin:28px 0 10px;">Dica da semana pra você</h2>
    <div style="font-size:14.5px; color:#2A3B32;">
      ${dica}
    </div>
    ` : ''}

    <div style="text-align:center; margin-top:28px;">
      ${btn('Ver minha carteira →', url)}
    </div>

    <p style="margin:28px 0 0; color:#6E7A72; font-size:14px;">${pick(encerramentos)}<br>— Carteira</p>
  `;

  return {
    subject: `Seu resumo da semana — ${brl.format(patrimonio)}`,
    html: layout({
      title: 'Resumo da semana',
      previewText: `Patrimônio: ${brl.format(patrimonio)} (${pct(variacao)} na semana).`,
      bodyHtml,
      unsubUrl: unsub,
      appUrl: url,
    }),
    text: `Oi, ${nome}.\n\nSeu resumo da semana:\n\nPatrimônio: ${brl.format(patrimonio)} (${pct(variacao)} na semana)\n${rendaMes > 0 ? `Dividendos projetados: ${brl.format(rendaMes)}/mês\n` : ''}\n${dica ? 'Dica: ' + dica.replace(/<[^>]+>/g,'') + '\n\n' : ''}Ver na carteira: ${url}\n\n— Carteira\n\nNão quero mais esse e-mail: ${unsub}`,
  };
}

// ============================================================================
// LEMBRETE DO DIA 1 — primeiro dia útil do mês, 9h
// ============================================================================
export function monthlyAporteEmail(user, data) {
  const nome = pickFirstName(user);
  const url = config.publicOrigin;
  const unsub = `${url}/api/user/unsubscribe/${user.unsub_token}?kind=monthly`;
  const mesNome = new Date().toLocaleDateString('pt-BR', { month: 'long' });

  const patrimonio = Number(data.patrimonio || 0);
  const nPos = Number(data.n_positions || 0);
  const temFii = !!data.tem_fii;

  const aberturas = [
    `Começou ${mesNome}. Hora de pensar no aporte?`,
    `${nome}, começou ${mesNome}.`,
    `Primeiro dia útil de ${mesNome}. Vem aporte por aí?`,
    `Mês novo, ${nome}.`,
  ];

  const motivacoes = [
    'Consistência bate intensidade. Um aporte pequeno todo mês rende mais que um grandão esporádico.',
    'Lembra: no simulador, R$ 500/mês por 20 anos vira mais de R$ 380 mil. Começar hoje faz diferença de verdade.',
    'A matemática premia quem começa cedo. Você tá no caminho.',
    'Preço da cota oscila. Aporte constante não.',
  ];

  const bodyHtml = `
    <p style="margin:0 0 6px; color:#6E7A72; font-size:14px;">Bom dia, ${nome}.</p>
    <h1 style="${serif(26)} margin:0 0 16px;">${pick(aberturas)}</h1>

    ${patrimonio > 0 ? `
    <div style="background:#F5F2E9; border-radius:14px; padding:16px 20px; margin:16px 0;">
      <div style="font-size:12.5px; color:#6E7A72; margin-bottom:2px;">Hoje você tem</div>
      <div style="${num(26)}; margin-bottom:2px;">${brl.format(patrimonio)}</div>
      <div style="font-size:12.5px; color:#6E7A72;">em ${nPos} ${nPos === 1 ? 'ativo' : 'ativos'}</div>
    </div>
    ` : ''}

    <p style="font-size:14.5px; color:#2A3B32; margin:16px 0;">
      ${pick(motivacoes)}
    </p>

    <p style="font-size:14.5px; color:#2A3B32; margin:20px 0 6px;">
      Qual vai ser o aporte desse mês?
    </p>

    <div style="margin:12px 0;">
      ${btnGhost('FII papel', `${url}/?novo=fii`)}
      ${btnGhost('FII tijolo', `${url}/?novo=fii`)}
      ${btnGhost('Tesouro Direto', `${url}/?novo=tesouro`)}
      ${btnGhost('CDB / LCI / LCA', `${url}/?novo=cdb`)}
    </div>

    <div style="text-align:center; margin-top:26px;">
      ${btn('Abrir carteira →', url)}
    </div>

    ${!temFii && patrimonio > 0 ? `
    <div style="margin-top:28px; padding:14px 18px; border-left:3px solid #1E5435; background:rgba(30,84,53,0.04); font-size:13.5px; color:#2A3B32;">
      <b>Pensamento rápido:</b> você ainda não tem nenhum FII. Se o seu objetivo for renda mensal, vale pelo menos conhecer a classe — paga dividendo mensalmente, isento de IR.
    </div>
    ` : ''}

    <p style="margin:28px 0 0; color:#6E7A72; font-size:14px;">— Carteira</p>
  `;

  return {
    subject: `Começou ${mesNome}. Hora de aportar?`,
    html: layout({
      title: 'Lembrete de aporte',
      previewText: `Primeiro dia útil de ${mesNome}. Hora de pensar no aporte do mês.`,
      bodyHtml,
      unsubUrl: unsub,
      appUrl: url,
    }),
    text: `Bom dia, ${nome}.\n\nComeçou ${mesNome}. Hora de pensar no aporte?\n\n${patrimonio > 0 ? `Hoje você tem ${brl.format(patrimonio)} em ${nPos} ${nPos === 1 ? 'ativo' : 'ativos'}.\n\n` : ''}${pick(motivacoes)}\n\nAbrir carteira: ${url}\n\n— Carteira\n\nNão quero mais esse e-mail: ${unsub}`,
  };
}

// ============================================================================
// Página HTML pro endpoint público de unsubscribe
// ============================================================================
export function unsubscribePage({ ok, kind, email }) {
  const title = ok
    ? 'Pronto, não te envio mais.'
    : 'Não deu pra desinscrever.';
  const sub = ok
    ? `Removemos você dos e-mails ${kind === 'weekly' ? 'de resumo semanal' : kind === 'monthly' ? 'de lembrete mensal' : 'da Carteira'}.`
    : 'Esse link parece inválido ou expirou. Dá uma olhada no app.';
  const url = config.publicOrigin;
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
</head>
<body style="margin:0; padding:0; background:#F5F2E9; font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#122018;">
  <div style="min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px;">
    <div style="max-width:420px; background:#FFFCF4; border:1px solid rgba(18,32,24,.08); border-radius:20px; padding:36px 32px; text-align:center;">
      <div style="font-size:36px; margin-bottom:12px;">${ok ? '✓' : '✕'}</div>
      <h1 style="font-family: Georgia, serif; font-size:24px; font-weight:600; margin:0 0 10px;">${title}</h1>
      <p style="color:#6E7A72; font-size:15px; margin:0 0 24px;">${sub}</p>
      <a href="${url}" style="display:inline-block; background:#1E5435; color:#F5F2E9; text-decoration:none; font-weight:600; padding:12px 24px; border-radius:999px; font-size:14.5px;">Voltar pra Carteira</a>
    </div>
  </div>
</body>
</html>`;
}
