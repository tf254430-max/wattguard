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

  const pieChart = new Chart($('chart-pie'), {
    type: 'doughnut',
    data: { labels: [], datasets: [{ data: [], backgroundColor: [
      '#0d6efd', '#198754', '#ffc107', '#dc3545', '#6f42c1', '#20c997', '#6c757d',
    ] }] },
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
