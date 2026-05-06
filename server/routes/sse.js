'use strict';

// Server-Sent Events fan-out. The dashboard subscribes once and we push
// telemetry, events, and status messages as they arrive over MQTT.

const subscribers = new Set();

function sseHandler(req, res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(': connected\n\n');

  const sub = { res };
  subscribers.add(sub);

  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    subscribers.delete(sub);
  });
}

function broadcast(message) {
  const payload = `data: ${JSON.stringify(message)}\n\n`;
  for (const sub of subscribers) {
    try {
      sub.res.write(payload);
    } catch (e) {
      subscribers.delete(sub);
    }
  }
}

module.exports = { sseHandler, broadcast };
