// Agendador: motor de cotações (a cada 5min no pregão) + taxas BCB (1x por dia).
import cron from 'node-cron';
import { config } from '../lib/config.js';
import { refreshAllPortfolios } from '../services/quotes.js';
import { refreshRates } from '../services/rates.js';

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
}
