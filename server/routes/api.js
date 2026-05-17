'use strict';

const express = require('express');
const config = require('../config');
const db = require('../db');
const ledger = require('../ledger');
const mqttClient = require('../mqtt');

const router = express.Router();

// Profiles for the scenario panel: clicking "Iron ON" adds 4.6 A and so on.
// Values match the appliance profiles in signatures.js (watts / 240 V).
const SCENARIO_PROFILES = {
  lights: { current_a: 0.25, label: 'Lights'    },
  tv:     { current_a: 0.50, label: 'TV'        },
  fridge: { current_a: 0.83, label: 'Fridge'    },
  iron:   { current_a: 4.58, label: 'Iron'      },
  kettle: { current_a: 7.50, label: 'Kettle'    },
  ac:     { current_a: 5.83, label: 'AC'        },
};

router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'wattguard', version: '1.0.0' });
});

router.get('/live', (_req, res) => {
  res.json(ledger.summarise(config.deviceId));
});

router.get('/usage', (req, res) => {
  const range = String(req.query.range || '24h');
  const now = Math.floor(Date.now() / 1000);
  let from;
  if (range === '5m')  from = now - 300;
  else if (range === '1h')  from = now - 3600;
  else if (range === '24h') from = now - 86400;
  else if (range === '7d')  from = now - 7 * 86400;
  else from = now - 86400;
  const rows = db.telemetryBetween(config.deviceId, from, now);
  res.json({ from, to: now, points: rows });
});

router.get('/usage/daily', (_req, res) => {
  res.json({ days: db.energyByDay(config.deviceId, 14) });
});

router.get('/usage/hourly', (_req, res) => {
  res.json({ hours: db.energyByHourToday(config.deviceId) });
});

router.get('/appliances', (_req, res) => {
  res.json({ days: 7, items: db.attributionByAppliance(config.deviceId, 7) });
});

router.get('/events', (_req, res) => {
  res.json({ items: db.recentEvents(config.deviceId, 50) });
});

router.get('/topups', (_req, res) => {
  res.json({ items: db.listTopups(config.deviceId) });
});

router.post('/topups', (req, res) => {
  const units = Number(req.body && req.body.units);
  if (!Number.isFinite(units) || units <= 0 || units > 10000) {
    return res.status(400).json({ error: 'units must be a positive number' });
  }
  const reference =
    typeof req.body.reference === 'string'
      ? req.body.reference.slice(0, 64)
      : null;
  const now = Math.floor(Date.now() / 1000);
  const result = db.insertTopup({
    device_id: config.deviceId,
    units,
    reference,
    purchased_at: now,
  });
  db.insertEvent({
    device_id: config.deviceId,
    ts: now,
    event_type: 'topup',
    severity: 'info',
    details_json: JSON.stringify({ units, reference }),
  });
  res.json({ id: result.lastInsertRowid, units, reference });
});

router.get('/scenario', (_req, res) => {
  res.json({ profiles: SCENARIO_PROFILES });
});

router.post('/scenario/:appliance', (req, res) => {
  const appliance = String(req.params.appliance || '').toLowerCase();
  const profile = SCENARIO_PROFILES[appliance];
  if (!profile) return res.status(404).json({ error: 'unknown appliance' });
  const state = req.body && req.body.state === 'off' ? 'off' : 'on';
  const ok = mqttClient.publishCommand({
    appliance,
    state,
    current_a: profile.current_a,
  });
  res.json({ ok, appliance, state, current_a: profile.current_a });
});

router.get('/settings', (_req, res) => {
  res.json({
    voltage:           db.getSetting('voltage', String(config.mainsVoltage)),
    caution_units:     db.getSetting('caution_units', String(config.alertCautionUnits)),
    warning_units:     db.getSetting('warning_units', String(config.alertWarningUnits)),
    critical_units:    db.getSetting('critical_units', String(config.alertCriticalUnits)),
  });
});

// Per-key bounds keep the alert math sensible. Anything outside the range
// (e.g. negative voltage, zero thresholds) is silently dropped from the
// update — the response reports only what actually changed.
const SETTING_BOUNDS = {
  voltage:        { min: 100, max: 300 },
  caution_units:  { min: 0.1, max: 10000 },
  warning_units:  { min: 0.1, max: 10000 },
  critical_units: { min: 0.1, max: 10000 },
};

router.put('/settings', (req, res) => {
  const updates = {};
  for (const [key, bounds] of Object.entries(SETTING_BOUNDS)) {
    if (req.body && req.body[key] !== undefined) {
      const value = Number(req.body[key]);
      if (Number.isFinite(value) && value >= bounds.min && value <= bounds.max) {
        db.setSetting(key, value);
        updates[key] = value;
      }
    }
  }
  res.json({ updated: updates });
});

module.exports = router;
