# WattGuard Architecture

## Tiers

| Tier | Component | Tech |
|---|---|---|
| Perception | Simulated ESP32 + ACS712 + OLED + buzzer + LEDs | Wokwi (browser) |
| Network | MQTT publish/subscribe over public broker | mqtt 3.1.1, broker.hivemq.com:1883 |
| Platform | Subscriber, persistence, REST, SSE | Node.js 20, Express, better-sqlite3 |
| Application | Live dashboard | HTML + Bootstrap 5 + Chart.js |

## Topic structure

All under one configurable prefix (default `tinka-wattguard-9f3a2`).

| Topic | Direction | Payload |
|---|---|---|
| `<prefix>/telemetry` | device -> server | `{ v, device_id, ts, i_rms, p_w, energy_inc_wh, voltage_assumed }` |
| `<prefix>/events` | device -> server | `{ device_id, ts, event_type, severity, details }` |
| `<prefix>/status` | device LWT | `online` / `offline` |
| `<prefix>/commands` | server -> device | `{ appliance, state, current_a }` |

## Data flow

```
ADC (1 kHz) -> RMS over 1 s -> *240 V -> watts
                                      -> integrate -> Wh
                                      -> event detector
                                      -> JSON publish (1 Hz)
                                            |
                                       MQTT broker
                                            |
                            mqtt.js validates and writes to SQLite
                                            |
              ledger.js deducts from current top-up balance
              signatures.js attributes the increment to an appliance
                                            |
                           sse.js broadcasts to dashboard
                                            |
                         Chart.js redraws live + KPIs update
```

## SQLite schema

See `server/db.js` — five tables: `telemetry`, `events`, `topups`,
`appliance_attribution`, `settings`. All indexes are on `(device_id, ts)`.

## Why this stack

- **No Docker** — public MQTT broker, embedded SQLite, no separate services.
- **No build step** — dashboard is plain HTML loading Chart.js from a CDN.
- **No mobile emulator** — dashboard is responsive and works on phone browsers.
- **Two commands to run** — `npm install`, `npm start`. That's it.

## Why a public MQTT broker

HiveMQ's free public broker is widely used for IoT teaching. It eliminates the
biggest single source of failure on a marker's machine: a missing or
mis-configured local broker. Topics are randomised per build to avoid
collisions, and the payload contains no personal data.

For a real deployment, the broker URL is a single config change away from a
private TLS-secured broker.
