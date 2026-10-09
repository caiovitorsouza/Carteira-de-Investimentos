// Agendador: cotações, taxas do BCB e e-mails periódicos.
import cron from 'node-cron';
import { config } from '../lib/config.js';
import { refreshAllPortfolios } from '../services/quotes.js';
import { refreshRates } from '../services/rates.js';
import { runWeeklyRecap, runMonthlyAporte } from '../services/email-jobs.js';

export function startQuoteScheduler() {
  if (!cron.validate(config.quotes.cron)) {
    console.warn('[scheduler] QUOTE_REFRESH_CRON inválido, agendador desligado:', config.quotes.cron);
    return;
  }
  cron.schedule(
    config.quotes.cron,
    async () => {
      try {
        const r = await refreshAllPortfolios();
        console.log(`[scheduler] cotações: ${r.ok} ok, ${r.failed} falhas de ${r.tickers}`);
      } catch (e) {
        console.error('[scheduler] erro cotações:', e.message);
      }
    },
    { timezone: 'America/Sao_Paulo' }
  );
  console.log('[scheduler] motor de cotações agendado:', config.quotes.cron);

  // Taxas do Banco Central: 1x por dia, 09:00 BRT (depois do fechamento do mercado anterior)
  cron.schedule(
    '0 9 * * 1-5',
    async () => {
      try {
        const r = await refreshRates();
        console.log(`[scheduler] taxas BCB: ${r.ok} ok, ${r.failed} falhas`);
      } catch (e) {
        console.error('[scheduler] erro taxas:', e.message);
      }
    },
    { timezone: 'America/Sao_Paulo' }
  );
  console.log('[scheduler] taxas BCB agendadas: 09:00 BRT dias úteis');

  // Primeira carga: tenta atualizar taxas agora para popular o cache
  refreshRates().catch((e) => console.warn('[scheduler] carga inicial de taxas falhou:', e.message));

  // E-mails periódicos (só rodam se EMAIL_ENABLED=true no .env)
  if (config.email.enabled) {
    // Resumo semanal: domingo às 19h BRT
    cron.schedule(
      '0 19 * * 0',
      async () => {
        try {
          const r = await runWeeklyRecap();
          console.log(`[scheduler] e-mail semanal: ${r.ok} ok, ${r.failed} falhas`);
        } catch (e) {
          console.error('[scheduler] erro semanal:', e.message);
        }
      },
      { timezone: 'America/Sao_Paulo' }
    );
    console.log('[scheduler] e-mail semanal agendado: domingo 19:00 BRT');

    // Lembrete do dia 1 do mês às 09:00 BRT (dias úteis)
    cron.schedule(
      '0 9 1-3 * *',   // tenta nos dias 1, 2 e 3 — mas o job só manda uma vez por mês
      async () => {
        try {
          // Protege: só manda no PRIMEIRO dia útil do mês
          const hoje = new Date();
          const dow = hoje.getDay(); // 0=dom, 6=sab
          if (dow === 0 || dow === 6) return;
          // se não é dia 1 e já teve envio esse mês, pula (idempotência via email_log fica no job)
          const dia = hoje.getDate();
          if (dia > 3) return;
          const r = await runMonthlyAporte();
          console.log(`[scheduler] e-mail mensal: ${r.ok} ok, ${r.failed} falhas`);
        } catch (e) {
          console.error('[scheduler] erro mensal:', e.message);
        }
      },
      { timezone: 'America/Sao_Paulo' }
    );
    console.log('[scheduler] e-mail mensal agendado: primeiro dia útil 09:00 BRT');
  } else {
    console.log('[scheduler] e-mails desabilitados (EMAIL_ENABLED=false)');
  }
}
