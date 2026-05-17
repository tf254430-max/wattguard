'use strict';

const express = require('express');
const path = require('path');

const config = require('./config');
const db = require('./db');
const { startMqttSubscriber } = require('./mqtt');
const apiRouter = require('./routes/api');
const { sseHandler, broadcast } = require('./routes/sse');

function main() {
  db.initDb();
  db.schedulePruning();

  startMqttSubscriber({
    onTelemetry: msg => broadcast(msg),
    onEvent:     ev  => broadcast({ type: 'event', event: ev }),
    onStatus:    s   => broadcast({ type: 'status', status: s.status }),
  });

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  app.use('/api', apiRouter);
  app.get('/sse', sseHandler);

  app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1h',
    extensions: ['html'],
  }));

  app.use((err, _req, res, _next) => {
    console.error('[error]', err);
    res.status(500).json({ error: 'internal error' });
  });

  app.listen(config.port, () => {
    console.log(
      `WattGuard running at http://localhost:${config.port}\n` +
      `  device:  ${config.deviceId}\n` +
      `  broker:  ${config.mqttBrokerUrl}\n` +
      `  prefix:  ${config.mqttTopicPrefix}\n`
    );
  });
}

if (require.main === module) main();

module.exports = { main };
