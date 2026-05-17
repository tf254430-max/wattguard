'use strict';

// Populate the database with two weeks of plausible demo data so the
// dashboard has charts to draw the moment the marker opens it.
//
// Usage:
//   npm run seed              normal balance (~43 units left, severity 'ok')
//   npm run seed:caution      ~9 units left  (severity 'caution', blue strip)
//   npm run seed:warning      ~4 units left  (severity 'warning', yellow strip)
//   npm run seed:critical     ~0.5 units left (severity 'critical', red strip)
//
// The non-normal modes adjust the seeded top-ups so the dashboard opens
// already sitting on the chosen alert state. Useful for capturing demo
// screenshots / video clips of each severity level without waiting for
// hours of real consumption.

const config = require('../config');
const db = require('../db');

const DEVICE_ID = config.deviceId;

// Target remaining-units balance for each demo mode. Sized so each mode
// lands cleanly inside its own severity band given the default thresholds
// (caution=10, warning=5, critical=1).
const MODE_TARGETS = {
  caution:  9,
  warning:  4,
  critical: 0.5,
};

// Per-day variation so the 14-day bar chart isn't a flat strip of
// identical bars. Indexed by daysAgo (0 = today, 13 = two weeks back).
// Picks a small set of "shape" multipliers and reserves two specific
// days for outliers — a load-shedding day with sharply reduced load
// and a visitors / holiday day with elevated load. The pattern is
// deterministic so re-running the seed reproduces the same chart.
function dayMultipliers() {
  const out = new Array(15).fill(1.0);
  for (let d = 0; d < out.length; d++) {
    // weekend bump (Sat=6, Sun=0)
    const dt = new Date();
    dt.setDate(dt.getDate() - d);
    const dow = dt.getDay();
    if (dow === 0 || dow === 6) out[d] = 1.15;
  }
  // load-shedding day (4 days ago) — fridge baseline only
  out[4] = 0.42;
  // visitor day (10 days ago) — guests + extra cooking
  out[10] = 1.28;
  return out;
}

const DAY_MULT = dayMultipliers();

function hourPower(date) {
  // light/realistic Ugandan urban household profile
  const h = date.getHours();
  let p = 80;                                  // baseline (fridge cycle, standby)
  if (h >= 6  && h <  9)  p += 800;            // morning cooking
  if (h >= 12 && h < 14)  p += 400;            // lunch
  if (h >= 18 && h < 22)  p += 1100;           // evening cooking + lights
  if (h >= 22 || h <  6)  p += 30;             // overnight

  // Apply the per-day multiplier so the daily totals vary realistically.
  const daysAgo = Math.floor((Date.now() - date.getTime()) / 86400000);
  const mult = DAY_MULT[Math.min(daysAgo, DAY_MULT.length - 1)] ?? 1.0;
  p *= mult;

  // jitter — slightly larger so the live chart doesn't look mechanical
  return p + (Math.random() - 0.5) * 120;
}

function applianceForPower(p) {
  if (p > 1500) return 'kettle';
  if (p > 1000) return 'iron';
  if (p > 500)  return 'tv';
  if (p > 200)  return 'fridge';
  return 'lights';
}

function resolveTargetUnits(arg) {
  if (!arg) return { mode: 'normal', target: null };
  const lower = arg.toLowerCase();
  if (lower in MODE_TARGETS) return { mode: lower, target: MODE_TARGETS[lower] };
  const n = Number(arg);
  if (Number.isFinite(n) && n >= 0 && n <= 10000) {
    return { mode: 'custom', target: n };
  }
  return { mode: null, target: null };
}

function main() {
  const arg = process.argv[2];
  const { mode, target } = resolveTargetUnits(arg);
  if (mode === null) {
    console.error(
      `[seed] unrecognised argument '${arg}'.\n` +
      `       Use one of: normal | caution | warning | critical\n` +
      `       or a numeric target balance, e.g.  node scripts/seed.js 15`
    );
    process.exit(1);
  }

  db.initDb();
  const now = Math.floor(Date.now() / 1000);

  console.log(`[seed] mode=${mode}; clearing existing rows for ${DEVICE_ID}`);
  const sqlDb = db.getDb();
  sqlDb.prepare('DELETE FROM telemetry             WHERE device_id = ?').run(DEVICE_ID);
  sqlDb.prepare('DELETE FROM appliance_attribution WHERE device_id = ?').run(DEVICE_ID);
  sqlDb.prepare('DELETE FROM events                WHERE device_id = ?').run(DEVICE_ID);
  sqlDb.prepare('DELETE FROM topups                WHERE device_id = ?').run(DEVICE_ID);

  // 14 days at one row per 5 minutes
  const insertTel = sqlDb.prepare(`
    INSERT INTO telemetry (device_id, ts, i_rms, p_w, energy_inc_wh)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertAttr = sqlDb.prepare(`
    INSERT INTO appliance_attribution (device_id, ts, appliance, energy_wh)
    VALUES (?, ?, ?, ?)
  `);
  const tx = sqlDb.transaction(() => {
    for (let secAgo = 14 * 86400; secAgo >= 0; secAgo -= 300) {
      const ts = now - secAgo;
      const date = new Date(ts * 1000);
      const p = Math.max(20, hourPower(date));
      const i = p / config.mainsVoltage;
      const dWh = (p / 12);   // 5-minute slot
      insertTel.run(DEVICE_ID, ts, +i.toFixed(3), +p.toFixed(2), +dWh.toFixed(3));
      insertAttr.run(DEVICE_ID, ts, applianceForPower(p), +dWh.toFixed(3));
    }
  });
  tx();

  // Compute what was actually inserted so the top-ups can be sized to
  // leave the right remaining balance for the chosen demo mode.
  const consumedWh = sqlDb.prepare(
    'SELECT COALESCE(SUM(energy_inc_wh), 0) AS wh FROM telemetry WHERE device_id = ?'
  ).get(DEVICE_ID).wh;
  const consumedUnits = consumedWh / 1000;

  if (mode === 'normal') {
    // Original two top-ups; balance lands around 43 units left.
    db.insertTopup({
      device_id: DEVICE_ID,
      units: 100,
      reference: 'YK-DEMO-001',
      purchased_at: now - 14 * 86400,
    });
    db.insertTopup({
      device_id: DEVICE_ID,
      units: 80,
      reference: 'YK-DEMO-002',
      purchased_at: now - 5 * 86400,
    });
  } else {
    // Single top-up sized exactly so the remaining balance lands at the
    // requested target (named mode or custom numeric argument).
    const total = +(consumedUnits + target).toFixed(2);
    const ref = mode === 'custom'
      ? `YK-DEMO-CUSTOM-${target}`
      : `YK-DEMO-${mode.toUpperCase()}`;
    db.insertTopup({
      device_id: DEVICE_ID,
      units: total,
      reference: ref,
      purchased_at: now - 14 * 86400,
    });
  }

  // a couple of sample events
  db.insertEvent({
    device_id: DEVICE_ID,
    ts: now - 4 * 3600,
    event_type: 'high_draw',
    severity: 'warning',
    details_json: JSON.stringify({ peak_w: 2150 }),
  });
  db.insertEvent({
    device_id: DEVICE_ID,
    ts: now - 2 * 86400,
    event_type: 'low_yaka',
    severity: 'caution',
    details_json: JSON.stringify({ units_remaining: 9.4 }),
  });

  if (mode === 'normal') {
    console.log('[seed] done');
  } else {
    console.log(`[seed] done; dashboard will open showing ~${target} units left (mode '${mode}')`);
  }
}

if (require.main === module) main();
