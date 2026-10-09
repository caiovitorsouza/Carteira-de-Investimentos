// api.js — camada única de acesso ao back-end. Troca o localStorage por fetch.
// Todas as chamadas usam cookies de sessão (credentials:'include').
export const api = {
  async _req(method, path, body) {
    const res = await fetch(path, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* sem corpo */ }
    if (!res.ok) {
      const err = new Error(data?.error || ('http_' + res.status));
      err.status = res.status; err.data = data;
      throw err;
    }
    return data;
  },

  // --- autenticação ---
  register: (email, password) => api._req('POST', '/api/auth/register', { email, password }),
  login:    (email, password) => api._req('POST', '/api/auth/login', { email, password }),
  logout:   () => api._req('POST', '/api/auth/logout'),
  me:       () => api._req('GET', '/api/auth/me'),

  // --- mercado ---
  search:   (q) => api._req('GET', '/api/market/search?q=' + encodeURIComponent(q)),
  quote:    (t) => api._req('GET', '/api/market/quote/' + encodeURIComponent(t)),
  rates:    () => api._req('GET', '/api/market/rates'),
  explore:  (filter, kind) => api._req('GET',
              '/api/market/explore?filter=' + encodeURIComponent(filter) +
              '&kind=' + encodeURIComponent(kind)),

  // --- carteira ---
  getPortfolio:  () => api._req('GET', '/api/portfolio'),
  savePortfolio: (snapshot) => api._req('PUT', '/api/portfolio', snapshot),
  refresh:       () => api._req('POST', '/api/portfolio/refresh'),
  snapshot:      (total) => api._req('POST', '/api/portfolio/snapshot', { total }),

  // --- conta ---
  getEmailPrefs: () => api._req('GET', '/api/user/email-prefs'),
  saveEmailPrefs: (prefs) => api._req('PUT', '/api/user/email-prefs', prefs),
  sendTestEmail: (kind) => api._req('POST', '/api/user/email-test', { kind }),
};
