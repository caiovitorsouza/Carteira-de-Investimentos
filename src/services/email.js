// Envio de e-mail via Resend (https://resend.com).
// Usa fetch nativo pra não adicionar dependência. Sem API key, loga em console
// em vez de enviar (bom pra dev).
import { config } from '../lib/config.js';

const RESEND_URL = 'https://api.resend.com/emails';

export async function sendEmail({ to, subject, html, text }) {
  if (!config.email.enabled || !config.email.apiKey) {
    console.log(`[email] DEV MODE — não enviando. to=${to} subj="${subject}"`);
    return { id: 'dev-' + Date.now(), skipped: true };
  }
  try {
    const r = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.email.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.email.from,
        to: [to],
        subject,
        html,
        text,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.warn(`[email] falhou para ${to}: ${r.status} ${JSON.stringify(body)}`);
      return { error: body?.message || `HTTP ${r.status}` };
    }
    return { id: body.id };
  } catch (e) {
    console.warn(`[email] erro para ${to}: ${e.message}`);
    return { error: e.message };
  }
}

// Extrai um "primeiro nome" a partir do que a gente tem (first_name explícito ou email).
// "caiovitormsouza@gmail.com" → "Caio"
// "john.smith@example.com" → "John"
export function pickFirstName(user) {
  if (user.first_name && user.first_name.trim()) return user.first_name.trim();
  const local = String(user.email || '').split('@')[0];
  const first = local.split(/[._\-]/)[0];
  // Se é "caiovitorsouza" (nome colado), pega as primeiras letras até achar vogal+consoante
  if (first.length > 8) {
    // tenta pegar os primeiros 4-5 chars como estimativa; se não é razoável, usa capitalizado inteiro
    return first.slice(0, 4).charAt(0).toUpperCase() + first.slice(1, 4);
  }
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}
