// Jobs de envio em massa: resumo semanal e lembrete mensal.
// Para cada usuário opt-in, calcula o estado da carteira e envia o e-mail.
import { query } from '../lib/db.js';
import { sendEmail } from './email.js';
import { weeklyRecapEmail, monthlyAporteEmail } from './email-templates.js';

// Monta uma dica da semana baseada no perfil + posições
function dicaDaSemana(user, positions, profile) {
  const nPos = positions.length;
  const temFii = positions.some(p => p.kind === 'fii');
  const temRf  = positions.some(p => ['selic','pre','ipca','cdb','lci','lca'].includes(p.kind));
  const perfil = profile?.perfil;

  const banco = [];

  if (nPos === 0) {
    banco.push('Carteira vazia. Comece com algo que você entende — Tesouro Selic é o degrau zero sem dor.');
  }
  if (temFii && !temRf) {
    banco.push('<b>Equilíbrio:</b> você só tem FII. Uma base em renda fixa (Tesouro Selic ou CDB) traz previsibilidade e munição pra comprar FII quando o mercado cair.');
  }
  if (perfil === 'conservador' && temFii) {
    banco.push('<b>Pro perfil conservador:</b> FII costuma oscilar bastante no curto prazo. Se o preço da cota cair 15% num mês e isso te tirar o sono, considera reduzir a exposição.');
  }
  if (perfil === 'arrojado' && temRf && !temFii) {
    banco.push('<b>Pro perfil arrojado:</b> você respondeu que tolera risco, mas sua carteira é 100% renda fixa. Em prazos longos, FII e ações historicamente rendem bem mais.');
  }
  if (nPos > 0 && nPos < 5) {
    banco.push('<b>Diversifique aos poucos:</b> você tem só ' + nPos + ' ' + (nPos === 1 ? 'ativo' : 'ativos') + '. Em FII, o ideal é 6-8 ativos de segmentos diferentes. Não precisa fazer tudo hoje — adicione um por mês.');
  }
  if (nPos >= 5) {
    banco.push('<b>Consistência vence:</b> seu patrimônio cresce quando você aporta todo mês, não quando acerta o timing. Mesmo R$ 100/mês fazem diferença em 10 anos.');
  }
  banco.push('<b>Lembra do simulador?</b> Mesmo R$ 300/mês por 20 anos vira mais de R$ 220 mil. O número grande é o tempo, não o aporte.');
  banco.push('<b>Juros compostos:</b> os primeiros anos parecem lentos, mas a partir do ano 10 o dinheiro começa a trabalhar mais que você. Não desiste nos primeiros anos.');

  // escolhe uma dica deterministicamente (mas que varia semana a semana)
  const semana = Math.floor(Date.now() / (7 * 24 * 3600_000));
  return banco[semana % banco.length];
}

// Calcula o valor atual de uma posição (lado servidor)
function valorAtual(p, q) {
  if (p.kind === 'fii' || p.kind === 'acao') {
    const preco = p.price != null ? Number(p.price) : Number(p.avg_price);
    return Number(p.quantity) * preco;
  }
  // renda fixa: valor aplicado como proxy (não vale pena recalcular com juros aqui)
  return Number(p.invested_amount || 0);
}

async function carregarContexto(userId) {
  const [posicoes, docs, snapshots] = await Promise.all([
    query(`SELECT p.id, p.kind, p.ticker, p.quantity, p.avg_price, p.invested_amount,
                  q.price, q.last_dividend
             FROM positions p LEFT JOIN market_quotes q ON q.ticker = p.ticker
            WHERE p.user_id = $1`, [userId]),
    query(`SELECT key, data FROM user_documents WHERE user_id = $1 AND key = 'profile'`, [userId]),
    query(`SELECT total_value FROM portfolio_snapshots WHERE user_id = $1 ORDER BY day DESC LIMIT 8`, [userId]),
  ]);

  const positions = posicoes.rows;
  const profile = docs.rows[0]?.data || null;
  const hist = snapshots.rows.map(r => Number(r.total_value));

  const patrimonio = positions.reduce((s, p) => s + valorAtual(p), 0);
  const semanaAtras = hist[hist.length - 1] || patrimonio;
  const variacao_pct = semanaAtras > 0 ? ((patrimonio - semanaAtras) / semanaAtras) * 100 : 0;

  // renda mensal projetada (soma dividendo por cota × cotas, só pra FII)
  let renda_mes = 0;
  for (const p of positions) {
    if (p.kind === 'fii' && p.last_dividend != null) {
      renda_mes += Number(p.quantity) * Number(p.last_dividend);
    }
  }

  return { positions, profile, patrimonio, variacao_pct, renda_mes };
}

