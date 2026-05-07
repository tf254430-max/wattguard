'use strict';

const test = require('node:test');
const assert = require('node:assert');

const ledger = require('../ledger');

test('predictEtaSecondsPure: 1 unit at 1 kW lasts 1 hour', () => {
  const eta = ledger.predictEtaSecondsPure(1, 1000);
  assert.ok(Math.abs(eta - 3600) < 0.01, `expected ~3600 s, got ${eta}`);
});

test('predictEtaSecondsPure: 10 units at 500 W lasts 20 hours', () => {
  const eta = ledger.predictEtaSecondsPure(10, 500);
  assert.ok(Math.abs(eta - 20 * 3600) < 0.01, `got ${eta}`);
});

test('predictEtaSecondsPure: zero power returns null', () => {
  assert.strictEqual(ledger.predictEtaSecondsPure(5, 0), null);
});

test('predictEtaSecondsPure: zero remaining returns null', () => {
  assert.strictEqual(ledger.predictEtaSecondsPure(0, 1000), null);
});

test('WH_PER_UNIT is exactly 1000', () => {
  assert.strictEqual(ledger.WH_PER_UNIT, 1000);
});
