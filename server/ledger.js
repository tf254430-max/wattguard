'use strict';

// Yaka top-up ledger and depletion predictor.
// All math is in plain JS so it can be unit tested without a database.

const db = require('./db');
const config = require('./config');

// 1 Yaka unit == 1 kWh == 1000 Wh.
const WH_PER_UNIT = 1000;

function unitsRemaining(deviceId) {
  const purchased = db.totalTopupUnits(deviceId);
  const consumedWh = db.totalEnergyWh(deviceId, 0);
  const remaining = purchased - (consumedWh / WH_PER_UNIT);
  return Math.max(0, remaining);
}

// Use an exponentially weighted average of the last `windowSec` of telemetry
// to predict how long the remaining units will last.
function etaSeconds(deviceId, windowSec = 300) {
  const remaining = unitsRemaining(deviceId);
  const now = Math.floor(Date.now() / 1000);
  const samples = db.telemetryBetween(deviceId, now - windowSec, now);
  if (samples.length === 0) return null;

  const avgPowerW =
    samples.reduce((sum, s) => sum + s.p_w, 0) / samples.length;
  if (avgPowerW <= 0) return null;

  const remainingWh = remaining * WH_PER_UNIT;
  return (remainingWh / avgPowerW) * 3600;
}

function alertSeverity(deviceId) {
  const remaining = unitsRemaining(deviceId);
  if (remaining <= config.alertCriticalUnits) return 'critical';
  if (remaining <= config.alertWarningUnits)  return 'warning';
  if (remaining <= config.alertCautionUnits)  return 'caution';
  return 'ok';
}

// Pure function exported for unit tests.
function predictEtaSecondsPure(remainingUnits, avgPowerW) {
  if (avgPowerW <= 0 || remainingUnits <= 0) return null;
  return (remainingUnits * WH_PER_UNIT / avgPowerW) * 3600;
}

function summarise(deviceId) {
  const latest = db.latestTelemetry(deviceId);
  const remaining = unitsRemaining(deviceId);
  const eta = etaSeconds(deviceId);
  return {
    device_id: deviceId,
    power_w: latest ? latest.p_w : 0,
    i_rms: latest ? latest.i_rms : 0,
    last_seen_ts: latest ? latest.ts : null,
    units_purchased: db.totalTopupUnits(deviceId),
    units_consumed:
      db.totalEnergyWh(deviceId, 0) / WH_PER_UNIT,
    units_remaining: remaining,
    eta_seconds: eta,
    severity: alertSeverity(deviceId),
    voltage_assumed: config.mainsVoltage,
  };
}

module.exports = {
  WH_PER_UNIT,
  unitsRemaining,
  etaSeconds,
  alertSeverity,
  predictEtaSecondsPure,
  summarise,
};
