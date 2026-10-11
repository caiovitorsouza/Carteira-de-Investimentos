// Jobs de envio em massa (semanal/mensal). Recebe sql+cfg.

import { sendEmail } from './email.js';
import { weeklyRecapEmail, monthlyAporteEmail } from './email-templates.js';

function dicaDaSemana(positions, profile) {
  const nPos = positions.length;
  const temFii = positions.some(p => p.kind === 'fii');
  const temRf  = positions.some(p => ['selic','pre','ipca','cdb','lci','lca'].includes(p.kind));
  const perfil = profile?.perfil;
  const banco = [];
  if (nPos === 0) banco.push('Carteira vazia. Comece com algo que você entende — Tesouro Selic é o degrau zero sem dor.');
  if (temFii && !temRf) banco.push('<b>Equilíbrio:</b> você só tem FII. Uma base em renda fixa (Tesouro Selic ou CDB) traz previsibilidade e munição pra comprar FII quando o mercado cair.');
  if (perfil === 'conservador' && temFii) banco.push('<b>Pro perfil conservador:</b> FII costuma oscilar bastante no curto prazo. Se o preço da cota cair 15% num mês e isso te tirar o sono, considera reduzir a exposição.');
  if (perfil === 'arrojado' && temRf && !temFii) banco.push('<b>Pro perfil arrojado:</b> você respondeu que tolera risco, mas sua carteira é 100% renda fixa. Em prazos longos, FII e ações historicamente rendem bem mais.');
  if (nPos > 0 && nPos < 5) banco.push('<b>Diversifique aos poucos:</b> você tem só ' + nPos + ' ' + (nPos === 1 ? 'ativo' : 'ativos') + '. Em FII, o ideal é 6-8 ativos de segmentos diferentes. Não precisa fazer tudo hoje — adicione um por mês.');
  if (nPos >= 5) banco.push('<b>Consistência vence:</b> seu patrimônio cresce quando você aporta todo mês, não quando acerta o timing. Mesmo R$ 100/mês fazem diferença em 10 anos.');
  banco.push('<b>Lembra do simulador?</b> Mesmo R$ 300/mês por 20 anos vira mais de R$ 220 mil. O número grande é o tempo, não o aporte.');
  banco.push('<b>Juros compostos:</b> os primeiros anos parecem lentos, mas a partir do ano 10 o dinheiro começa a trabalhar mais que você. Não desiste nos primeiros anos.');
  const semana = Math.floor(Date.now() / (7 * 24 * 3600_000));
  return banco[semana % banco.length];
}

function valorAtual(p) {
  if (p.kind === 'fii' || p.kind === 'acao') {
    const preco = p.price != null ? Number(p.price) : Number(p.avg_price);
    return Number(p.quantity) * preco;
  }
  return Number(p.invested_amount || 0);
}

async function carregarContexto(sql, userId) {
  const [posicoes, docs, snapshots] = await Promise.all([
    sql`SELECT p.id, p.kind, p.ticker, p.quantity, p.avg_price, p.invested_amount,
               q.price, q.last_dividend
          FROM positions p LEFT JOIN market_quotes q ON q.ticker = p.ticker
         WHERE p.user_id = ${userId}`,
    sql`SELECT key, data FROM user_documents WHERE user_id = ${userId} AND key = 'profile'`,
    sql`SELECT total_value FROM portfolio_snapshots WHERE user_id = ${userId} ORDER BY day DESC LIMIT 8`,
  ]);

  const positions = posicoes;
  const profile = docs[0]?.data || null;
  const hist = snapshots.map(r => Number(r.total_value));
  const patrimonio = positions.reduce((s, p) => s + valorAtual(p), 0);
  const semanaAtras = hist[hist.length - 1] || patrimonio;
  const variacao_pct = semanaAtras > 0 ? ((patrimonio - semanaAtras) / semanaAtras) * 100 : 0;
  let renda_mes = 0;
  for (const p of positions) {
    if (p.kind === 'fii' && p.last_dividend != null) renda_mes += Number(p.quantity) * Number(p.last_dividend);
  }
  return { positions, profile, patrimonio, variacao_pct, renda_mes };
}

