'use strict';

const mqtt = require('mqtt');
const config = require('./config');
const db = require('./db');
const ledger = require('./ledger');
const signatures = require('./signatures');

let client = null;
let lastSeverity = 'ok';

function startMqttSubscriber({ onTelemetry, onEvent, onStatus }) {
  client = mqtt.connect(config.mqttBrokerUrl, {
    clientId: 'wattguard-server-' + Math.random().toString(16).slice(2, 10),
    reconnectPeriod: 3000,
    connectTimeout: 10000,
  });

  client.on('connect', () => {
    console.log(
      `[mqtt] connected to ${config.mqttBrokerUrl} prefix=${config.mqttTopicPrefix}`
    );
    client.subscribe(
      [
        config.topics.telemetry,
        config.topics.events,
        config.topics.status,
      ],
      { qos: 0 }
    );
  });

  client.on('reconnect', () => console.log('[mqtt] reconnecting...'));
  client.on('error', err => console.error('[mqtt] error:', err.message));
  client.on('offline', () => console.warn('[mqtt] offline'));

  client.on('message', (topic, buf) => {
    let payload;
    try {
      payload = JSON.parse(buf.toString());
    } catch (e) {
      console.warn('[mqtt] bad json on', topic);
      return;
    }
    if (topic === config.topics.telemetry) {
      handleTelemetry(payload, onTelemetry);
    } else if (topic === config.topics.events) {
      handleEvent(payload, onEvent);
    } else if (topic === config.topics.status) {
      const status = buf.toString();
      console.log('[status]', status);
      if (onStatus) onStatus({ status });
    }
  });
}

function validateTelemetry(t) {
  if (!t || typeof t !== 'object') return null;
  const out = {
    device_id: String(t.device_id || config.deviceId),
    ts: Number.isFinite(t.ts)
      ? Math.floor(t.ts)
      : Math.floor(Date.now() / 1000),
    i_rms: Number.isFinite(t.i_rms) ? t.i_rms : 0,
    p_w: Number.isFinite(t.p_w) ? t.p_w : 0,
    energy_inc_wh: Number.isFinite(t.energy_inc_wh) ? t.energy_inc_wh : 0,
  };
  if (out.p_w < 0 || out.p_w > 20000) return null;
  if (out.i_rms < 0 || out.i_rms > 100) return null;
  return out;
}

function handleTelemetry(raw, onTelemetry) {
  const t = validateTelemetry(raw);
  if (!t) return;

  // The firmware ships ts as seconds-since-boot, not epoch. Stamp on arrival
  // so the dashboard time-axis is meaningful.
  t.ts = Math.floor(Date.now() / 1000);

  db.insertTelemetry(t);

  const attribution = signatures.attribute(t.device_id, t);
  if (attribution && attribution.energy_wh > 0) {
    db.insertAttribution({
      device_id: t.device_id,
      ts: t.ts,
      appliance: attribution.appliance,
      energy_wh: attribution.energy_wh,
    });
  }

  // Synthesise low-Yaka events when severity transitions.
  const severity = ledger.alertSeverity(t.device_id);
  if (severity !== lastSeverity && severity !== 'ok') {
    const ev = {
      device_id: t.device_id,
      ts: t.ts,
      event_type: 'low_yaka',
      severity,
      details_json: JSON.stringify({
        units_remaining: ledger.unitsRemaining(t.device_id),
      }),
    };
    db.insertEvent(ev);
    if (onTelemetry) onTelemetry({ type: 'event', event: ev });
  }
  lastSeverity = severity;

  if (onTelemetry) onTelemetry({ type: 'telemetry', telemetry: t });
}

function handleEvent(raw, onEvent) {
  if (!raw || typeof raw !== 'object') return;
  const ev = {
    device_id: String(raw.device_id || config.deviceId),
    ts: Math.floor(Date.now() / 1000),
    event_type: String(raw.event_type || 'unknown'),
    severity: raw.severity ? String(raw.severity) : null,
    details_json: JSON.stringify(raw),
  };
  db.insertEvent(ev);
  if (onEvent) onEvent(ev);
}

function publishCommand(payload) {
  if (!client || !client.connected) {
    console.warn('[mqtt] not connected; cannot publish command');
    return false;
  }
  client.publish(config.topics.commands, JSON.stringify(payload), { qos: 0 });
  return true;
}

module.exports = {
  startMqttSubscriber,
  publishCommand,
  validateTelemetry,
};
