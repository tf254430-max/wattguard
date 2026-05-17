/* WattGuard dashboard - vanilla JS + Chart.js + SSE. */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const fmt2 = n => (Math.round(n * 100) / 100).toFixed(2);
  const fmtInt = n => Math.round(n).toLocaleString();

  // ---- clock ------------------------------------------------------------
  function tickClock() {
    const d = new Date();
    $('clock').textContent = d.toLocaleTimeString([], { hour12: false });
  }
  setInterval(tickClock, 1000); tickClock();

  // ---- charts -----------------------------------------------------------
  const liveChart = new Chart($('chart-live'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Power (W)',
        data: [],
        borderColor: '#dc3545',
        backgroundColor: 'rgba(220,53,69,.15)',
        fill: true,
        tension: 0.25,
        pointRadius: 0,
      }],
    },
    options: {
      responsive: true,
      animation: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxRotation: 0, autoSkipPadding: 20 } },
        y: { beginAtZero: true, ticks: { callback: v => v + ' W' } },
      },
    },
  });

  // Stable colour per appliance — keeps each slice recognisable across
  // refreshes and means a single-appliance pie isn't always blue.
  const APPLIANCE_COLORS = {
    lights:   '#ffc107',  // yellow
    tv:       '#6f42c1',  // purple
    fridge:   '#0dcaf0',  // cyan
    iron:     '#fd7e14',  // orange
    kettle:   '#dc3545',  // red
    ac:       '#198754',  // green
    baseline: '#6c757d',  // gray — idle / unattributed load
  };
  const FALLBACK_COLOR = '#adb5bd';

  const pieChart = new Chart($('chart-pie'), {
    type: 'doughnut',
    data: { labels: [], datasets: [{ data: [], backgroundColor: [] }] },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
  });

  const dailyChart = new Chart($('chart-daily'), {
    type: 'bar',
    data: { labels: [], datasets: [{
      label: 'Wh',
      data: [],
      backgroundColor: '#0d6efd',
    }] },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } },
    },
  });

  const hourlyChart = new Chart($('chart-hourly'), {
    type: 'line',
    data: { labels: [], datasets: [{
      label: 'Wh',
      data: [],
      borderColor: '#198754',
      backgroundColor: 'rgba(25,135,84,.15)',
      fill: true,
      tension: 0.25,
    }] },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } },
    },
  });

  // ---- KPI / alert update ----------------------------------------------
  function setStatus(state, label) {
    const pill = $('status-pill');
    pill.className = 'badge ' + ({
      ok: 'bg-success', warn: 'bg-warning text-dark',
      err: 'bg-danger', off: 'bg-secondary',
    }[state] || 'bg-secondary');
    pill.textContent = label;
  }

  const SEVERITY_RANK = { ok: 0, caution: 1, warning: 2, critical: 3 };
  let lastSeverityShown = null;
  const BASE_TITLE = 'WattGuard - Yaka Power Monitor';

  function setAlertStrip(severity, units) {
    const strip = $('alert-strip');
    const map = {
      ok:       { cls: 'alert-success', text: 'All good. Power flowing normally.' },
      caution:  { cls: 'alert-info',    text: `Caution: ${fmt2(units)} Yaka units left.` },
      warning:  { cls: 'alert-warning', text: `Warning: only ${fmt2(units)} units left - top up soon.` },
      critical: { cls: 'alert-danger',  text: `CRITICAL: ${fmt2(units)} units left. Top up immediately.` },
    };
    const m = map[severity] || map.ok;
    strip.className = 'alert ' + m.cls + ' rounded-0 mb-0 py-2 small';
    strip.textContent = m.text;

    // Update the browser tab title so the alert is visible even when the
    // tab is in the background.
    if (severity === 'ok') {
      document.title = BASE_TITLE;
    } else {
      const icon = severity === 'critical' ? '\u{1F6A8}' :
                   severity === 'warning'  ? '\u{26A0}\u{FE0F}' :
                                             '\u{2139}\u{FE0F}';
      document.title = `${icon} ${severity.toUpperCase()} ${fmt2(units)}u - WattGuard`;
    }

    // Beep when the alert situation escalates, AND once on first
    // observation if the page loads already in warning/critical state
    // (otherwise the demo "open the page, see no alert sound" feels
    // broken even though the strip is red).
    const escalated = lastSeverityShown !== null &&
        SEVERITY_RANK[severity] > SEVERITY_RANK[lastSeverityShown];
    const firstAlert = lastSeverityShown === null && severity !== 'ok';
    if (escalated || firstAlert) {
      playAlertBeep(severity);
    }
    lastSeverityShown = severity;
  }

  // Single long-lived AudioContext, created lazily and resumed on every
  // user gesture. Browsers refuse to *start* a fresh AudioContext from a
  // callback that isn't directly in a user-gesture stack, which is why
  // beeps fired from a setTimeout-driven refresh would silently fail.
  let audioCtx = null;
  function ensureAudio() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { /* ignore — audio is a nice-to-have */ }
  }
  // Unlock audio on the first user interaction of any kind.
  ['click', 'keydown', 'touchstart'].forEach(ev => {
    document.addEventListener(ev, ensureAudio, { passive: true });
  });

  function playAlertBeep(severity) {
    ensureAudio();
    if (!audioCtx) return;
    try {
      const beeps = severity === 'critical' ? 3 : 1;
      const freq  = severity === 'critical' ? 1000 : 660;
      const now = audioCtx.currentTime;
      for (let i = 0; i < beeps; i++) {
        const start = now + i * 0.28;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
        osc.start(start);
        osc.stop(start + 0.24);
      }
    } catch (e) { /* ignore */ }
  }

  function fmtEta(seconds) {
    if (!seconds || seconds <= 0) return { big: '--', small: 'no consumption' };
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h >= 24) {
      const d = Math.floor(h / 24);
      const rh = h % 24;
      return { big: `${d}d ${rh}h`, small: 'at current load' };
    }
    return { big: `${h}h ${m}m`, small: 'at current load' };
  }

  function updateKpis(s) {
    $('kpi-power').textContent = fmtInt(s.power_w || 0);
    $('kpi-current').textContent = fmt2(s.i_rms || 0);
    $('kpi-voltage').textContent = fmtInt(s.voltage_assumed || 240);
    $('kpi-units').textContent = fmt2(s.units_remaining || 0);
    $('kpi-purchased').textContent = fmt2(s.units_purchased || 0);
    const eta = fmtEta(s.eta_seconds);
    $('kpi-eta').textContent = eta.big;
    $('kpi-eta-detail').textContent = eta.small;
    setAlertStrip(s.severity, s.units_remaining || 0);
  }

  // ---- live ring buffer -------------------------------------------------
  const LIVE_MAX = 300;  // 5 minutes at 1 Hz
  const liveLabels = [];
  const liveData = [];

  function pushLive(ts, p) {
    const t = new Date(ts * 1000).toLocaleTimeString([], { hour12: false });
    liveLabels.push(t);
    liveData.push(p);
    while (liveLabels.length > LIVE_MAX) {
      liveLabels.shift();
      liveData.shift();
    }
    liveChart.data.labels = liveLabels;
    liveChart.data.datasets[0].data = liveData;
    liveChart.update('none');
  }

  // ---- events / topups feeds -------------------------------------------
  function eventEmoji(type, severity) {
    if (type === 'high_draw') return '!';
    if (type === 'low_yaka' && severity === 'critical') return 'X';
    if (type === 'low_yaka') return '~';
    if (type === 'topup') return '+';
    return '*';
  }

  function renderEvents(items) {
    const list = $('events-list');
    list.innerHTML = '';
    if (!items.length) {
      const li = document.createElement('li');
      li.className = 'list-group-item text-muted';
      li.textContent = 'No events yet.';
      list.appendChild(li);
      return;
    }
    for (const e of items) {
      const li = document.createElement('li');
      li.className = 'list-group-item d-flex justify-content-between align-items-center';
      const left = document.createElement('span');
      left.innerHTML = `<span class="event-icon">${eventEmoji(e.event_type, e.severity)}</span>`;
      const txt = document.createElement('span');
      txt.textContent = ` ${e.event_type}` + (e.severity ? ` (${e.severity})` : '');
      left.appendChild(txt);
      const when = document.createElement('span');
      when.className = 'text-muted small';
      when.textContent = new Date(e.ts * 1000).toLocaleString();
      li.appendChild(left);
      li.appendChild(when);
      list.appendChild(li);
    }
  }

  function renderTopups(items) {
    const list = $('topups-list');
    list.innerHTML = '';
    if (!items.length) {
      const li = document.createElement('li');
      li.className = 'list-group-item text-muted';
      li.textContent = 'No top-ups recorded.';
      list.appendChild(li);
      return;
    }
    for (const t of items) {
      const li = document.createElement('li');
      li.className = 'list-group-item d-flex justify-content-between';
      const left = document.createElement('span');
      left.textContent = `${fmt2(t.units)} units`
        + (t.reference ? ` - ${t.reference}` : '');
      const when = document.createElement('span');
      when.className = 'text-muted small';
      when.textContent = new Date(t.purchased_at * 1000).toLocaleString();
      li.appendChild(left);
      li.appendChild(when);
      list.appendChild(li);
    }
  }

  // ---- scenario buttons -------------------------------------------------
  const scenarioState = {};

  function renderScenario(profiles) {
    const wrap = $('scenario-buttons');
    // The profile list is static, so build the buttons once and leave
    // them alone on subsequent refreshes — otherwise every 10 s tick
    // (or any SSE-triggered refresh) would tear them down and the
    // visual ON state would flip back to OFF mid-demo.
    if (wrap.children.length > 0) return;
    Object.entries(profiles).forEach(([key, p]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-outline-secondary scenario-btn off';
      btn.dataset.appliance = key;
      btn.textContent = `${p.label} OFF`;
      btn.addEventListener('click', () => toggleScenario(key, p.label));
      wrap.appendChild(btn);
    });
  }

  async function toggleScenario(appliance, label) {
    const next = !scenarioState[appliance];
    const r = await fetch(`/api/scenario/${appliance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: next ? 'on' : 'off' }),
    });
    if (!r.ok) return;
    scenarioState[appliance] = next;
    const btn = document.querySelector(`button[data-appliance="${appliance}"]`);
    btn.classList.toggle('on', next);
    btn.classList.toggle('off', !next);
    btn.textContent = `${label} ${next ? 'ON' : 'OFF'}`;

    // SSE updates the live chart + power/current KPIs within ~1 s, but the
    // slower KPIs (units left, ETA, severity strip) and the appliance pie
    // depend on the full /api/* fan-out. Fire two extra refreshes after a
    // toggle so the consequence chain is visible inside the demo window
    // instead of waiting for the next 10 s tick.
    setTimeout(refreshAll, 2000);
    setTimeout(refreshAll, 5000);
  }

  // ---- forms ------------------------------------------------------------
  $('topup-form').addEventListener('submit', async ev => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const r = await fetch('/api/topups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        units: Number(fd.get('units')),
        reference: fd.get('reference'),
      }),
    });
    if (r.ok) {
      ev.target.reset();
      bootstrap.Modal.getInstance($('topupModal')).hide();
      await refreshAll();
    } else {
      alert('Could not record top-up');
    }
  });

  // ---- demo controls ----------------------------------------------------
  $('btn-reset-scenarios').addEventListener('click', async () => {
    const r = await fetch('/api/admin/reset-scenarios', { method: 'POST' });
    if (!r.ok) return;
    // Sync the dashboard buttons immediately; the simulator will catch up
    // within a second and the live chart will fall toward zero.
    document.querySelectorAll('button[data-appliance]').forEach(btn => {
      const appliance = btn.dataset.appliance;
      const label = btn.textContent.replace(/ (ON|OFF)$/, '');
      scenarioState[appliance] = false;
      btn.classList.remove('on');
      btn.classList.add('off');
      btn.textContent = `${label} OFF`;
    });
    setTimeout(refreshAll, 2000);
  });

  $('btn-clear-records').addEventListener('click', async () => {
    if (!confirm('Wipe telemetry, events, top-ups and attribution for this device?\n\nThis cannot be undone.')) return;
    const r = await fetch('/api/admin/clear', { method: 'POST' });
    if (!r.ok) return;
    await refreshAll();
  });

  $('btn-set-balance').addEventListener('click', async () => {
    const input = $('demo-balance-input');
    const v = Number(input.value);
    if (!Number.isFinite(v) || v < 0) {
      alert('Enter a non-negative number of units.');
      return;
    }
    const r = await fetch('/api/admin/set-balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ units: v }),
    });
    if (!r.ok) {
      alert('Could not set balance.');
      return;
    }
    // Reset the severity tracker so the first observation at the new
    // balance fires the alert beep / title / pulse refresh.
    lastSeverityShown = null;
    await refreshAll();
  });

  $('settings-form').addEventListener('submit', async ev => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const body = {};
    fd.forEach((v, k) => { if (v !== '') body[k] = Number(v); });
    // Drop focus before refresh so the alert strip / units-left re-render
    // against the just-saved thresholds without being skipped by the
    // active-element guard in refreshAll.
    ev.target.querySelectorAll('input').forEach(el => el.blur());
    const r = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.ok) refreshAll();
  });

  // ---- data refresh -----------------------------------------------------
  async function refreshAll() {
    try {
      const [live, daily, hourly, pie, ev, tu, sc, st] = await Promise.all([
        fetch('/api/live').then(r => r.json()),
        fetch('/api/usage/daily').then(r => r.json()),
        fetch('/api/usage/hourly').then(r => r.json()),
        fetch('/api/appliances').then(r => r.json()),
        fetch('/api/events').then(r => r.json()),
        fetch('/api/topups').then(r => r.json()),
        fetch('/api/scenario').then(r => r.json()),
        fetch('/api/settings').then(r => r.json()),
      ]);

      updateKpis(live);

      dailyChart.data.labels = daily.days.map(d => d.day.slice(5));
      dailyChart.data.datasets[0].data = daily.days.map(d => +d.wh.toFixed(1));
      dailyChart.update('none');

      const hourMap = new Array(24).fill(0);
      hourly.hours.forEach(h => { hourMap[+h.hour] = +h.wh.toFixed(1); });
      hourlyChart.data.labels = hourMap.map((_, i) => `${i}:00`);
      hourlyChart.data.datasets[0].data = hourMap;
      hourlyChart.update('none');

      pieChart.data.labels = pie.items.map(i => i.appliance);
      pieChart.data.datasets[0].data = pie.items.map(i => +i.wh.toFixed(1));
      pieChart.data.datasets[0].backgroundColor =
        pie.items.map(i => APPLIANCE_COLORS[i.appliance] || FALLBACK_COLOR);
      pieChart.update('none');

      renderEvents(ev.items);
      renderTopups(tu.items);
      renderScenario(sc.profiles);

      // Repopulate the settings form, but never clobber a field the user
      // is currently editing — without this guard, typing in a settings
      // input would be wiped on the next 10 s refresh tick.
      const f = $('settings-form');
      const editing = f.contains(document.activeElement);
      if (!editing) {
        f.elements.voltage.value = st.voltage;
        f.elements.caution_units.value = st.caution_units;
        f.elements.warning_units.value = st.warning_units;
        f.elements.critical_units.value = st.critical_units;
      }
    } catch (e) {
      console.error('refresh failed', e);
    }
  }

  // ---- SSE --------------------------------------------------------------
  function connectSse() {
    const es = new EventSource('/sse');
    es.onopen = () => setStatus('ok', 'Online');
    es.onerror = () => setStatus('err', 'Reconnecting...');
    es.onmessage = e => {
      let msg;
      try { msg = JSON.parse(e.data); } catch (err) { return; }
      if (msg.type === 'telemetry' && msg.telemetry) {
        const t = msg.telemetry;
        pushLive(t.ts, t.p_w);
        // also keep KPIs updated cheaply
        $('kpi-power').textContent = fmtInt(t.p_w);
        $('kpi-current').textContent = fmt2(t.i_rms);
        // refresh everything else ~every 10 s
      } else if (msg.type === 'event') {
        refreshAll();
      } else if (msg.type === 'status') {
        setStatus(msg.status === 'online' ? 'ok' : 'off',
                  msg.status === 'online' ? 'Online' : 'Device offline');
      }
    };
  }

  // initial paint + cadence
  refreshAll();
  connectSse();
  setInterval(refreshAll, 10000);
})();
