// Agendador do motor de cotações. Roda em horário de pregão (configurável).
import cron from 'node-cron';
import { config } from '../lib/config.js';
import { refreshAllPortfolios } from '../services/quotes.js';

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
        console.error('[scheduler] erro:', e.message);
      }
    },
    { timezone: 'America/Sao_Paulo' }
  );
  console.log('[scheduler] motor de cotações agendado:', config.quotes.cron);
}
