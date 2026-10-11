// Envio de e-mail via Resend. fetch nativo, sem dependências.

export async function sendEmail(cfg, { to, subject, html, text }) {
  if (!cfg.email.enabled || !cfg.email.apiKey) {
    console.log(`[email] DEV MODE — não enviando. to=${to} subj="${subject}"`);
    return { id: 'dev-' + Date.now(), skipped: true };
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfg.email.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: cfg.email.from,
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

export function pickFirstName(user) {
  if (user.first_name && user.first_name.trim()) return user.first_name.trim();
  const local = String(user.email || '').split('@')[0];
  const first = local.split(/[._\-]/)[0];
  if (first.length > 8) {
    return first.slice(0, 4).charAt(0).toUpperCase() + first.slice(1, 4);
  }
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}
