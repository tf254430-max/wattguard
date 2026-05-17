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

## Problem Statement and Objectives

Yaka prepaid meters cut power without warning, hide which appliance is the
biggest drain, and never predict when units will run out. WattGuard solves
this for Ugandan households by measuring household current in real time,
deducting consumed kWh from a Yaka ledger, predicting depletion, attributing
energy to appliances, and alerting the user before darkness hits.

## System Design and Architecture

A four-tier IoT system: a Wokwi-simulated ESP32 with an ACS712-equivalent
analog source samples current at 1 kHz, computes RMS over one-second windows,
derives real power at 240 V, and publishes JSON telemetry over MQTT
(broker.hivemq.com) every second. A Node.js backend subscribes, writes to
SQLite, runs the ledger and signature engine, and pushes Server-Sent Events
to a Bootstrap + Chart.js dashboard.

## System Implementation

The repository contains the firmware (`firmware/`) and the backend with the
embedded dashboard (`server/`). The marker runs `npm install && npm start`,
opens the Wokwi link, and the dashboard at http://localhost:3000 streams
live power, remaining units, ETA, an appliance pie chart, daily/hourly
charts, an events feed, the top-up ledger, and a scenario panel that toggles
virtual appliances over MQTT. Fifteen unit tests pass on the ledger,
predictor, signature engine, and telemetry validator.

**(Word count: ~248)**
