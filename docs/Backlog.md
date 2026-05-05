# WattGuard - Sprint Backlog and Planning

This document is the planning artefact required by Q3.iii of the exam template
("Backlog / Planning Evidence"). It mirrors the sprint plan in the proposal
(Section 10) and the work that landed in the GitHub commit history.

## Approach

Iterative four-sprint plan. Each sprint produces a working slice end-to-end.
Sprint length: 2 weeks. Total: 8 weeks.

| Sprint | Window (2026)        | Theme                                    |
|--------|----------------------|------------------------------------------|
| 1      | 12 Feb -- 25 Feb     | Hardware + sampling + project skeleton   |
| 2      | 26 Feb -- 11 Mar     | Connectivity (Wi-Fi + MQTT + persistence)|
| 3      | 12 Mar -- 8 Apr      | Dashboard, ledger, predictor             |
| 4      | 9 Apr -- 7 May       | Signatures, scenarios, polish, submission|

## Sprint 1 - Foundation (Feb 12 - Feb 25)

- [x] Read the brief, write the proposal.
- [x] Decide on stack: ESP32 + Wokwi + Node.js + SQLite + plain HTML.
- [x] Scaffold `firmware/` with PlatformIO + Wokwi config.
- [x] Scaffold `server/` with `package.json`, `server.js`, `/api/health`.
- [x] Wire the Wokwi diagram (ESP32 + analog source + OLED + LEDs + buzzer).
- [x] Implement 1 kHz ADC sampling on GPIO 34 via timer ISR.
- [x] Implement RMS computation over 1-second windows.
- [x] OLED renders live wattage and current.
- [x] Serial monitor shows the JSON telemetry payload every second.

## Sprint 2 - Connectivity (Feb 26 - Mar 11)

- [x] Firmware joins Wokwi-GUEST Wi-Fi.
- [x] PubSubClient connects to broker.hivemq.com:1883 with random client id.
- [x] Topics under a randomised prefix to avoid collisions on the public broker.
- [x] LWT publishes "offline" if the device drops.
- [x] Backend `mqtt.js` subscribes and validates incoming JSON.
- [x] SQLite schema (telemetry, events, topups, attribution, settings).
- [x] Telemetry rows inserted via prepared statements.
- [x] Old telemetry pruned at startup (90 day retention).
- [x] Backend `/api/live` returns the latest telemetry row.

## Sprint 3 - Dashboard, Ledger, Predictor (Mar 12 - Apr 8)

- [x] Yaka top-up ledger (1 unit = 1 kWh).
- [x] Depletion predictor based on rolling 5-minute average load.
- [x] REST endpoints for live, daily, hourly, appliances, events, top-ups.
- [x] Server-Sent Events stream broadcasts telemetry, events, status.
- [x] Bootstrap + Chart.js dashboard with KPI row, live chart, daily bar
      chart, hourly chart, appliance pie chart.
- [x] Top-up modal posts to `/api/topups`.
- [x] Severity strip changes colour at the configured thresholds.
- [x] On-device high-draw event detection (P > 1500 W for 10 s).

## Sprint 4 - Signatures, Scenarios, Polish (Apr 9 - May 7)

- [x] Deterministic signature engine with six appliance profiles.
- [x] Scenario panel publishes MQTT commands; firmware adjusts simulated load.
- [x] Settings card writes to SQLite and persists across restarts.
- [x] Headless `simulate.js` so the dashboard works without Wokwi.
- [x] Demo seed script populates two weeks of plausible data.
- [x] Unit tests for ledger predictor, signature engine, telemetry validator.
- [x] Firmware native test for the RMS routine.
- [x] README quick-start for the marker.
- [x] Final report (Report.md) and video script.

## Risks and how they were mitigated

| Risk                                                  | Mitigation                                       |
|-------------------------------------------------------|--------------------------------------------------|
| HiveMQ broker temporarily down                        | Topic prefix is configurable; demo video backup  |
| Wokwi free tier rate limits the simulation            | Sessions kept short by design                    |
| `better-sqlite3` had no Node 24 prebuilt binaries     | Bumped to v12 which ships Node 24 prebuilds      |
| Lecturer expects a mobile app                         | Dashboard is fully responsive and works on phones|
| Scope creep                                           | Strict feature freeze after Sprint 3             |

## Tools used

- VS Code, Wokwi for VS Code, PlatformIO.
- Node.js 24 LTS-line, `better-sqlite3@^12`, `mqtt@^5`, `express@^4`.
- Git + GitHub for source control, with progressive commits per sprint.
- Trello-style backlog (this document).
