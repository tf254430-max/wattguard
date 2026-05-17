# Cover Page

**Cavendish University Uganda**
**Faculty of Science and Technology** - Department of Computing

**Project Title:** WattGuard - A Smart Home Power Monitor for Yaka Prepaid
Electricity Users
**Student:** Tinka Fahad
**Registration Number:** 254430
**Programme:** BSc Data Science and Artificial Intelligence
**Module:** BSE314 Internet of Things
**Mode of Study:** Full-time
**Exam Date:** May 2026

**Demo video:** *Link will be shared at submission.*
**GitHub repository:** https://github.com/tf254430-max/wattguard

---

## 1. Problem Statement and Objectives

Yaka prepaid meters in Uganda cut power without warning, hide which appliance
is the biggest drain, and never predict when units will run out. Tailors,
salons, and home-based businesses lose income when power dies mid-job;
households lose food when the fridge stays dark overnight. The Yaka meter
itself only shows a single number on a small LCD — no trend, no per-appliance
attribution, no prediction.

WattGuard solves this for an ordinary household running on Umeme's prepaid
service. It is a four-tier IoT system that measures household current in real
time, deducts consumed kWh from a Yaka ledger, predicts depletion against the
current load, attributes energy to individual appliances using a deterministic
signature engine, and alerts the user — visually and audibly — before the meter
hits zero.

### Main objective

Design and build a working end-to-end IoT system that demonstrates each tier of
the perception → network → platform → application stack, runs on the marker's
laptop with two commands, and uses ASP-of-the-IoT-syllabus concepts
(sensing, MQTT, time-series persistence, REST, server-push, dashboarding) on a
real problem with measurable acceptance criteria.

### Specific objectives

- Sample current at 1 kHz on a simulated ESP32, compute RMS over one-second
  windows, derive real power at 240 V, integrate energy, and publish telemetry
  over MQTT every second.
- Persist all telemetry, events, top-ups, and per-appliance attribution to
  SQLite via prepared statements, with a configurable retention window.
- Maintain a Yaka ledger (1 unit = 1 kWh) and a rolling-average depletion
  predictor so the dashboard always shows units remaining and an honest ETA.
- Attribute incremental energy to specific appliances using a deterministic
  step-detection signature engine — no machine learning, deliberately
  interpretable.
- Stream telemetry, events, and device status to the browser via Server-Sent
  Events; complement with a 10-second REST refresh for slower aggregates.
- Cross caution / warning / critical thresholds with both visual (pulsing
  red strip, browser tab title) and audible (Web Audio API beeps) signals.
- Cover the application layer with unit and HTTP-route tests using only the
  standard Node `--test` runner — no external test framework.

## 2. System Design and Architecture

WattGuard is a four-tier IoT system with one well-defined contract between
each tier.

```
Tier            Component                            Tech
------------    -------------------------------      -----------------------------
Perception      Simulated ESP32 + ACS712-equivalent  Wokwi (browser) / PlatformIO
Network         MQTT publish / subscribe             mqtt.js 5.x, broker.hivemq.com
Platform        Subscriber, persistence, REST, SSE   Node.js 20, Express, better-sqlite3
Application     Live dashboard                       HTML + Bootstrap 5 + Chart.js
```

### Topic structure

All messages live under one configurable prefix (default
`tinka-wattguard-9f3a2`) so multiple installations can share the public broker
without colliding.

| Topic | Direction | Payload |
|---|---|---|
| `<prefix>/telemetry` | device → server | `{ v, device_id, ts, i_rms, p_w, energy_inc_wh, voltage_assumed }` |
| `<prefix>/events`    | device → server | `{ device_id, ts, event_type, severity, details }` |
| `<prefix>/status`    | device LWT      | `online` / `offline` |
| `<prefix>/commands`  | server → device | `{ appliance, state, current_a }` or `{ reset_all: true }` |

### Data flow — completing a sale (cashier perspective)

A cashier opens the till at `http://localhost:3000`. The browser holds an
open SSE connection. The user clicks **Iron ON** in the scenario panel. The
dashboard POSTs to `/api/scenario/iron`. The server publishes an MQTT command
on `<prefix>/commands`. The simulated device adds the iron's current draw
(4.58 A) to its scenario set. On its next 1-second tick the device publishes
telemetry with the higher power level. The server validates the payload,
inserts the telemetry row, runs `signatures.attribute` to credit the
incremental energy to *iron*, recomputes severity from the ledger, and pushes
the new sample to every connected SSE client. The dashboard updates the live
power chart and the power/current KPIs inside the same second; a scheduled
refresh fires at +2 s and +5 s so the slower widgets (units left, ETA, pie
chart, alert strip) catch up inside the same demo window.

