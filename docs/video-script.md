# Video Script - WattGuard (4 to 6 minutes)

Recording target: 4-6 minutes, MP4, screen + microphone narration.
Tool suggestion: OBS Studio or Windows Game Bar (Win + G).

Before recording:
- Run `npm run seed` so the dashboard opens with charts already populated.
- Open three browser tabs: dashboard at http://localhost:3000, Wokwi project,
  GitHub repository.
- Have a script printout next to you.

---

## (0:00 - 0:30) Introduction and Project Title

> "Hi, my name is Tinka Fahad, registration number 254430. This is my
> end-of-semester project for the Internet of Things module. The project
> is called WattGuard - a smart home power monitor for Ugandan households
> on Umeme's Yaka prepaid electricity service."

(On screen: README cover area or the dashboard header.)

## (0:30 - 1:30) Problem Statement and Target Users

> "Every Yaka customer has had this moment: the power cuts out and you
> realise you forgot to top up. Or you bought 50 units on Monday and they
> are gone by Wednesday with no idea where they went. The Yaka meter only
> shows a single number on a tiny LCD; it does not predict when units will
> run out and it does not tell you which appliance is the heaviest drain."

> "WattGuard is built for ordinary Ugandan households, plus small home-based
> businesses like tailors and salons that lose income when power runs out
> mid-job."

(On screen: switch to the alert strip and KPI row of the dashboard.)

## (1:30 - 2:30) IoT Technology Stack and Architecture

> "WattGuard is a four-tier IoT system. At the perception layer, a
> Wokwi-simulated ESP32 reads a current sensor at one kilohertz and
> computes RMS over one-second windows."

> "It publishes telemetry over MQTT to the public HiveMQ broker. A Node.js
> backend subscribes, validates the data, writes to SQLite, runs the Yaka
> ledger, predicts depletion, and attributes energy to appliances using a
> deterministic signature engine. The dashboard is plain HTML with
> Bootstrap and Chart.js, fed live by Server-Sent Events."

(On screen: open `docs/architecture.md` or the diagram.)

## (2:30 - 4:30) System Demonstration

> "Here is the Wokwi simulation - I press Start and the ESP32 boots, joins
> Wi-Fi, and starts publishing. The OLED shows live wattage and the blue
> LED blinks on each MQTT publish."

(Switch to dashboard.)

> "On the dashboard, the live power chart updates every second. Yaka units
> remaining and the ETA at the current load are shown across the top.
> Below, you can see the daily energy bar chart, today's hourly trend, and
> the appliance pie chart from the last seven days."

> "Now I will use the scenario panel. I click Iron ON. Watch the live
> chart spike, the ETA shorten, and after a few seconds the iron slice
> appears in the appliance pie chart. I click Kettle ON - now we are
> drawing nearly 3 kilowatts and a high-draw event appears in the events
> feed."

> "I will now record a top-up. I click Record top-up, enter 50 units, save.
> The Yaka counter jumps and the ETA recomputes."

## (4:30 - 5:30) Limitations and Solutions

> "Three limitations and how I solved them. First, no real ACS712
> hardware: I used Wokwi's analog signal source which produces the same
> waveform shape, so the firmware code is identical to a physical build.
> Second, the public MQTT broker is shared: I randomised the topic prefix
> per build so messages do not collide. Third, my Node.js installation
> originally failed to compile better-sqlite3 on Windows: I upgraded the
> dependency to a version that ships pre-built binaries for Node 24, so
> the marker needs no compiler."

## (5:30 - 6:00) Wrap-up

> "All source code is at github.com/tf254430-max/wattguard. The full
> report is in the docs folder. The marker can clone, run two commands,
> and have the dashboard live within thirty seconds. Thank you."

---

## Editing checklist

- [ ] Title card at start with project name and your name.
- [ ] Lower-third with student name and reg number.
- [ ] Cursor visible (use Mouseposé or Windows mouse highlighter).
- [ ] Background music optional, low volume.
- [ ] Export as MP4 (1080p, 30 fps).
- [ ] Upload to Google Drive, set sharing to "Anyone with the link".
- [ ] Test the link in an incognito window.
- [ ] Paste the link at the top of `Report.md` before exporting to PDF.
