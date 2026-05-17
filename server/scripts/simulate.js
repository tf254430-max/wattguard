'use strict';

// Headless load simulator. Publishes the same MQTT messages the real
// firmware would, so the dashboard works even when Wokwi is closed.
//
// Usage: npm run simulate

const mqtt = require('mqtt');
const config = require('../config');

const VOLTS = config.mainsVoltage;
const TOPIC_TEL = config.topics.telemetry;
const TOPIC_STATUS = config.topics.status;
const TOPIC_CMD = config.topics.commands;

const SCENARIO = {
  lights: 0.25,
  tv:     0.50,
  fridge: 0.83,
  iron:   4.58,
  kettle: 7.50,
  ac:     5.83,
};

// Start with nothing toggled so a fresh dashboard shows 0 W until the
// user clicks an appliance ON. Matches the visual state of the scenario
// buttons (all OFF on load) and makes "off = off" honest on camera.
let appliances = new Set();
let extraBoost = 0;

function currentDraw() {
  // Zero baseline so a clean "all off" state reads as 0 W.
  let amps = 0;
  for (const a of appliances) amps += SCENARIO[a] || 0;
  return amps + extraBoost;
}

const client = mqtt.connect(config.mqttBrokerUrl, {
  clientId: 'wattguard-sim-' + Math.random().toString(16).slice(2, 8),
  reconnectPeriod: 3000,
});

client.on('connect', () => {
  console.log('[sim] connected; publishing every 1 s on', TOPIC_TEL);
  client.publish(TOPIC_STATUS, 'online', { retain: true });
  client.subscribe(TOPIC_CMD);
});

client.on('message', (topic, buf) => {
  if (topic !== TOPIC_CMD) return;
  let cmd;
  try { cmd = JSON.parse(buf.toString()); } catch (e) { return; }
  if (!cmd) return;
  // Support a broadcast reset: { reset_all: true } clears every appliance.
  if (cmd.reset_all) {
    appliances.clear();
    console.log('[sim] reset_all -> appliances now: (none)');
    return;
  }
  if (!cmd.appliance) return;
  if (cmd.state === 'on') appliances.add(cmd.appliance);
  else appliances.delete(cmd.appliance);
  console.log('[sim] appliances now:', Array.from(appliances).join(', ') || '(none)');
});

setInterval(() => {
  const i = currentDraw();
  // small natural jitter so the chart looks alive
  const noise = (Math.random() - 0.5) * 0.02;
  const iRms = Math.max(0, i + noise);
  const pW = iRms * VOLTS;
  const dWh = pW / 3600;
  const payload = {
    v: 1,
    device_id: config.deviceId,
    ts: Math.floor(Date.now() / 1000),
    i_rms: +iRms.toFixed(3),
    p_w: +pW.toFixed(2),
    energy_inc_wh: +dWh.toFixed(4),
    voltage_assumed: VOLTS,
  };
  client.publish(TOPIC_TEL, JSON.stringify(payload));
}, 1000);

process.on('SIGINT', () => {
  client.publish(TOPIC_STATUS, 'offline', { retain: true });
  setTimeout(() => process.exit(0), 200);
});