### Concepts demonstrated

- **Perception**: timer-driven ADC sampling at 1 kHz, RMS over a one-second
  window, real-power calculation at the standard Ugandan mains voltage.
- **Network**: MQTT publish/subscribe with last-will-and-testament for device
  presence, randomised topic prefix for public-broker safety.
- **Platform**: REST API, Server-Sent Events for push, transactional SQLite
  writes via prepared statements, hosted background jobs (retention pruning).
- **Application**: responsive dashboard with live charts, real-time alerts,
  and operator controls (top-ups, scenarios, settings, maintenance).

## 3. System Implementation

The system was built in four sprints over an 8-week window (see
`docs/Backlog.md` for the full sprint plan with completion checkboxes).

### Phase summary

1. **Sprint 1 — Foundation** (Feb 12–25): solution scaffold, Wokwi diagram,
   1 kHz ADC sampling on GPIO 34 via timer ISR, RMS over 1-second windows,
   OLED live wattage, JSON payload validated on the serial monitor.
2. **Sprint 2 — Connectivity** (Feb 26–Mar 11): Wi-Fi join, MQTT publish on a
   randomised topic prefix, last-will publishing `offline` on drop, backend
   subscriber with JSON validation, SQLite schema, retention pruning.
3. **Sprint 3 — Dashboard, ledger, predictor** (Mar 12–Apr 8): Yaka ledger,
   depletion predictor, REST endpoints, SSE stream, Bootstrap + Chart.js
   dashboard with KPI row, live chart, daily / hourly bars, appliance pie,
   top-up modal, alert strip with severity colours.
4. **Sprint 4 — Signatures, scenarios, polish** (Apr 9–May 7): deterministic
   signature engine with six appliance profiles, scenario panel publishing
   MQTT commands, persistent settings, headless `simulate.js` so the
   dashboard works without Wokwi, demo seed script, unit and integration
   tests, final report and video script.

### Tools and tech stack

Node.js 20, Express 4, `better-sqlite3` 12, MQTT.js 5, Server-Sent Events,
Bootstrap 5.3 (including native `data-bs-theme` dark mode), Chart.js 4,
PlatformIO with Arduino framework for ESP32, PubSubClient, ArduinoJson,
Adafruit SSD1306, Wokwi for ESP32 simulation, Node's built-in
`node --test` runner. No external test framework, no Docker, no separate
broker install — the marker installs only Node.js.

### Acceptance criteria met

- Application starts with two commands on a clean clone:
  `npm install && npm start`.
- Dashboard is reachable at `http://localhost:3000` within ~5 seconds of
  `npm start` on a warm SDK.
- `npm run simulate` produces live telemetry over MQTT that the dashboard
  consumes via SSE; KPIs update within ~1 second of each tick.
- The scenario panel publishes MQTT commands; the simulated device honours
  them and the live chart visibly reacts within ~2 seconds of a toggle.
- The Yaka ledger correctly converts kWh to units (verified: 1 kW load for
  1 hour deducts 1.000 unit, ±5 % including ADC noise).
- The depletion predictor uses a rolling 5-minute power average, not the
  instantaneous reading, so the ETA does not flicker on transient loads.
- Threshold crossings into warning or critical fire three independent
  signals: pulsing alert strip, browser tab title flash, and an audible
  beep generated via the Web Audio API. Recovery transitions are silent.
- Settings persisted from the dashboard (mains voltage, three alert
  thresholds) take effect immediately on the next refresh — the alert
  math reads from the DB-backed settings, not from environment defaults.
- Maintenance controls allow the operator to set the meter balance, clear
  stored records, and reset every simulated appliance to OFF without
  restarting any process. The destructive endpoints are loopback-gated.
- **Thirty-eight automated tests pass**: fifteen pure-unit tests covering
  the ledger, predictor, signature engine and telemetry validator; nineteen
  HTTP-route tests covering every public REST endpoint and its validation
  branches; four tests covering the loopback-gated maintenance endpoints.
- Telemetry older than `RETENTION_DAYS` (default 90) is pruned on startup
  and again every 24 hours by a scheduled background job, so the database
  does not grow unbounded on a long-running install.

### Implementation evidence

Suggested screenshots for the PDF submission (also visible in the demo
video):

1. Dashboard in dark mode showing populated KPIs, live power chart, and
   appliance pie chart with multiple coloured slices.
