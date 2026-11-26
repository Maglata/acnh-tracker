(function () {
  'use strict';

  const L = window.ACNHLogic;
  const DATA = window.ACNH_DATA;
  const CRITTERS = DATA.critters;
  const STATE_KEY = 'acnh-tracker-state';
  const UI_KEY = 'acnh-tracker-ui';
  const CATEGORY_INFO = {
    fish: { label: 'Fish', plural: 'fish', icon: '🐟', where: 'Location' },
    bug: { label: 'Bugs', plural: 'bugs', icon: '🦋', where: 'Location' },
    sea: { label: 'Deep-sea', plural: 'deep-sea creatures', icon: '🦀', where: 'Swimming pattern' },
  };

  const $ = (id) => document.getElementById(id);
  const now = new Date();

  let state = L.defaultState();
  let serverMode = false;
  let saveTimer = null;
  let pendingSave = false;

  const ui = Object.assign(
    { category: 'fish', view: 'month', month: now.getMonth(), hour: 'any', status: 'all', search: '', sort: 'number', dir: 1 },
    readJson(localStorage.getItem(UI_KEY)) || {},
  );
  ui.month = now.getMonth();

  function readJson(text) {
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  }

  const escapeHtml = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

  // ---------- persistence ----------

  function setSaveStatus(text, kind) {
    const el = $('save-status');
    el.textContent = text;
    el.dataset.kind = kind;
  }

  const newer = (a, b) => (a?.updatedAt ?? '') > (b?.updatedAt ?? '');

  async function loadState() {
    let local = null;
    try {
      local = L.normalizeState(readJson(localStorage.getItem(STATE_KEY)) ?? {});
    } catch {
      local = null;
    }
    state = local ?? L.defaultState();

    if (!location.protocol.startsWith('http')) {
      setSaveStatus('💾 Saved in this browser', 'local');
      return;
    }
    try {
      const res = await fetch('/api/progress', { cache: 'no-store' });
      if (!res.ok) throw new Error(res.statusText);
      serverMode = true;
      const remote = res.status === 204 ? null : L.normalizeState(await res.json());
      if (remote && !newer(local, remote)) {
        state = remote;
        localStorage.setItem(STATE_KEY, JSON.stringify(state));
      } else if (local && Object.keys(local.progress).length) {
        await pushToServer();
      }
      setSaveStatus('✅ Auto-saved to save/progress.json', 'server');
    } catch {
      serverMode = false;
      setSaveStatus('💾 Saved in this browser', 'local');
    }
  }

  async function pushToServer(keepalive = false) {
    pendingSave = false;
    const res = await fetch('/api/progress', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
      keepalive,
    });
    if (!res.ok) throw new Error(await res.text());
  }

  function persist({ drive = true } = {}) {
    state.updatedAt = new Date().toISOString();
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    if (drive) scheduleDriveSync();
    if (!serverMode) return;
    pendingSave = true;
    setSaveStatus('⏳ Saving…', 'saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await pushToServer();
        setSaveStatus('✅ Auto-saved to save/progress.json', 'server');
      } catch (err) {
        setSaveStatus('⚠️ Saved in browser only — server save failed', 'error');
        console.error(err);
      }
    }, 300);
  }

  window.addEventListener('pagehide', () => {
    if (serverMode && pendingSave) pushToServer(true).catch(() => {});
  });

  // ---------- Google Drive sync ----------

  const D = window.ACNHDrive;
  const CLIENT_ID = (window.ACNH_CONFIG?.googleClientId ?? '').trim();
  const TOKEN_KEY = 'acnh-tracker-google-token';
  const BASE_KEY = 'acnh-tracker-drive-base';
  const driveEnabled = !!CLIENT_ID && location.protocol.startsWith('http');
  let token = readJson(sessionStorage.getItem(TOKEN_KEY));
  let tokenClient = null;
  let pendingAuth = null;
  let driveTimer = null;
  let driveBusy = false;
  let driveAgain = false;
  let driveDirty = false;

  const getToken = () => (token && Date.now() < token.expiresAt - 60_000 ? token.value : null);
  const drive = D.createDriveStore({ fetch: (...args) => fetch(...args), getToken });
  const driveLinked = () => localStorage.getItem(BASE_KEY) !== null;

  function setDriveStatus(text, kind) {
    const el = $('drive-status');
    el.textContent = text;
    el.dataset.kind = kind;
    el.hidden = !text;
    const button = $('drive-button');
    button.textContent = getToken() ? 'Sign out' : driveLinked() ? 'Reconnect Google' : 'Sign in with Google';
    button.title = getToken() ? 'Stop syncing (your data stays in this browser and in Google Drive)' : 'Save your progress to your Google Drive';
  }

  function loadGoogleScript() {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.oauth2) return resolve();
      const s = Object.assign(document.createElement('script'), { src: 'https://accounts.google.com/gsi/client', async: true });
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load Google sign-in'));
      document.head.append(s);
    });
  }

  function finishAuth(error, response) {
    const p = pendingAuth;
    pendingAuth = null;
    if (!p) return;
    if (error) p.reject(error);
    else p.resolve(response);
  }

  async function initGoogle() {
    $('drive-sync').hidden = false;
    setDriveStatus(driveLinked() ? (getToken() ? '☁️ Connecting…' : '☁️ Google Drive: sign in again to sync') : '', 'idle');
    await loadGoogleScript();
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: D.SCOPE,
      callback: (resp) => {
        if (resp.error) return finishAuth(new Error(resp.error_description || resp.error));
        if (!google.accounts.oauth2.hasGrantedAllScopes(resp, D.SCOPE)) {
          return finishAuth(new Error('Please allow access to Google Drive to sync your progress.'));
        }
        finishAuth(null, resp);
      },
      error_callback: (err) => finishAuth(new Error(err.type === 'popup_closed' ? 'Sign-in was cancelled.' : err.message || err.type)),
    });
    if (getToken()) runDriveSync();
  }

  // Must run synchronously inside the click handler, otherwise browsers block the popup.
  function signIn() {
    if (!tokenClient) return;
    new Promise((resolve, reject) => {
      pendingAuth = { resolve, reject };
      tokenClient.requestAccessToken({ prompt: driveLinked() ? '' : 'consent' });
    })
      .then((resp) => {
        token = { value: resp.access_token, expiresAt: Date.now() + Number(resp.expires_in) * 1000 };
        sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token));
        return runDriveSync();
      })
      .catch((err) => {
        setDriveStatus(`⚠️ ${err.message}`, 'error');
      });
  }

  function signOut() {
    if (!confirm('Stop syncing with Google Drive? Your progress stays in this browser and in your Google Drive.')) return;
    if (token) google.accounts.oauth2.revoke(token.value, () => {});
    token = null;
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(BASE_KEY);
    drive.reset();
    setDriveStatus('', 'idle');
  }

  async function syncDriveOnce() {
    const raw = await drive.load();
    const remote = raw ? L.normalizeState(raw) : null;
    const base = driveLinked() ? L.normalizeState(readJson(localStorage.getItem(BASE_KEY)) ?? {}) : null;
    if (remote) {
      const merged = L.mergeStates(base, state, remote);
      if (!L.sameState(merged, state)) {
        state = merged;
        persist({ drive: false });
        render();
      }
    }
    const snapshot = state;
    if (!remote || !L.sameState(snapshot, remote)) await drive.save(snapshot);
    localStorage.setItem(BASE_KEY, JSON.stringify(snapshot));
  }

  async function runDriveSync() {
    if (!driveEnabled || !getToken()) return;
    if (driveBusy) {
      driveAgain = true;
      return;
    }
    driveBusy = true;
    driveDirty = false;
    setDriveStatus('☁️ Syncing…', 'saving');
    try {
      do {
        driveAgain = false;
        await syncDriveOnce();
      } while (driveAgain);
      setDriveStatus('☁️ Synced to Google Drive', 'server');
    } catch (err) {
      console.error(err);
      if (err.status === 401) {
        token = null;
        sessionStorage.removeItem(TOKEN_KEY);
        setDriveStatus('☁️ Google session expired — sign in again to sync', 'error');
      } else {
        driveDirty = true;
        setDriveStatus('⚠️ Google Drive sync failed — will retry', 'error');
      }
    } finally {
      driveBusy = false;
    }
  }

  function scheduleDriveSync() {
    if (!driveEnabled || !driveLinked()) return;
    driveDirty = true;
    if (!getToken()) {
      setDriveStatus('☁️ Not synced — sign in again', 'error');
      return;
    }
    setDriveStatus('☁️ Syncing…', 'saving');
    clearTimeout(driveTimer);
    driveTimer = setTimeout(runDriveSync, 1000);
  }

  // Pull changes made on other devices when coming back to the tab; flush pending ones when leaving.
  document.addEventListener('visibilitychange', () => {
    if (!driveEnabled || !getToken()) return;
    if (document.visibilityState === 'visible' || driveDirty) {
      clearTimeout(driveTimer);
      runDriveSync();
    }
  });

  // Keeps several open tabs in sync.
  window.addEventListener('storage', (e) => {
    if (e.key !== STATE_KEY || !e.newValue) return;
    try {
      state = L.normalizeState(JSON.parse(e.newValue));
      render();
    } catch {
      /* ignore */
    }
  });

  function saveUi() {
    const { category, view, hour, status, sort, dir } = ui;
    localStorage.setItem(UI_KEY, JSON.stringify({ category, view, hour, status, sort, dir }));
  }

  // ---------- helpers ----------

  const hemi = () => state.settings.hemisphere;
  const progress = (c) => state.progress[c.id] ?? {};

  function timeSummary(c) {
    const groups = [];
    c.schedule[hemi()].forEach((ranges, m) => {
      if (!ranges) return;
      const text = L.formatRanges(ranges);
      const g = groups.find((x) => x.text === text);
      if (g) g.months.push(m);
      else groups.push({ text, months: [m] });
    });
    if (groups.length <= 1) return groups[0]?.text ?? '—';
    return groups.map((g) => `${g.text} (${monthSpanLabel(g.months)})`).join(' / ');
  }

  function monthSpanLabel(months) {
    const short = (m) => L.MONTHS[m].slice(0, 3);
    const runs = [];
    for (const m of months) {
      const last = runs[runs.length - 1];
      if (last && last[last.length - 1] === m - 1) last.push(m);
      else runs.push([m]);
    }
    if (runs.length > 1 && runs[0][0] === 0 && runs[runs.length - 1].at(-1) === 11) runs[0] = [...runs.pop(), ...runs[0]];
    return runs.map((r) => (r.length === 1 ? short(r[0]) : `${short(r[0])}–${short(r.at(-1))}`)).join(', ');
  }

  function matchesFilters(c) {
    const p = progress(c);
    switch (ui.status) {
      case 'not-caught':
        if (p.caught) return false;
        break;
      case 'not-donated':
        if (p.donated) return false;
        break;
      case 'caught-not-donated':
        if (!p.caught || p.donated) return false;
        break;
      case 'donated':
        if (!p.donated) return false;
        break;
    }
    if (ui.hour !== 'any' && !L.isAvailableAt(c, hemi(), ui.month, Number(ui.hour))) return false;
    const q = ui.search.trim().toLowerCase();
    if (q) {
      const hay = [c.name, c.location, c.pattern, c.shadow, CATEGORY_INFO[c.category].label].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  const SORTS = {
    number: (c) => [Object.keys(CATEGORY_INFO).indexOf(c.category), c.number],
    name: (c) => c.name.toLowerCase(),
    price: (c) => c.price ?? -1,
    where: (c) => (c.location ?? c.pattern ?? '').toLowerCase(),
    shadow: (c) => (c.shadow ?? '').toLowerCase(),
  };

  function compareKeys(a, b) {
    if (Array.isArray(a)) {
      for (let i = 0; i < a.length; i++) {
        const r = compareKeys(a[i], b[i]);
        if (r) return r;
      }
      return 0;
    }
    return a < b ? -1 : a > b ? 1 : 0;
  }

  function sorted(list) {
    const key = SORTS[ui.sort] ?? SORTS.number;
    return [...list].sort((a, b) => ui.dir * compareKeys(key(a), key(b)) || compareKeys(SORTS.number(a), SORTS.number(b)));
  }

  // ---------- rendering ----------

  function renderStats() {
    const cats = Object.keys(CATEGORY_INFO);
    const block = (label, list) => {
      const s = L.stats(list, state);
      const pct = (n) => (s.total ? Math.round((n / s.total) * 100) : 0);
      return `<div class="stat">
        <div class="stat-label">${label}</div>
        <div class="bar" title="Donated ${s.donated}/${s.total}"><span class="bar-caught" style="width:${pct(s.caught)}%"></span><span class="bar-donated" style="width:${pct(s.donated)}%"></span></div>
        <div class="stat-nums">🎣 ${s.caught}/${s.total} · 🏛️ ${s.donated}/${s.total}</div>
      </div>`;
    };
    $('stats').innerHTML =
      cats.map((cat) => block(`${CATEGORY_INFO[cat].icon} ${CATEGORY_INFO[cat].label}`, CRITTERS.filter((c) => c.category === cat))).join('') +
      block('Total', CRITTERS);
  }

  function headerCell(label, key) {
    if (!key) return `<th>${label}</th>`;
    const arrow = ui.sort === key ? (ui.dir > 0 ? ' ▲' : ' ▼') : '';
    return `<th class="sortable" data-sort="${key}">${label}${arrow}</th>`;
  }

  function table(list, { showMonths }) {
    const cat = ui.category;
    const where = cat === 'all' ? 'Location / Pattern' : CATEGORY_INFO[cat].where;
    const showShadow = cat !== 'bug';
    if (!list.length) return '<p class="empty">Nothing matches the current filters.</p>';
    const currentMonth = now.getMonth();
    const head = [
      '<th title="Caught">🎣</th>',
      '<th title="Donated to the museum">🏛️</th>',
      headerCell('#', 'number'),
      '<th></th>',
      headerCell('Name', 'name'),
      headerCell('Price', 'price'),
      headerCell(where, 'where'),
      showShadow ? headerCell('Shadow', 'shadow') : '',
      '<th>Time</th>',
      showMonths
        ? L.MONTHS.map((m, i) => `<th class="month-col${i === currentMonth ? ' current' : ''}">${m.slice(0, 3)}</th>`).join('')
        : '',
    ].join('');

    const rows = sorted(list).map((c) => {
      const p = progress(c);
      const time = showMonths ? timeSummary(c) : L.formatRanges(c.schedule[hemi()][ui.month]);
      const months = showMonths
        ? c.schedule[hemi()]
            .map((r, i) => `<td class="month-col${i === currentMonth ? ' current' : ''}${r ? ' yes' : ''}">${r ? '✓' : '-'}</td>`)
            .join('')
        : '';
      const icon = cat === 'all' ? `<span class="cat-icon" title="${CATEGORY_INFO[c.category].label}">${CATEGORY_INFO[c.category].icon}</span>` : '';
      return `<tr class="${p.donated ? 'donated' : p.caught ? 'caught' : ''}">
        <td class="check"><input type="checkbox" data-id="${c.id}" data-flag="caught" ${p.caught ? 'checked' : ''} aria-label="Caught ${escapeHtml(c.name)}"></td>
        <td class="check"><input type="checkbox" data-id="${c.id}" data-flag="donated" ${p.donated ? 'checked' : ''} aria-label="Donated ${escapeHtml(c.name)}"></td>
        <td class="num">${icon}${c.number}</td>
        <td class="img">${c.image ? `<img src="${escapeHtml(c.image)}" alt="" width="48" height="48" loading="lazy">` : ''}</td>
        <td class="name"><a href="${escapeHtml(c.wiki)}" target="_blank" rel="noopener">${escapeHtml(c.name)}</a></td>
        <td class="price">${c.price != null ? c.price.toLocaleString('en-US') : '?'}</td>
        <td>${escapeHtml(c.location ?? c.pattern ?? '')}</td>
        ${showShadow ? `<td>${escapeHtml(c.shadow ?? '')}</td>` : ''}
        <td class="time">${escapeHtml(time)}</td>
        ${months}
      </tr>`;
    });
    return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  }

  function section(title, list, note) {
    return `<section class="list"><h2>${title} <span class="count">${list.length}</span></h2>${note ? `<p class="note">${note}</p>` : ''}${table(list, { showMonths: false })}</section>`;
  }

  function render() {
    renderStats();
    document.querySelectorAll('#category-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.category === ui.category));
    $('hemisphere').value = hemi();
    $('view').value = ui.view;
    $('month').value = String(ui.month);
    $('hour').value = String(ui.hour);
    $('status').value = ui.status;
    $('hour').disabled = ui.view === 'all';

    const pool = ui.category === 'all' ? CRITTERS : CRITTERS.filter((c) => c.category === ui.category);
    const label = ui.category === 'all' ? 'critters' : CATEGORY_INFO[ui.category].plural;
    const hemiLabel = hemi() === 'north' ? 'Northern' : 'Southern';
    const monthName = L.MONTHS[ui.month];
    let html;

    if (ui.view === 'all') {
      const list = pool.filter((c) => matchesFilters(c));
      html = `<section class="list"><h2>All ${label} — ${hemiLabel} hemisphere <span class="count">${list.length}</span></h2>${table(list, { showMonths: true })}</section>`;
    } else {
      const s = L.monthSections(pool, hemi(), ui.month);
      const f = (list) => list.filter((c) => matchesFilters(c));
      const hourNote = ui.hour === 'any' ? '' : `Showing critters available at ${L.formatHour(Number(ui.hour))} in ${monthName}.`;
      html =
        `<p class="summary">${hemiLabel} hemisphere: <strong>${s.available.length}</strong> ${label} can be caught in ${monthName}, ` +
        `<strong>${s.new.length}</strong> of which are new and <strong>${s.leaving.length}</strong> will leave after ${monthName}. ${hourNote}</p>` +
        section(`Available in ${monthName}`, f(s.available)) +
        section(`New in ${monthName}`, f(s.new)) +
        section(`Leaving after ${monthName}`, f(s.leaving));
    }
    $('content').innerHTML = html;
  }

  // ---------- import / export ----------

  function toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (el.hidden = true), 3500);
  }

  function download(filename, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const stamp = () => new Date().toISOString().slice(0, 10);

  async function importFile(file) {
    let incoming;
    try {
      incoming = L.normalizeState(JSON.parse(await file.text()));
    } catch (err) {
      alert(`Import failed: ${err.message}`);
      return;
    }
    const count = Object.keys(incoming.progress).length;
    const current = Object.keys(state.progress).length;
    if (!confirm(`Replace your current progress (${current} caught) with "${file.name}" (${count} caught)?`)) return;
    state = incoming;
    persist();
    render();
    toast(`Imported ${count} entries from ${file.name}`);
  }

  // ---------- events ----------

  function bind() {
    $('month').innerHTML = L.MONTHS.map((m, i) => `<option value="${i}">${m}</option>`).join('');
    $('hour').innerHTML =
      '<option value="any">Any time</option>' + Array.from({ length: 24 }, (_, h) => `<option value="${h}">${L.formatHour(h)}</option>`).join('');

    $('category-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-category]');
      if (!b) return;
      ui.category = b.dataset.category;
      if (ui.category === 'bug' && ui.sort === 'shadow') ui.sort = 'number';
      saveUi();
      render();
    });

    const bindSelect = (id, apply) =>
      $(id).addEventListener('change', (e) => {
        apply(e.target.value);
        saveUi();
        render();
      });
    bindSelect('view', (v) => (ui.view = v));
    bindSelect('month', (v) => (ui.month = Number(v)));
    bindSelect('hour', (v) => (ui.hour = v));
    bindSelect('status', (v) => (ui.status = v));
    $('hemisphere').addEventListener('change', (e) => {
      state = { ...state, settings: { ...state.settings, hemisphere: e.target.value } };
      persist();
      render();
    });
    $('search').addEventListener('input', (e) => {
      ui.search = e.target.value;
      render();
    });
    $('now').addEventListener('click', () => {
      const d = new Date();
      ui.month = d.getMonth();
      ui.hour = String(d.getHours());
      ui.view = 'month';
      saveUi();
      render();
    });

    $('content').addEventListener('change', (e) => {
      const box = e.target.closest('input[type=checkbox][data-id]');
      if (!box) return;
      state = L.setFlag(state, box.dataset.id, box.dataset.flag, box.checked);
      persist();
      render();
    });
    $('content').addEventListener('click', (e) => {
      const th = e.target.closest('th[data-sort]');
      if (!th) return;
      if (ui.sort === th.dataset.sort) ui.dir = -ui.dir;
      else Object.assign(ui, { sort: th.dataset.sort, dir: 1 });
      saveUi();
      render();
    });

    $('export-json').addEventListener('click', () =>
      download(`acnh-progress-${stamp()}.json`, JSON.stringify(state, null, 2) + '\n', 'application/json'),
    );
    $('export-csv').addEventListener('click', () => download(`acnh-progress-${stamp()}.csv`, L.toCsv(CRITTERS, state, hemi()), 'text/csv'));
    $('import').addEventListener('click', () => $('import-file').click());
    $('import-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file) await importFile(file);
    });
    $('reset').addEventListener('click', () => {
      if (!confirm('Clear ALL caught/donated progress? Export first if you want a backup.')) return;
      state = { ...L.defaultState(), settings: state.settings };
      persist();
      render();
      toast('Progress cleared');
    });

    $('source-link').href = DATA.source;
    $('drive-button').addEventListener('click', () => (getToken() ? signOut() : signIn()));
    $('data-date').textContent = `updated ${DATA.updatedAt.slice(0, 10)}`;
  }

  bind();
  loadState().then(() => {
    render();
    if (driveEnabled) initGoogle().catch((err) => setDriveStatus(`⚠️ ${err.message}`, 'error'));
  });
})();