// Checa se já enviamos esse tipo de e-mail para esse usuário no intervalo dado
// (sem erro). Garante idempotência quando o cron rodar múltiplas vezes.
async function jaEnviou(userId, kind, intervaloHoras) {
  const { rows } = await query(
    `SELECT 1 FROM email_log
      WHERE user_id = $1 AND kind = $2 AND error IS NULL
        AND sent_at > now() - ($3 || ' hours')::interval
      LIMIT 1`,
    [userId, kind, String(intervaloHoras)]
  );
  return rows.length > 0;
}

// Resumo semanal - roda domingo 19h
export async function runWeeklyRecap() {
  const { rows: users } = await query(
    `SELECT id, email, first_name, unsub_token, email_prefs
       FROM users
      WHERE (email_prefs->>'weekly')::boolean IS TRUE`
  );
  let ok = 0, failed = 0, skipped = 0;
  for (const u of users) {
    try {
      if (await jaEnviou(u.id, 'weekly', 144)) { skipped++; continue; } // ~6 dias
      const ctx = await carregarContexto(u.id);
      if (ctx.patrimonio <= 0 && ctx.positions.length === 0) { skipped++; continue; }
      const dica = dicaDaSemana(u, ctx.positions, ctx.profile);
      const mail = weeklyRecapEmail(u, { ...ctx, dica });
      const r = await sendEmail({ to: u.email, subject: mail.subject, html: mail.html, text: mail.text });
      await query(
        `INSERT INTO email_log (user_id, kind, provider_id, error) VALUES ($1, 'weekly', $2, $3)`,
        [u.id, r.id || null, r.error || null]
      );
      r.error ? failed++ : ok++;
    } catch (e) {
      console.warn('[email-jobs] weekly erro:', e.message);
      failed++;
    }
  }
  console.log(`[email-jobs] semanal: ${ok} enviados, ${skipped} pulados, ${failed} falhas`);
  return { ok, failed, skipped };
}

// Lembrete mensal - roda no primeiro dia útil às 9h
export async function runMonthlyAporte() {
  const { rows: users } = await query(
    `SELECT id, email, first_name, unsub_token, email_prefs
       FROM users
      WHERE (email_prefs->>'monthly')::boolean IS TRUE`
  );
  let ok = 0, failed = 0, skipped = 0;
  for (const u of users) {
    try {
      if (await jaEnviou(u.id, 'monthly', 24 * 20)) { skipped++; continue; } // 20 dias
      const ctx = await carregarContexto(u.id);
      const tem_fii = ctx.positions.some(p => p.kind === 'fii');
      const mail = monthlyAporteEmail(u, {
        patrimonio: ctx.patrimonio,
        n_positions: ctx.positions.length,
        tem_fii,
      });
      const r = await sendEmail({ to: u.email, subject: mail.subject, html: mail.html, text: mail.text });
      await query(
        `INSERT INTO email_log (user_id, kind, provider_id, error) VALUES ($1, 'monthly', $2, $3)`,
        [u.id, r.id || null, r.error || null]
      );
      r.error ? failed++ : ok++;
    } catch (e) {
      console.warn('[email-jobs] monthly erro:', e.message);
      failed++;
    }
  }
  console.log(`[email-jobs] mensal: ${ok} enviados, ${skipped} pulados, ${failed} falhas`);
  return { ok, failed, skipped };
}

// Envia um e-mail de teste pra um usuário específico (pra uso em dev/preview)
export async function sendTestEmail(userId, kind) {
  const { rows } = await query(
    `SELECT id, email, first_name, unsub_token, email_prefs FROM users WHERE id = $1`,
    [userId]
  );
  const u = rows[0];
  if (!u) throw new Error('usuário não encontrado');
  const ctx = await carregarContexto(u.id);
  let mail;
  if (kind === 'weekly') {
    const dica = dicaDaSemana(u, ctx.positions, ctx.profile);
    mail = weeklyRecapEmail(u, { ...ctx, dica });
  } else {
    const tem_fii = ctx.positions.some(p => p.kind === 'fii');
    mail = monthlyAporteEmail(u, { patrimonio: ctx.patrimonio, n_positions: ctx.positions.length, tem_fii });
  }
  const r = await sendEmail({ to: u.email, subject: mail.subject, html: mail.html, text: mail.text });
  await query(
    `INSERT INTO email_log (user_id, kind, provider_id, error) VALUES ($1, $2, $3, $4)`,
    [u.id, kind, r.id || null, r.error || null]
  );
  return r;
}
