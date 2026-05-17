# WattGuard

**A Smart Home Power Monitor for Yaka Prepaid Electricity Users**
Real-time consumption tracking, predictive top-up alerts, and appliance-level insight.

> End-of-Semester Project — IoT Module
> BSc Data Science and Artificial Intelligence
> Cavendish University Uganda — 2025/2026

---

## What it does

Every Ugandan household on Yaka has had this moment: the lights go off and you realise
you forgot to top up. WattGuard sits in your fuse box, watches your home's power use
in real time, counts down your Yaka units as they are consumed, and warns you before
they run out. It also tells you which appliance is the biggest drain — the iron, the
fridge, or the kettle — so you can do something about it.

The IoT device is **simulated in Wokwi** (free browser-based ESP32 simulator), so
no physical hardware is needed for the demonstration. The same firmware would run
unchanged on a real ESP32 with an ACS712 current sensor.

## Architecture

```
[ Wokwi: ESP32 + ACS712 + OLED ]
                |
            MQTT (1 Hz)
                |
                v
[ broker.hivemq.com:1883 (public) ]
                |
                v
[ Node.js process on the laptop ]
   - mqtt subscriber  -> SQLite (better-sqlite3)
   - Express REST API
   - Server-Sent Events stream
                |
                v
[ Browser: http://localhost:3000 ]
   Bootstrap + Chart.js dashboard
```

Four-tier IoT architecture (perception / network / platform / application), all
running on the marker's laptop with two commands.

## Getting started

**Prerequisites:** [Node.js 20 LTS](https://nodejs.org). Nothing else.

```bash
# 1. Clone
git clone https://github.com/tf254430-max/wattguard.git
cd wattguard/server

# 2. Install dependencies (~30 seconds)
npm install

# 3. Start the server
npm start
# -> WattGuard running at http://localhost:3000
```

Then open two browser tabs:

1. **Wokwi simulation** — open `firmware/wokwi/diagram.json` in
   [wokwi.com](https://wokwi.com/projects/new/esp32) (or use the Wokwi for VSCode
   extension on the `firmware/` folder), paste in `firmware/src/main.cpp`, then
   click the green **Start** button.
2. **Dashboard** — open <http://localhost:3000>. Live data appears within
   30 seconds.

> **Want to demo without Wokwi?** Run `npm run simulate` in a second terminal.
> A built-in load simulator publishes telemetry over MQTT exactly as the
> firmware would, so you can see the dashboard light up immediately.

## Try the scenario panel

The dashboard's **Scenario** card has buttons for Lights, Fridge, TV, Iron,
Kettle, AC. Click **Iron ON** — the power gauge jumps, the Yaka countdown
accelerates, the appliance pie chart updates. Click **Iron OFF** to stop.

These commands publish over MQTT to the simulated device, which adjusts its
current draw in response. Same code path that a real installation would use.

## Yaka top-ups

Open the **Top-ups** card on the dashboard, click **Record top-up**, enter the
units you bought (e.g. `50`) and an optional reference. The remaining-units
counter updates and the depletion ETA recomputes against the current load.

## Configuration

Defaults work out of the box. To override anything (port, broker URL, topic
prefix, voltage, alert thresholds), copy `.env.example` to `server/.env` and
edit. Both the firmware and backend use the same topic prefix — change it in
**both** places (env var on the backend, `MQTT_TOPIC_PREFIX` constant in
`firmware/src/main.cpp`) if you want a private demo channel.

## Tests

```bash
cd server
npm test                  # backend unit tests (ledger, predictor, signatures)
```

Firmware unit tests for the RMS routine are in `firmware/test/`; run with
`pio test` from the `firmware/` directory if you have PlatformIO installed.

## Calibration claim

Constant 1 kW load for 1 hour deducts 1.000 Yaka unit from the ledger
(±5 % including ADC noise). The seed script and `simulate.js` both produce
loads that you can hand-verify against the dashboard.

## Security and privacy

The public MQTT broker is acceptable for the academic demo: the topic prefix is randomised and the payload carries no personal data. The destructive maintenance endpoints (`/api/admin/*`) are loopback-gated and refuse non-localhost callers. DOM updates use `textContent`, SQLite queries use prepared statements, and telemetry older than `RETENTION_DAYS` (default 90) is pruned both at startup and every 24 hours by a scheduled job.

## Tech stack

Node.js, Express, better-sqlite3, MQTT.js, Server-Sent Events, Bootstrap 5, Chart.js, PlatformIO, Arduino framework for ESP32, PubSubClient, ArduinoJson, Adafruit SSD1306, Wokwi for ESP32 simulation, `node --test`.

## License

[MIT](LICENSE) — Tinka Fahad, 2026.

## Author

```
Tinka Fahad
Registration No: 254430
BSc Data Science and AI — Year 2 Semester 1
Cavendish University Uganda — Internet of Things Module
Academic Year 2025/2026
```

