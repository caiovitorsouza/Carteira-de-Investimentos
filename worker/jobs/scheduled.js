// Handler de Cron Triggers do Cloudflare. Cada entrada em [triggers.crons]
// do wrangler.toml dispara essa função com `event.cron` sendo a string cron
// exata. Mapeamos cron → tarefa.
//
// Crons são SEMPRE em UTC. BRT = UTC-3. Então:
//   09:00 BRT = 12:00 UTC
//   19:00 BRT = 22:00 UTC
//   10:00-18:00 BRT = 13:00-21:00 UTC

import { makeSql, closeSql } from '../lib/db.js';
import { makeConfig } from '../lib/config.js';
import { refreshAllPortfolios } from '../services/quotes.js';
import { refreshRates } from '../services/rates.js';
import { runWeeklyRecap, runMonthlyAporte } from '../services/email-jobs.js';

export async function handleScheduled(event, env, ctx) {
  const cfg = makeConfig(env);
  const sql = makeSql(env);

  try {
    const cron = event.cron;
    console.log('[scheduled] firing cron:', cron);

    if (cron === '*/5 13-21 * * MON-FRI') {
      // cotações a cada 5min no pregão
      const r = await refreshAllPortfolios(sql, cfg);
      console.log(`[scheduled] cotações: ${r.ok} ok, ${r.failed} falhas de ${r.tickers}`);

    } else if (cron === '0 12 * * MON-FRI') {
      // taxas BCB — 9h BRT dias úteis
      const r = await refreshRates(sql);
      console.log(`[scheduled] taxas BCB: ${r.ok} ok, ${r.failed} falhas`);

    } else if (cron === '0 22 * * SUN') {
      // e-mail semanal — domingo 19h BRT
      if (cfg.email.enabled) {
        const r = await runWeeklyRecap(sql, cfg);
        console.log(`[scheduled] semanal: ${r.ok} ok, ${r.failed} falhas, ${r.skipped} pulados`);
      } else {
        console.log('[scheduled] semanal pulado — EMAIL_ENABLED=false');
      }

    } else if (cron === '0 12 1,2,3 * *') {
      // e-mail mensal — dias 1,2,3 do mês 9h BRT; o job só manda uma vez
      if (cfg.email.enabled) {
        const hoje = new Date();
        const bHour = (hoje.getUTCHours() - 3 + 24) % 24;
        const bDate = new Date(hoje.getTime() - 3 * 3600_000);
        const dow = bDate.getUTCDay(); // 0=dom, 6=sab em BRT
        if (dow === 0 || dow === 6) {
          console.log('[scheduled] mensal pulado — fim de semana em BRT');
        } else {
          const r = await runMonthlyAporte(sql, cfg);
          console.log(`[scheduled] mensal: ${r.ok} ok, ${r.failed} falhas, ${r.skipped} pulados`);
        }
      } else {
        console.log('[scheduled] mensal pulado — EMAIL_ENABLED=false');
      }

    } else {
      console.warn('[scheduled] cron desconhecido:', cron);
    }
  } catch (e) {
    console.error('[scheduled] erro:', e.message, e.stack);
  } finally {
    ctx.waitUntil(closeSql(sql));
  }
}
