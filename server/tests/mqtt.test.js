'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { validateTelemetry } = require('../mqtt');

test('valid telemetry passes through', () => {
  const t = validateTelemetry({
    device_id: 'WG-001',
    ts: 1735830420,
    i_rms: 1.23,
    p_w: 295.2,
    energy_inc_wh: 0.082,
  });
  assert.ok(t);
  assert.strictEqual(t.device_id, 'WG-001');
  assert.strictEqual(t.p_w, 295.2);
});

test('absurd power is rejected', () => {
  const t = validateTelemetry({ device_id: 'X', p_w: 99999, i_rms: 1 });
  assert.strictEqual(t, null);
});

test('negative current is rejected', () => {
  const t = validateTelemetry({ device_id: 'X', p_w: 100, i_rms: -1 });
  assert.strictEqual(t, null);
});

test('missing fields default sensibly', () => {
  const t = validateTelemetry({});
  assert.ok(t);
  assert.strictEqual(t.p_w, 0);
  assert.strictEqual(t.i_rms, 0);
});
