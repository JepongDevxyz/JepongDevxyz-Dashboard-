/* JepongDevxyz Dashboard — owner admin page logic. */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };

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

  function show(view) {
    $('#loginView').classList.toggle('hidden', view !== 'login');
    $('#dashView').classList.toggle('hidden', view !== 'dash');
    $('#logoutBtn').classList.toggle('hidden', view !== 'dash');
    icons();
  }

  /* ---------- login ---------- */

  async function checkSession() {
    try {
      var s = await api('/api/admin-login');
      if (s && s.ok) { show('dash'); loadStats(); return; }
    } catch (e) { /* fall through to login */ }
    show('login');
  }

  async function doLogin() {
    var btn = $('#loginBtn');
    var pw = $('#pw').value;
    if (!pw) { toast('Ilagay ang password.', 'err'); return; }
    btn.disabled = true;
    try {
      await api('/api/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      $('#pw').value = '';
      toast('Welcome back!', 'ok');
      show('dash');
      loadStats();
    } catch (e) {
      toast(e.message || 'Maling password.', 'err');
    }
    btn.disabled = false;
  }

  async function doLogout() {
    try {
      await api('/api/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      });
    } catch (e) { /* still go to login view */ }
    picked = null;
    show('login');
    toast('Naka-logout ka na.', 'ok');
  }

  /* ---------- stats ---------- */

  function statCard(icon, label, value, sub) {
    return '<div class="card"><div class="icon"><i data-lucide="' + icon + '"></i></div>' +
      '<div class="label">' + label + '</div><div class="value">' + value +
      (sub ? ' <small>' + sub + '</small>' : '') + '</div></div>';
  }

  function renderStats(s) {
    var cards = '';
    cards += statCard('users', 'Total users', fmt(s.users && s.users.total));
    cards += statCard('user-plus', 'Bago ngayong linggo', fmt(s.users && s.users.new_7d));
    cards += statCard('banknote', 'Revenue', peso(s.revenue && s.revenue.total_php),
      s.revenue ? fmt(s.revenue.topups) + ' top-ups' : '');
    cards += statCard('coins', 'Credits granted', fmt(s.credits && s.credits.granted_total));
    cards += statCard('type', 'Total words', fmt(s.usage && s.usage.words));
    cards += statCard('message-square', 'Total queries', fmt(s.usage && s.usage.queries));
    var g = s.goals;
    cards += statCard('target', 'Goals', g ? fmt(g.active) + ' <small>/ ' + fmt(g.completed) + ' tapos</small>' : '—');
    var todayGuests = (s.guests && s.guests.days && s.guests.days.length)
      ? s.guests.days[s.guests.days.length - 1].active : null;
    cards += statCard('wifi', 'Guests ngayon', todayGuests === null ? '—' : fmt(todayGuests));
    $('#statCards').innerHTML = cards;

    // guest bars
    var bars = $('#guestBars');
    var note = $('#guestNote');
    if (s.guests && s.guests.days) {
      var max = Math.max.apply(null, s.guests.days.map(function (d) { return d.active; }).concat([1]));
      bars.innerHTML = s.guests.days.map(function (d) {
        var h = Math.max(3, Math.round((d.active / max) * 100));
        return '<div class="bar-col"><div class="v">' + d.active + '</div>' +
          '<div class="bar" style="height:' + h + 'px"></div>' +
          '<div class="d">' + d.day.slice(5) + '</div></div>';
      }).join('');
      note.textContent = '';
    } else {
      bars.innerHTML = '';
      note.textContent = 'walang data';
    }

    // revenue by plan
    var pr = $('#planRows');
    if (s.revenue && s.revenue.by_plan) {
      var keys = Object.keys(s.revenue.by_plan);
      pr.innerHTML = keys.length ? keys.map(function (k) {
        var p = s.revenue.by_plan[k];
        return '<tr><td>' + esc(k) + '</td><td>' + fmt(p.count) + '</td><td>' + peso(p.total_php) + '</td></tr>';
      }).join('') : '<tr><td colspan="3" class="muted">Wala pang paid top-ups.</td></tr>';
    } else {
      pr.innerHTML = '<tr><td colspan="3" class="muted">walang data</td></tr>';
    }

    // top users
    var tr = $('#topRows');
    if (s.usage && s.usage.top) {
      tr.innerHTML = s.usage.top.length ? s.usage.top.map(function (u) {
        return '<tr><td>' + esc(u.email || shortId(u.user_id)) + '</td><td>' + fmt(u.words) +
          '</td><td>' + fmt(u.queries) + '</td><td>' + (u.balance === null ? '—' : fmt(u.balance)) + '</td></tr>';
      }).join('') : '<tr><td colspan="4" class="muted">Wala pang usage data.</td></tr>';
    } else {
      tr.innerHTML = '<tr><td colspan="4" class="muted">walang data</td></tr>';
    }
    icons();
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function shortId(id) { return String(id || '').slice(0, 8) + '…'; }

  async function loadStats() {
    try {
      var s = await api('/api/admin-stats');
      renderStats(s || {});
    } catch (e) {
      toast(e.message || 'Hindi ma-load ang stats.', 'err');
    }
  }

  /* ---------- credit adjust ---------- */

  var picked = null;
  var searchTimer = null;

  async function searchUsers() {
    var q = $('#q').value.trim();
    var box = $('#userHits');
    if (q.length < 2) { box.innerHTML = ''; return; }
    try {
      var r = await api('/api/admin-users?q=' + encodeURIComponent(q));
      var users = (r && r.users) || [];
      box.innerHTML = users.length ? users.map(function (u, i) {
        return '<button class="pick" data-i="' + i + '"><span class="em">' + esc(u.email) + '</span><br>' +
          '<span class="bal">balance: ' + (u.balance === null ? '—' : fmt(u.balance)) + '</span></button>';
      }).join('') : '<p class="muted">Walang nahanap.</p>';
      Array.prototype.forEach.call(box.querySelectorAll('.pick'), function (btn) {
        btn.addEventListener('click', function () {
          pickUser(users[Number(btn.getAttribute('data-i'))]);
        });
      });
    } catch (e) {
      box.innerHTML = '<p class="muted">' + esc(e.message || 'Error.') + '</p>';
    }
  }

  function pickUser(u) {
    picked = u;
    $('#userHits').innerHTML = '';
    $('#q').value = u.email;
    $('#pickedEmail').textContent = u.email;
    $('#pickedId').textContent = 'ID: ' + shortId(u.id) + ' (' + u.id + ')';
    $('#pickedBal').textContent = u.balance === null ? '—' : fmt(u.balance);
    $('#pickedBox').classList.remove('hidden');
    icons();
  }

  async function doAdjust() {
    if (!picked) { toast('Pumili muna ng user.', 'err'); return; }
    var amt = $('#amt').value.trim();
    var rsn = $('#rsn').value.trim();
    if (!amt) { toast('Ilagay ang amount.', 'err'); return; }
    if (!rsn) { toast('Ilagay ang reason.', 'err'); return; }
    var btn = $('#adjustBtn');
    btn.disabled = true;
    try {
      var r = await api('/api/admin-credit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: picked.id, delta: amt, reason: rsn }),
      });
      var sign = r.delta > 0 ? '+' : '';
      toast('OK! ' + sign + r.delta + ' credits kay ' + (r.email || shortId(r.user_id)) +
        '. Bagong balance: ' + fmt(r.new_balance), 'ok');
      $('#pickedBal').textContent = fmt(r.new_balance);
      $('#amt').value = '';
      $('#rsn').value = '';
    } catch (e) {
      toast(e.message || 'Hindi na-adjust.', 'err');
    }
    btn.disabled = false;
  }

  /* ---------- wire up ---------- */

  document.addEventListener('DOMContentLoaded', function () {
    $('#loginBtn').addEventListener('click', doLogin);
    $('#pw').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
    $('#logoutBtn').addEventListener('click', doLogout);
    $('#q').addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(searchUsers, 300);
    });
    $('#adjustBtn').addEventListener('click', doAdjust);
    checkSession();
    icons();
  });
})();
