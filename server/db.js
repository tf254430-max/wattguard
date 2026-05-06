'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('./config');

let db = null;

function initDb() {
  if (db) return db;

  const dir = path.dirname(config.dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS telemetry (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id     TEXT    NOT NULL,
      ts            INTEGER NOT NULL,
      i_rms         REAL    NOT NULL,
      p_w           REAL    NOT NULL,
      energy_inc_wh REAL    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_telemetry_device_ts
      ON telemetry (device_id, ts);

    CREATE TABLE IF NOT EXISTS events (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id    TEXT    NOT NULL,
      ts           INTEGER NOT NULL,
      event_type   TEXT    NOT NULL,
      severity     TEXT,
      details_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_events_device_ts
      ON events (device_id, ts);

    CREATE TABLE IF NOT EXISTS topups (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id    TEXT    NOT NULL,
      units        REAL    NOT NULL,
      reference    TEXT,
      purchased_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_topups_device_purchased
      ON topups (device_id, purchased_at);

    CREATE TABLE IF NOT EXISTS appliance_attribution (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id  TEXT    NOT NULL,
      ts         INTEGER NOT NULL,
      appliance  TEXT    NOT NULL,
      energy_wh  REAL    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_attr_device_ts
      ON appliance_attribution (device_id, ts);

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  pruneOldTelemetry();
  return db;
}

function getDb() {
  if (!db) initDb();
  return db;
}

function pruneOldTelemetry() {
  const cutoff = Math.floor(Date.now() / 1000) - config.retentionDays * 86400;
  db.prepare('DELETE FROM telemetry WHERE ts < ?').run(cutoff);
  db.prepare('DELETE FROM appliance_attribution WHERE ts < ?').run(cutoff);
}

// ---- Telemetry -----------------------------------------------------------

function insertTelemetry(t) {
  return getDb().prepare(`
    INSERT INTO telemetry (device_id, ts, i_rms, p_w, energy_inc_wh)
    VALUES (?, ?, ?, ?, ?)
  `).run(t.device_id, t.ts, t.i_rms, t.p_w, t.energy_inc_wh);
}

function latestTelemetry(deviceId) {
  return getDb().prepare(`
    SELECT * FROM telemetry
    WHERE device_id = ?
    ORDER BY ts DESC LIMIT 1
  `).get(deviceId);
}

function telemetryBetween(deviceId, fromTs, toTs) {
  return getDb().prepare(`
    SELECT ts, i_rms, p_w, energy_inc_wh FROM telemetry
    WHERE device_id = ? AND ts BETWEEN ? AND ?
    ORDER BY ts ASC
  `).all(deviceId, fromTs, toTs);
}

function totalEnergyWh(deviceId, fromTs) {
  const row = getDb().prepare(`
    SELECT COALESCE(SUM(energy_inc_wh), 0) AS wh FROM telemetry
    WHERE device_id = ? AND ts >= ?
  `).get(deviceId, fromTs || 0);
  return row.wh || 0;
}

function energyByDay(deviceId, days) {
  const fromTs = Math.floor(Date.now() / 1000) - days * 86400;
  return getDb().prepare(`
    SELECT strftime('%Y-%m-%d', ts, 'unixepoch') AS day,
           COALESCE(SUM(energy_inc_wh), 0)        AS wh
    FROM telemetry
    WHERE device_id = ? AND ts >= ?
    GROUP BY day
    ORDER BY day ASC
  `).all(deviceId, fromTs);
}

function energyByHourToday(deviceId) {
  const start = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
  return getDb().prepare(`
    SELECT strftime('%H', ts, 'unixepoch') AS hour,
           COALESCE(SUM(energy_inc_wh), 0)  AS wh
    FROM telemetry
    WHERE device_id = ? AND ts >= ?
    GROUP BY hour
    ORDER BY hour ASC
  `).all(deviceId, start);
}

// ---- Events --------------------------------------------------------------

function insertEvent(e) {
  return getDb().prepare(`
    INSERT INTO events (device_id, ts, event_type, severity, details_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    e.device_id, e.ts, e.event_type,
    e.severity || null,
    e.details_json || null
  );
}

function recentEvents(deviceId, limit = 50) {
  return getDb().prepare(`
    SELECT * FROM events
    WHERE device_id = ?
    ORDER BY ts DESC
    LIMIT ?
  `).all(deviceId, limit);
}

// ---- Top-ups -------------------------------------------------------------

function insertTopup(t) {
  return getDb().prepare(`
    INSERT INTO topups (device_id, units, reference, purchased_at)
    VALUES (?, ?, ?, ?)
  `).run(t.device_id, t.units, t.reference || null, t.purchased_at);
}

function listTopups(deviceId) {
  return getDb().prepare(`
    SELECT * FROM topups
    WHERE device_id = ?
    ORDER BY purchased_at DESC
  `).all(deviceId);
}

function totalTopupUnits(deviceId) {
  const row = getDb().prepare(`
    SELECT COALESCE(SUM(units), 0) AS u FROM topups WHERE device_id = ?
  `).get(deviceId);
  return row.u || 0;
}

// ---- Appliance attribution -----------------------------------------------

function insertAttribution(a) {
  return getDb().prepare(`
    INSERT INTO appliance_attribution (device_id, ts, appliance, energy_wh)
    VALUES (?, ?, ?, ?)
  `).run(a.device_id, a.ts, a.appliance, a.energy_wh);
}

function attributionByAppliance(deviceId, days = 7) {
  const fromTs = Math.floor(Date.now() / 1000) - days * 86400;
  return getDb().prepare(`
    SELECT appliance, COALESCE(SUM(energy_wh), 0) AS wh
    FROM appliance_attribution
    WHERE device_id = ? AND ts >= ?
    GROUP BY appliance
    ORDER BY wh DESC
  `).all(deviceId, fromTs);
}

// ---- Settings ------------------------------------------------------------

function getSetting(key, fallback = null) {
  const row = getDb().prepare(
    'SELECT value FROM settings WHERE key = ?'
  ).get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  getDb().prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(value));
}

module.exports = {
  initDb,
  getDb,
  insertTelemetry,
  latestTelemetry,
  telemetryBetween,
  totalEnergyWh,
  energyByDay,
  energyByHourToday,
  insertEvent,
  recentEvents,
  insertTopup,
  listTopups,
  totalTopupUnits,
  insertAttribution,
  attributionByAppliance,
  getSetting,
  setSetting,
};