async function jaEnviou(sql, userId, kind, intervaloHoras) {
  const rows = await sql`
    SELECT 1 FROM email_log
     WHERE user_id = ${userId} AND kind = ${kind} AND error IS NULL
       AND sent_at > now() - (${String(intervaloHoras)} || ' hours')::interval
     LIMIT 1
  `;
  return rows.length > 0;
}

export async function runWeeklyRecap(sql, cfg) {
  const users = await sql`
    SELECT id, email, first_name, unsub_token, email_prefs
      FROM users
     WHERE (email_prefs->>'weekly')::boolean IS TRUE
  `;
  let ok = 0, failed = 0, skipped = 0;
  for (const u of users) {
    try {
      if (await jaEnviou(sql, u.id, 'weekly', 144)) { skipped++; continue; }
      const ctx = await carregarContexto(sql, u.id);
      if (ctx.patrimonio <= 0 && ctx.positions.length === 0) { skipped++; continue; }
      const dica = dicaDaSemana(ctx.positions, ctx.profile);
      const mail = weeklyRecapEmail(cfg, u, { ...ctx, dica });
      const r = await sendEmail(cfg, { to: u.email, subject: mail.subject, html: mail.html, text: mail.text });
      await sql`
        INSERT INTO email_log (user_id, kind, provider_id, error)
        VALUES (${u.id}, 'weekly', ${r.id || null}, ${r.error || null})
      `;
      r.error ? failed++ : ok++;
    } catch (e) {
      console.warn('[email-jobs] weekly erro:', e.message);
      failed++;
    }
  }
  console.log(`[email-jobs] semanal: ${ok} enviados, ${skipped} pulados, ${failed} falhas`);
  return { ok, failed, skipped };
}

export async function runMonthlyAporte(sql, cfg) {
  const users = await sql`
    SELECT id, email, first_name, unsub_token, email_prefs
      FROM users
     WHERE (email_prefs->>'monthly')::boolean IS TRUE
  `;
  let ok = 0, failed = 0, skipped = 0;
  for (const u of users) {
    try {
      if (await jaEnviou(sql, u.id, 'monthly', 24 * 20)) { skipped++; continue; }
      const ctx = await carregarContexto(sql, u.id);
      const tem_fii = ctx.positions.some(p => p.kind === 'fii');
      const mail = monthlyAporteEmail(cfg, u, {
        patrimonio: ctx.patrimonio,
        n_positions: ctx.positions.length,
        tem_fii,
      });
      const r = await sendEmail(cfg, { to: u.email, subject: mail.subject, html: mail.html, text: mail.text });
      await sql`
        INSERT INTO email_log (user_id, kind, provider_id, error)
        VALUES (${u.id}, 'monthly', ${r.id || null}, ${r.error || null})
      `;
      r.error ? failed++ : ok++;
    } catch (e) {
      console.warn('[email-jobs] monthly erro:', e.message);
      failed++;
    }
  }
  console.log(`[email-jobs] mensal: ${ok} enviados, ${skipped} pulados, ${failed} falhas`);
  return { ok, failed, skipped };
}

export async function sendTestEmail(sql, cfg, userId, kind) {
  const rows = await sql`
    SELECT id, email, first_name, unsub_token, email_prefs FROM users WHERE id = ${userId}
  `;
  const u = rows[0];
  if (!u) throw new Error('usuário não encontrado');
  const ctx = await carregarContexto(sql, u.id);
  let mail;
  if (kind === 'weekly') {
    const dica = dicaDaSemana(ctx.positions, ctx.profile);
    mail = weeklyRecapEmail(cfg, u, { ...ctx, dica });
  } else {
    const tem_fii = ctx.positions.some(p => p.kind === 'fii');
    mail = monthlyAporteEmail(cfg, u, { patrimonio: ctx.patrimonio, n_positions: ctx.positions.length, tem_fii });
  }
  const r = await sendEmail(cfg, { to: u.email, subject: mail.subject, html: mail.html, text: mail.text });
  await sql`
    INSERT INTO email_log (user_id, kind, provider_id, error)
    VALUES (${u.id}, ${kind}, ${r.id || null}, ${r.error || null})
  `;
  return r;
}