2. The scenario panel with three appliances toggled ON and the live chart
   stepped up to the corresponding total power.
3. The dashboard in **CRITICAL** state — red pulsing alert strip, browser
   tab title showing `🚨 CRITICAL 0.50u - WattGuard`, units KPI at 0.50.
4. The Maintenance card with the "Set units remaining" input and the
   "Clear all records" button.
5. Terminal output of `npm test` showing 38 tests passing.

## 4. Limitations Faced and How They Were Solved

| Challenge | How I solved it |
|---|---|
| No physical ACS712 hardware available for the demo. | Used Wokwi's `wokwi-analog-signal-source` part, which produces the same sinusoidal waveform a real ACS712 would. The firmware code is identical — no `#ifdef` branches, no simulator-only paths. |
| The public HiveMQ broker occasionally drops connections with `ECONNRESET` / `connack timeout` and there is no SLA. | Both the server and the simulator are configured with `reconnectPeriod: 3000`, so they recover automatically. Topic prefix is randomised so even during reconnect there is no collision with other students using the same broker. The architecture treats the broker URL as configuration, so a private TLS-secured broker is a one-line `.env` change. |
| Browser autoplay restrictions block the Web Audio API until the user has interacted with the page, which meant the alert beep silently failed when fired from a setTimeout-driven refresh. | Hoisted the `AudioContext` to a single long-lived instance, created lazily on first use, and registered `click` / `keydown` / `touchstart` listeners that resume the context on every user gesture. Once unlocked, subsequent beeps work for the rest of the session. |
| The Yaka ledger uses purchased and consumed totals, so it was impossible to demonstrate the critical-unit alert in a short video without waiting for hours of real consumption. | Added a `POST /api/admin/set-balance` endpoint and a "Set units remaining" input in the dashboard's Maintenance card. The endpoint deletes existing top-ups for the device and inserts a synthetic top-up sized to `(consumed + target)`, so the meter parks at any chosen balance instantly. The endpoint is loopback-gated so it refuses non-localhost callers even if the port were exposed. |
| The pie chart initially assigned colours by slice index, so a single-appliance pie was always blue regardless of which appliance it represented. | Switched to a stable colour-per-appliance map (iron orange, kettle red, fridge cyan, TV purple, lights yellow, AC green, baseline grey), so each device has a recognisable hue and the legend stays consistent across refreshes. |
| `better-sqlite3` had no Node 24 prebuilt binaries when the project was scaffolded, which would have forced the marker to install a C++ toolchain. | Bumped the dependency to version 12, which ships prebuilt binaries for Node 24 across Windows, macOS, and Linux. The marker installs only Node.js. |

## 5. Project Ownership and Progress Evidence

This project is entirely individual work. I wrote the proposal, designed the
architecture, scaffolded both the firmware and the server, built every layer,
wrote every test, and committed all code to GitHub under my own account.

### Planning evidence

- The detailed proposal document (`WattGuard_IoT_Proposal Eos.docx`) was
  authored before any code was written. It defines the scope, the
  four-tier architecture, the topic contract, the acceptance criteria,
  and the four-sprint plan.
- `docs/Backlog.md` mirrors that proposal's sprint plan with explicit
  completion checkboxes for every deliverable, plus a risks-and-mitigations
  table — the planning evidence required by Q3.iii of the exam template.
- `docs/architecture.md` records the layer boundaries, topic structure,
  database schema, and design rationale for choosing a public MQTT broker
  over a self-hosted alternative.

### GitHub evidence

- **My GitHub profile:** https://github.com/tf254430-max
- **WattGuard repository (public):** https://github.com/tf254430-max/wattguard

The repository contains the firmware project, the server with the embedded
dashboard, two helper scripts (`seed.js`, `simulate.js`), thirty-eight
tests, the MIT licence under my name, the architecture document, the sprint
backlog, this report, and progressive commits showing each sprint as it
landed.

## 6. Conclusion

WattGuard is a working four-tier IoT system that solves a real problem for
Ugandan households on prepaid electricity. By combining a Wokwi-simulated
ESP32, MQTT over a public broker, a Node.js + SQLite backend, and a live
Bootstrap + Chart.js dashboard into a system that runs on the marker's laptop
with two commands, the project covers every learning outcome of the Internet
of Things module: sensing, signal conditioning, network publish/subscribe,
time-series persistence, REST APIs, server-push, dashboarding, and operator
controls. The system is fully demonstrable end-to-end, the test suite passes,
and the code is publicly verifiable on GitHub.
