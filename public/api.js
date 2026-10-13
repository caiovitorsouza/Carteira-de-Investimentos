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

  // --- proventos recebidos, metas, reserva e premissas (persistidos no servidor) ---
  getFinance:       () => api._req('GET', '/api/finance'),
  createReceipt:    (r) => api._req('POST', '/api/finance/receipts', r),
  updateReceipt:    (id, r) => api._req('PUT', '/api/finance/receipts/' + encodeURIComponent(id), r),
  deleteReceipt:    (id) => api._req('DELETE', '/api/finance/receipts/' + encodeURIComponent(id)),
  createGoal:       (g) => api._req('POST', '/api/finance/goals', g),
  updateGoal:       (id, g) => api._req('PUT', '/api/finance/goals/' + encodeURIComponent(id), g),
  deleteGoal:       (id) => api._req('DELETE', '/api/finance/goals/' + encodeURIComponent(id)),
  saveReserve:      (r) => api._req('PUT', '/api/finance/reserve', r),
  deleteReserve:    () => api._req('DELETE', '/api/finance/reserve'),
  saveSimulator:    (key, data) => api._req('PUT', '/api/finance/simulators/' + encodeURIComponent(key), data),
  deleteSimulator:  (key) => api._req('DELETE', '/api/finance/simulators/' + encodeURIComponent(key)),

  // --- lista de interesse (privada; não registra compras) ---
  getWatchlist:     () => api._req('GET', '/api/watchlist'),
  createWatch:      (w) => api._req('POST', '/api/watchlist', w),
  updateWatch:      (id, w) => api._req('PUT', '/api/watchlist/' + encodeURIComponent(id), w),
  deleteWatch:      (id) => api._req('DELETE', '/api/watchlist/' + encodeURIComponent(id)),

  // --- conta ---
  getEmailPrefs: () => api._req('GET', '/api/user/email-prefs'),
  saveEmailPrefs: (prefs) => api._req('PUT', '/api/user/email-prefs', prefs),
  sendTestEmail: (kind) => api._req('POST', '/api/user/email-test', { kind }),
};
