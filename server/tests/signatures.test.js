'use strict';

const test = require('node:test');
const assert = require('node:assert');

const sig = require('../signatures');

test('classifyStep: 1100 W matches iron', () => {
  const m = sig.classifyStep(1100);
  assert.strictEqual(m && m.name, 'iron');
});

test('classifyStep: 1800 W matches kettle', () => {
  const m = sig.classifyStep(1800);
  assert.strictEqual(m && m.name, 'kettle');
});

test('classifyStep: -1100 W (turn off) still matches iron', () => {
  const m = sig.classifyStep(-1100);
  assert.strictEqual(m && m.name, 'iron');
});

test('classifyStep: 60 W matches lights', () => {
  const m = sig.classifyStep(60);
  assert.strictEqual(m && m.name, 'lights');
});

test('classifyStep: 5000 W matches nothing in the profile library', () => {
  const m = sig.classifyStep(5000);
  assert.strictEqual(m, null);
});

test('attribute: ramp from 0 to 1100 attributes to iron afterwards', () => {
  sig._resetForTests();
  const dev = 'WG-TEST';
  // baseline
  sig.attribute(dev, { p_w: 80, energy_inc_wh: 0.022 });
  // turn on iron
  const a = sig.attribute(dev, { p_w: 1180, energy_inc_wh: 0.328 });
  assert.strictEqual(a.appliance, 'iron');
  // sustain
  const b = sig.attribute(dev, { p_w: 1185, energy_inc_wh: 0.329 });
  assert.strictEqual(b.appliance, 'iron');
});
