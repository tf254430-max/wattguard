'use strict';

// HTTP-level tests for the REST API. Each test runs against an in-process
// Express app on a random port with an isolated temp SQLite database, so
// nothing here touches the real wattguard.db.

const os = require('os');
const path = require('path');
const fs = require('fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const tmpDb = path.join(os.tmpdir(), `wattguard-test-${process.pid}.db`);
process.env.DB_PATH = tmpDb;

// requires must come AFTER setting DB_PATH so config picks it up
const db = require('../db');
const { createApp } = require('../server');

let server;
let baseUrl;

test.before(() => {
  db.initDb();
  server = createApp().listen(0);
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(() => {
  if (server) server.close();
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    try { fs.unlinkSync(tmpDb + suffix); } catch (_) { /* ignore */ }
  }
});

const get = (p) => fetch(`${baseUrl}${p}`);
const send = (p, method, body) => fetch(`${baseUrl}${p}`, {
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

// ---- read endpoints -----------------------------------------------------

test('GET /api/health returns service banner', async () => {
  const r = await get('/api/health');
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, 'wattguard');
});

test('GET /api/live returns a ledger snapshot shape', async () => {
  const r = await get('/api/live');
  assert.equal(r.status, 200);
  const body = await r.json();
  for (const key of ['units_purchased', 'units_remaining', 'severity']) {
    assert.ok(key in body, `missing key: ${key}`);
  }
});

test('GET /api/usage?range=1h returns from/to/points', async () => {
  const r = await get('/api/usage?range=1h');
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(typeof body.from, 'number');
  assert.equal(typeof body.to, 'number');
  assert.ok(Array.isArray(body.points));
});

test('GET /api/usage/daily returns a days array', async () => {
  const r = await get('/api/usage/daily');
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.ok(Array.isArray(body.days));
});

test('GET /api/usage/hourly returns an hours array', async () => {
  const r = await get('/api/usage/hourly');
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.ok(Array.isArray(body.hours));
});

test('GET /api/appliances returns 7-day attribution items', async () => {
  const r = await get('/api/appliances');
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.days, 7);
  assert.ok(Array.isArray(body.items));
});

test('GET /api/events returns an items array', async () => {
  const r = await get('/api/events');
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.ok(Array.isArray(body.items));
});

// ---- top-ups ------------------------------------------------------------

test('POST /api/topups accepts a valid top-up and round-trips it', async () => {
  const r = await send('/api/topups', 'POST', { units: 25.5, reference: 'TEST-001' });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.units, 25.5);
  assert.equal(body.reference, 'TEST-001');
  assert.ok(Number.isInteger(body.id));

  const list = await (await get('/api/topups')).json();
  assert.ok(list.items.some(x => x.reference === 'TEST-001' && x.units === 25.5));
});

test('POST /api/topups rejects zero units with 400', async () => {
  const r = await send('/api/topups', 'POST', { units: 0 });
  assert.equal(r.status, 400);
});

test('POST /api/topups rejects negative units with 400', async () => {
  const r = await send('/api/topups', 'POST', { units: -10 });
  assert.equal(r.status, 400);
});

test('POST /api/topups rejects implausibly large units with 400', async () => {
  const r = await send('/api/topups', 'POST', { units: 99999 });
  assert.equal(r.status, 400);
});

test('POST /api/topups rejects non-numeric units with 400', async () => {
  const r = await send('/api/topups', 'POST', { units: 'lots' });
  assert.equal(r.status, 400);
});

// ---- scenario -----------------------------------------------------------

test('GET /api/scenario lists every appliance profile', async () => {
  const r = await get('/api/scenario');
  assert.equal(r.status, 200);
  const body = await r.json();
  for (const k of ['lights', 'tv', 'fridge', 'iron', 'kettle', 'ac']) {
    assert.ok(body.profiles[k], `missing profile: ${k}`);
    assert.equal(typeof body.profiles[k].current_a, 'number');
  }
});

test('POST /api/scenario/iron responds with the requested state', async () => {
  const r = await send('/api/scenario/iron', 'POST', { state: 'on' });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.appliance, 'iron');
  assert.equal(body.state, 'on');
  // ok may be false because MQTT isn't connected in the test harness — that's
  // the documented behaviour of publishCommand when the client is offline.
});

test('POST /api/scenario/unknown returns 404', async () => {
  const r = await send('/api/scenario/teleporter', 'POST', { state: 'on' });
  assert.equal(r.status, 404);
});

// ---- settings -----------------------------------------------------------

test('GET /api/settings returns the four configurable thresholds', async () => {
  const r = await get('/api/settings');
  assert.equal(r.status, 200);
  const body = await r.json();
  for (const k of ['voltage', 'caution_units', 'warning_units', 'critical_units']) {
    assert.ok(k in body, `missing setting: ${k}`);
  }
});

test('PUT /api/settings updates valid values', async () => {
  const r = await send('/api/settings', 'PUT', {
    voltage: 230,
    caution_units: 12,
    warning_units: 6,
    critical_units: 2,
  });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.updated.voltage, 230);
  assert.equal(body.updated.caution_units, 12);
});

test('PUT /api/settings silently rejects out-of-range voltage', async () => {
  const r = await send('/api/settings', 'PUT', { voltage: -240 });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal('voltage' in body.updated, false,
    'negative voltage should not appear in the updates dictionary');
});

test('PUT /api/settings silently rejects zero threshold', async () => {
  const r = await send('/api/settings', 'PUT', { caution_units: 0 });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal('caution_units' in body.updated, false);
});
