/* JepongDevxyz Dashboard — user dashboard page logic. */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var supabase = null;
  var session = null;

  var toastTimer = null;
  function toast(msg, kind) {
    var el = $('#toast');
    el.innerHTML = '';
    var m = document.createElement('div');
    m.textContent = msg;
    var b = document.createElement('span');
    b.className = 'brand';
    b.textContent = 'Powered by Jepong Devxyz';
    el.appendChild(m);
    el.appendChild(b);
    el.className = 'show ' + (kind || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = ''; }, 3200);
  }

  function icons() { if (window.lucide) lucide.createIcons(); }

  async function api(path, opts) {
    var o = opts || {};
    o.headers = Object.assign({}, o.headers || {});
    if (session && session.access_token) {
      o.headers.Authorization = 'Bearer ' + session.access_token;
    }
    var r;
    try {
      r = await fetch(path, o);
    } catch (e) {
      throw new Error('Walang koneksyon. Subukan ulit.');
    }
    var data = null;
    try { data = await r.json(); } catch (e) { /* non-JSON */ }
    if (!r.ok) {
      throw new Error((data && data.error) || ('Error ' + r.status));
    }
    return data;
  }

  function fmt(n) { return Number(n || 0).toLocaleString('en-PH'); }
  function peso(n) {
    return '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fdate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) { return '—'; }
  }

  function show(view) {
    $('#loginView').classList.toggle('hidden', view !== 'login');
    $('#dashView').classList.toggle('hidden', view !== 'dash');
    $('#signoutBtn').classList.toggle('hidden', view !== 'dash');
    icons();
  }

  function card(icon, label, value, sub) {
    return '<div class="card"><div class="icon"><i data-lucide="' + icon + '"></i></div>' +
      '<div class="label">' + label + '</div><div class="value">' + value +
      (sub ? ' <small>' + sub + '</small>' : '') + '</div></div>';
  }

  function renderStats(s) {
    $('#creditCards').innerHTML =
      card('wallet', 'Credit balance', fmt(s.balance)) +
      card('piggy-bank', 'Total credited', fmt(s.total_credited));

    $('#usageCards').innerHTML =
      card('type', 'Words', fmt(s.usage && s.usage.words)) +
      card('message-square', 'Queries', fmt(s.usage && s.usage.queries));

    var g = s.goals || { active: 0, completed: 0, avg_progress: 0 };
    $('#goalsPanel').innerHTML =
      '<div class="row" style="align-items:center;">' +
      '<div style="flex:1;"><strong>' + fmt(g.active) + '</strong> <span class="muted">active</span></div>' +
      '<div style="flex:1;"><strong>' + fmt(g.completed) + '</strong> <span class="muted">completed</span></div>' +
      '</div>' +
      '<div class="pbar"><div style="width:' + Math.min(100, Math.max(0, g.avg_progress)) + '%"></div></div>' +
      '<p class="muted" style="margin:8px 0 0;">Average progress ng active goals: ' + fmt(g.avg_progress) + '%</p>';

    var tr = $('#topupRows');
    var topups = s.topups || [];
    tr.innerHTML = topups.length ? topups.map(function (t) {
      var cls = t.status === 'paid' ? 'paid' : (t.status === 'pending' ? 'pending' : t.status);
      return '<tr><td>' + esc(t.plan) + '</td><td>' + peso(t.amount_php) + '</td><td>' + fmt(t.credits) +
        '</td><td><span class="badge ' + esc(cls) + '">' + esc(t.status) + '</span></td>' +
        '<td>' + fdate(t.date) + '</td></tr>';
    }).join('') : '<tr><td colspan="5" class="muted">Wala pang top-ups.</td></tr>';
    icons();
  }

  async function loadStats() {
    try {
      var s = await api('/api/user-stats');
      renderStats(s || {});
    } catch (e) {
      toast(e.message || 'Hindi ma-load ang stats.', 'err');
    }
  }

  async function ensureClient() {
    if (supabase) return supabase;
    var r = await fetch('/api/config');
    var cfg = null;
    try { cfg = await r.json(); } catch (e) { /* ignore */ }
    if (!r.ok || !cfg || !cfg.supabase_url) {
      throw new Error('Hindi ma-load ang config. Subukan ulit mamaya.');
    }
    var mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    supabase = mod.createClient(cfg.supabase_url, cfg.publishable_key);
    return supabase;
  }

  async function restoreSession() {
    try {
      var client = await ensureClient();
      var r = await client.auth.getSession();
      session = r && r.data ? r.data.session : null;
    } catch (e) {
      session = null;
    }
    if (session) { show('dash'); loadStats(); }
    else show('login');
  }

  async function doLogin() {
    var email = $('#email').value.trim();
    var pw = $('#pw').value;
    if (!email || !pw) { toast('Ilagay ang email at password.', 'err'); return; }
    var btn = $('#loginBtn');
    btn.disabled = true;
    try {
      var client = await ensureClient();
      var r = await client.auth.signInWithPassword({ email: email, password: pw });
      if (r.error) throw new Error(r.error.message || 'Hindi maka-sign in.');
      session = r.data.session;
      $('#pw').value = '';
      toast('Welcome!', 'ok');
      show('dash');
      loadStats();
    } catch (e) {
      toast(e.message || 'Hindi maka-sign in.', 'err');
    }
    btn.disabled = false;
  }

  async function doSignout() {
    try {
      if (supabase) await supabase.auth.signOut();
    } catch (e) { /* ignore */ }
    session = null;
    show('login');
    toast('Naka-sign out ka na.', 'ok');
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('#loginBtn').addEventListener('click', doLogin);
    $('#pw').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
    $('#signoutBtn').addEventListener('click', doSignout);
    restoreSession();
    icons();
  });
})();
