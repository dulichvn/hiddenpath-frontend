/**
 * HiddenPath Vietnam — Shared API Client
 * =======================================
 * Dùng chung cho: index.html, blog.html, blog-post.html,
 *                 hiddenpath-tour-detail.html, about.html
 *
 * Usage:
 *   const tours    = await HP.tours.list({ region: 'north' });
 *   const article  = await HP.articles.get('cash-cards-apps-vietnam');
 *   await HP.inquiries.submit({ full_name, email, message });
 *   await HP.newsletter.subscribe('you@email.com', 'Sarah');
 */

const HP = (() => {
  'use strict';

  // ── Config ─────────────────────────────────────────────────
  const BASE = (window.HP_API_URL !== undefined ? window.HP_API_URL : 'http://localhost:1337') + '/api/v1';

  // ── Core fetch wrapper ─────────────────────────────────────
  async function req(method, path, body = null, token = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`${BASE}${path}`, opts);

    // 204 No Content
    if (res.status === 204) return null;

    const json = await res.json();
    if (!res.ok) {
      const err = new Error(json.message || 'API Error');
      err.code   = json.error;
      err.status = res.status;
      throw err;
    }
    return json;
  }

  const get    = (path, token)        => req('GET',    path, null, token);
  const post   = (path, body, token)  => req('POST',   path, body, token);
  const put    = (path, body, token)  => req('PUT',    path, body, token);
  const patch  = (path, body, token)  => req('PATCH',  path, body, token);
  const del    = (path, token)        => req('DELETE',  path, null, token);

  // ── Query string builder ───────────────────────────────────
  function qs(params = {}) {
    const p = Object.entries(params).filter(([, v]) => v != null && v !== '');
    if (!p.length) return '';
    return '?' + p.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  }

  // ── Token storage ──────────────────────────────────────────
  const auth = {
    get token()   { return sessionStorage.getItem('hp_token'); },
    set token(v)  { v ? sessionStorage.setItem('hp_token', v) : sessionStorage.removeItem('hp_token'); },
    get refresh() { return sessionStorage.getItem('hp_refresh'); },
    set refresh(v){ v ? sessionStorage.setItem('hp_refresh', v) : sessionStorage.removeItem('hp_refresh'); },
    clear()       { sessionStorage.removeItem('hp_token'); sessionStorage.removeItem('hp_refresh'); },
    isLoggedIn()  { return !!this.token; },
  };

  // ================================================================
  //  PUBLIC API MODULES
  // ================================================================

  // ── Tours ──────────────────────────────────────────────────
  const tours = {
    /** List tours. Optional: { region, segment, page, pageSize } */
    async list(params = {}) {
      return get('/tours' + qs(params));
    },
    /** 3 featured tours for homepage */
    async featured() {
      return get('/tours/featured');
    },
    /** Full tour detail with itinerary, highlights, departures */
    async get(slug) {
      return get(`/tours/${slug}`);
    },
  };

  // ── Articles ───────────────────────────────────────────────
  const articles = {
    /** List articles. Optional: { category, page, pageSize } */
    async list(params = {}) {
      return get('/articles' + qs(params));
    },
    /** Single featured article (Editor's Pick) */
    async featured() {
      return get('/articles/featured');
    },
    /** Full article by slug */
    async get(slug) {
      return get(`/articles/${slug}`);
    },
  };

  // ── Departures ─────────────────────────────────────────────
  const departures = {
    /** List upcoming departures. Optional: { tour_slug, tour_id } */
    async list(params = {}) {
      return get('/departures' + qs({ available_only: true, ...params }));
    },
  };

  // ── Team ───────────────────────────────────────────────────
  const team = {
    async list() { return get('/team'); },
    async get(id) { return get(`/team/${id}`); },
  };

  // ── Inquiries ──────────────────────────────────────────────
  const inquiries = {
    /**
     * Submit a booking inquiry.
     * @param {{ full_name, email, phone?, nationality?,
     *           tour_id?, departure_id?, group_size?,
     *           message?, source?, how_heard? }} data
     */
    async submit(data) {
      return post('/inquiries', data);
    },
  };

  // ── Newsletter ─────────────────────────────────────────────
  const newsletter = {
    async subscribe(email, firstName = '', source = 'website') {
      return post('/newsletter/subscribe', { email, first_name: firstName, source });
    },
  };

  // ================================================================
  //  ADMIN API MODULES (JWT required)
  // ================================================================

  const admin = {

    // Auth
    async login(email, password) {
      const res = await post('/auth/login', { email, password });
      auth.token   = res.data.access_token;
      auth.refresh = res.data.refresh_token;
      return res.data;
    },
    async logout() {
      try { await post('/auth/logout', {}, auth.token); } catch(_) {}
      auth.clear();
    },
    async me() { return get('/auth/me', auth.token); },

    // Tours (admin)
    tours: {
      list:    (p)  => get('/tours' + qs(p), auth.token),
      create:  (d)  => post('/tours', d, auth.token),
      update:  (id, d) => put(`/tours/${id}`, d, auth.token),
      publish: (id) => patch(`/tours/${id}/publish`, {}, auth.token),
      delete:  (id) => del(`/tours/${id}`, auth.token),
    },

    // Articles (admin)
    articles: {
      list:    (p)  => get('/articles' + qs(p), auth.token),
      create:  (d)  => post('/articles', d, auth.token),
      update:  (id, d) => put(`/articles/${id}`, d, auth.token),
      publish: (id) => patch(`/articles/${id}/publish`, {}, auth.token),
      delete:  (id) => del(`/articles/${id}`, auth.token),
    },

    // Inquiries (admin)
    inquiries: {
      list:         (p)  => get('/inquiries' + qs(p), auth.token),
      get:          (id) => get(`/inquiries/${id}`, auth.token),
      updateStatus: (id, status, notes) =>
        patch(`/inquiries/${id}/status`, { status, internal_notes: notes }, auth.token),
      delete:       (id) => del(`/inquiries/${id}`, auth.token),
    },

    // Team (admin)
    team: {
      create: (d)      => post('/team', d, auth.token),
      update: (id, d)  => put(`/team/${id}`, d, auth.token),
      delete: (id)     => del(`/team/${id}`, auth.token),
    },

    // Newsletter (admin)
    newsletter: {
      subscribers: (p) => get('/newsletter/subscribers' + qs(p), auth.token),
    },

    // Media (admin)
    media: {
      async upload(file, entityType = 'general', entityId = null) {
        const form = new FormData();
        form.append('file', file);
        if (entityType) form.append('entity_type', entityType);
        if (entityId)   form.append('entity_id',   entityId);
        const res = await fetch(`${BASE}/media`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${auth.token}` },
          body: form,
        });
        return res.json();
      },
    },
  };

  // ================================================================
  //  UI HELPERS (used by integration scripts)
  // ================================================================

  const ui = {
    /**
     * Show a toast notification.
     * @param {string} message
     * @param {'success'|'error'|'info'} type
     * @param {number} duration  ms
     */
    toast(message, type = 'success', duration = 3500) {
      let container = document.getElementById('hp-toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'hp-toast-container';
        container.style.cssText =
          'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:10px;';
        document.body.appendChild(container);
      }

      const colors = {
        success: { bg: '#E8F4F1', border: '#006D5B', text: '#006D5B', icon: '✓' },
        error:   { bg: '#FEF2F2', border: '#DC2626', text: '#991B1B', icon: '✗' },
        info:    { bg: '#EFF6FF', border: '#3B82F6', text: '#1D4ED8', icon: 'ℹ' },
      };
      const c = colors[type] || colors.info;

      const toast = document.createElement('div');
      toast.style.cssText = `
        background:${c.bg};border:1.5px solid ${c.border};color:${c.text};
        border-radius:12px;padding:12px 16px;font-size:.85rem;font-family:'DM Sans',sans-serif;
        font-weight:500;display:flex;align-items:center;gap:10px;
        box-shadow:0 8px 24px rgba(0,0,0,.12);
        animation:hpToastIn .3s ease both;max-width:320px;
      `;

      if (!document.getElementById('hp-toast-style')) {
        const s = document.createElement('style');
        s.id = 'hp-toast-style';
        s.textContent = `
          @keyframes hpToastIn  { from{opacity:0;transform:translateY(12px);} to{opacity:1;transform:translateY(0);} }
          @keyframes hpToastOut { from{opacity:1;transform:translateY(0);} to{opacity:0;transform:translateY(12px);} }
        `;
        document.head.appendChild(s);
      }

      toast.innerHTML = `<span style="font-size:1rem;">${c.icon}</span><span>${message}</span>`;
      container.appendChild(toast);

      setTimeout(() => {
        toast.style.animation = 'hpToastOut .3s ease forwards';
        setTimeout(() => toast.remove(), 300);
      }, duration);
    },

    /** Disable button + show spinner during async action */
    async loading(btn, label, asyncFn) {
      const orig = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<svg style="animation:spin 1s linear infinite;display:inline-block;margin-right:6px;" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>${label}`;
      if (!document.getElementById('hp-spin-style')) {
        const s = document.createElement('style');
        s.id = 'hp-spin-style';
        s.textContent = '@keyframes spin{to{transform:rotate(360deg);}}';
        document.head.appendChild(s);
      }
      try {
        return await asyncFn();
      } finally {
        btn.disabled = false;
        btn.innerHTML = orig;
      }
    },
  };

  // ================================================================
  //  FORM INTEGRATION — wire up inquiry + newsletter forms
  // ================================================================

  /**
   * Wire the inquiry/booking modal submit buttons.
   * Call once after DOM ready:  HP.wireForms();
   */
  function wireForms() {
    // ── Booking modal: "Reserve My Spot" ──────────────────────
    document.querySelectorAll('[data-hp-inquiry]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const form = document.getElementById(btn.dataset.hpInquiry);
        if (!form) return;
        const data = Object.fromEntries(new FormData(form));
        try {
          await ui.loading(btn, 'Sending…', () => inquiries.submit({
            ...data,
            source: 'contact_form',
          }));
          ui.toast('Thanks! We\'ll be in touch within 24 hours.', 'success');
          form.reset();
          // Show WhatsApp confirmation panel in modal
          if (typeof showPanel === 'function') showPanel('modal-panel-wa');
        } catch (err) {
          ui.toast(err.message || 'Something went wrong. Please try again.', 'error');
        }
      });
    });

    // ── Newsletter forms ───────────────────────────────────────
    document.querySelectorAll('[data-hp-newsletter]').forEach(form => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const emailEl = form.querySelector('input[type="email"]');
        const nameEl  = form.querySelector('input[name="first_name"]');
        const btn     = form.querySelector('button[type="submit"]');
        if (!emailEl?.value) return;

        try {
          await ui.loading(btn, 'Subscribing…', () =>
            newsletter.subscribe(emailEl.value, nameEl?.value || '', form.dataset.hpNewsletter || 'website')
          );
          ui.toast('Welcome to the circle! First dispatch lands next Monday.', 'success');
          form.reset();
          // Show success state if present
          const success = document.getElementById('subscribe-success');
          if (success) { form.style.display = 'none'; success.classList.remove('hidden'); }
        } catch (err) {
          if (err.message?.includes('already subscribed')) {
            ui.toast('You\'re already subscribed!', 'info');
          } else {
            ui.toast(err.message || 'Subscription failed.', 'error');
          }
        }
      });
    });
  }

  /**
   * Auto-populate tour select dropdowns from API.
   *   <select data-hp-tour-select></select>
   */
  async function populateTourSelects() {
    const selects = document.querySelectorAll('[data-hp-tour-select]');
    if (!selects.length) return;
    try {
      const { data } = await tours.list({ pageSize: 50 });
      selects.forEach(sel => {
        sel.innerHTML = '<option value="">Select a tour (optional)</option>' +
          data.map(t => `<option value="${t.id}">${t.title}</option>`).join('');
      });
    } catch (_) {}
  }

  // ── Auto-wire on DOM ready ─────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      wireForms();
      populateTourSelects();
    });
  } else {
    wireForms();
    populateTourSelects();
  }

  // ── Public surface ─────────────────────────────────────────
  return {
    tours, articles, departures, team,
    inquiries, newsletter,
    admin, auth, ui,
    wireForms,
  };
})();

// ── Expose on window for inline scripts ───────────────────────
window.HP = HP;
