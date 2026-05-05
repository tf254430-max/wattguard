// WattGuard firmware - ESP32 / Wokwi
//
// Samples a simulated ACS712 current sensor at 1 kHz, computes RMS over a
// 1 s window, derives real power at 240 V, integrates energy, detects
// high-draw events, and publishes telemetry over MQTT every second.
//
// Pinout matches docs/architecture.md and the proposal Section 6.2.

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <Adafruit_SSD1306.h>
#include <ArduinoJson.h>
#include <math.h>

// ---- Configuration -------------------------------------------------------

static const char* WIFI_SSID     = "Wokwi-GUEST";
static const char* WIFI_PASS     = "";
static const char* MQTT_HOST     = "broker.hivemq.com";
static const uint16_t MQTT_PORT  = 1883;

// MUST match server/.env MQTT_TOPIC_PREFIX
static const char* TOPIC_PREFIX  = "tinka-wattguard-9f3a2";
static const char* DEVICE_ID     = "WG-001";

static const float VOLTAGE_RMS   = 240.0f;     // Uganda single-phase mains
static const float ACS_SENS      = 0.185f;     // V/A for ACS712-5A
static const float ACS_OFFSET    = 2.5f;       // V at 0 A

static const uint8_t PIN_ACS     = 34;
static const uint8_t PIN_SDA     = 21;
static const uint8_t PIN_SCL     = 22;
static const uint8_t PIN_BUZZER  = 25;
static const uint8_t PIN_LED_R   = 26;
static const uint8_t PIN_LED_G   = 27;
static const uint8_t PIN_LED_B   = 14;
static const uint8_t PIN_BUTTON  = 32;

static const uint32_t SAMPLE_HZ        = 1000;
static const uint32_t TELEMETRY_MS     = 1000;
static const float    HIGH_DRAW_W      = 1500.0f;
static const uint32_t HIGH_DRAW_MS     = 10000;

// ---- State ---------------------------------------------------------------

Adafruit_SSD1306 oled(128, 64, &Wire, -1);
WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

volatile double sumSquares = 0.0;
volatile uint32_t sampleCount = 0;
hw_timer_t* sampleTimer = nullptr;
portMUX_TYPE sampleMux = portMUX_INITIALIZER_UNLOCKED;

float lastIRms = 0.0f;
float lastPowerW = 0.0f;
double cumulativeWh = 0.0;

// scenario-controlled simulated load (in amps RMS).
// In Wokwi we cannot rewrite the analog signal source amplitude at runtime,
// so the firmware adds a virtual offset on top of whatever the simulator
// provides. This mirrors what a physical sensor would naturally see when
// appliances switch on.
volatile float scenarioBoostA = 0.0f;

uint32_t highDrawStartMs = 0;
bool highDrawFired = false;
uint32_t lastTelemetryMs = 0;
uint32_t lastUiMs = 0;
uint32_t buzzerUntilMs = 0;
uint8_t  uiScreen = 0;
uint32_t lastButtonMs = 0;

char topicTelemetry[80];
char topicEvents[80];
char topicStatus[80];
char topicCommands[80];

// ---- Sampling ------------------------------------------------------------

void IRAM_ATTR onSampleTimer() {
  uint16_t raw = analogRead(PIN_ACS);
  float v = (raw / 4095.0f) * 3.3f;
  float i = (v - ACS_OFFSET) / ACS_SENS;
  i += scenarioBoostA;
  portENTER_CRITICAL_ISR(&sampleMux);
  sumSquares += (double)i * (double)i;
  sampleCount++;
  portEXIT_CRITICAL_ISR(&sampleMux);
}

float computeRms() {
  double localSum;
  uint32_t localCount;
  portENTER_CRITICAL(&sampleMux);
  localSum = sumSquares;
  localCount = sampleCount;
  sumSquares = 0.0;
  sampleCount = 0;
  portEXIT_CRITICAL(&sampleMux);
  if (localCount == 0) return 0.0f;
  double mean = localSum / (double)localCount;
  if (mean < 0.0) mean = 0.0;
  return (float)sqrt(mean);
}

// ---- Networking ----------------------------------------------------------

void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("[wifi] connecting");
  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 20000) {
    delay(250);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[wifi] connected ip=");
    Serial.println(WiFi.localIP());
    digitalWrite(PIN_LED_G, HIGH);
  } else {
    Serial.println("[wifi] failed - will retry in loop");
  }
}

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, payload, length);
  if (err) return;
  if (strcmp(topic, topicCommands) != 0) return;

  // payload schema: { appliance: "iron", state: "on"|"off", current_a: 6.0 }
  bool on = strcmp(doc["state"] | "off", "on") == 0;
  float amps = doc["current_a"] | 0.0f;
  if (on) {
    scenarioBoostA += amps;
  } else {
    scenarioBoostA -= amps;
    if (scenarioBoostA < 0) scenarioBoostA = 0;
  }
  Serial.printf("[cmd] appliance=%s state=%s boost=%.2f A\n",
                (const char*)(doc["appliance"] | "?"),
                on ? "on" : "off",
                scenarioBoostA);
}

void connectMqtt() {
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMqttMessage);
  mqtt.setBufferSize(512);

  String clientId = String("wattguard-") + String((uint32_t)esp_random(), HEX);
  Serial.printf("[mqtt] connecting as %s\n", clientId.c_str());
  bool ok = mqtt.connect(
      clientId.c_str(),
      nullptr, nullptr,
      topicStatus, 0, true, "offline");
  if (ok) {
    Serial.println("[mqtt] connected");
    mqtt.publish(topicStatus, "online", true);
    mqtt.subscribe(topicCommands);
  } else {
    Serial.printf("[mqtt] failed rc=%d\n", mqtt.state());
  }
}

void ensureMqtt() {
  if (mqtt.connected()) {
    mqtt.loop();
    return;
  }
  static uint32_t lastTry = 0;
  if (millis() - lastTry < 3000) return;
  lastTry = millis();
  if (WiFi.status() != WL_CONNECTED) connectWifi();
  connectMqtt();
}

// ---- Publishing ----------------------------------------------------------

void publishTelemetry(float iRms, float powerW, float dWh) {
  StaticJsonDocument<256> doc;
  doc["v"] = 1;
  doc["device_id"] = DEVICE_ID;
  doc["ts"] = (uint32_t)(millis() / 1000);
  doc["i_rms"] = iRms;
  doc["p_w"] = powerW;
  doc["energy_inc_wh"] = dWh;
  doc["voltage_assumed"] = VOLTAGE_RMS;
  char buf[256];
  size_t n = serializeJson(doc, buf, sizeof(buf));
  mqtt.publish(topicTelemetry, buf, n);
}

void publishEvent(const char* type, const char* severity, float value) {
  StaticJsonDocument<256> doc;
  doc["device_id"] = DEVICE_ID;
  doc["ts"] = (uint32_t)(millis() / 1000);
  doc["event_type"] = type;
  doc["severity"] = severity;
  doc["value"] = value;
  char buf[256];
  size_t n = serializeJson(doc, buf, sizeof(buf));
  mqtt.publish(topicEvents, buf, n);
}

// ---- UI ------------------------------------------------------------------

void renderOled() {
  oled.clearDisplay();
  oled.setTextSize(1);
  oled.setTextColor(SSD1306_WHITE);
  oled.setCursor(0, 0);
  oled.println("WattGuard");
  oled.drawFastHLine(0, 9, 128, SSD1306_WHITE);

  if (uiScreen == 0) {
    oled.setTextSize(2);
    oled.setCursor(0, 16);
    oled.print((int)lastPowerW);
    oled.print("W");
    oled.setTextSize(1);
    oled.setCursor(0, 40);
    oled.print("I=");
    oled.print(lastIRms, 2);
    oled.println("A");
    oled.print("E=");
    oled.print(cumulativeWh, 1);
    oled.print("Wh");
  } else if (uiScreen == 1) {
    oled.setCursor(0, 16);
    oled.println(WiFi.status() == WL_CONNECTED ? "WiFi: OK" : "WiFi: --");
    oled.println(mqtt.connected() ? "MQTT: OK" : "MQTT: --");
    oled.println(WiFi.localIP().toString());
  } else {
    oled.setCursor(0, 16);
    oled.println("Topic prefix:");
    oled.println(TOPIC_PREFIX);
  }
  oled.display();
}

void buttonLoop() {
  static bool last = HIGH;
  bool now = digitalRead(PIN_BUTTON);
  if (last == HIGH && now == LOW && millis() - lastButtonMs > 200) {
    uiScreen = (uiScreen + 1) % 3;
    lastButtonMs = millis();
  }
  last = now;
}

void buzzerLoop() {
  if (buzzerUntilMs && millis() < buzzerUntilMs) {
    digitalWrite(PIN_BUZZER, (millis() / 100) % 2);
  } else {
    digitalWrite(PIN_BUZZER, LOW);
    buzzerUntilMs = 0;
  }
}

// ---- Setup / loop --------------------------------------------------------

void buildTopics() {
  snprintf(topicTelemetry, sizeof(topicTelemetry), "%s/telemetry", TOPIC_PREFIX);
  snprintf(topicEvents,    sizeof(topicEvents),    "%s/events",    TOPIC_PREFIX);
  snprintf(topicStatus,    sizeof(topicStatus),    "%s/status",    TOPIC_PREFIX);
  snprintf(topicCommands,  sizeof(topicCommands),  "%s/commands",  TOPIC_PREFIX);
}

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\nWattGuard booting");

  pinMode(PIN_LED_R, OUTPUT);
  pinMode(PIN_LED_G, OUTPUT);
  pinMode(PIN_LED_B, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  analogReadResolution(12);

  Wire.begin(PIN_SDA, PIN_SCL);
  if (!oled.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("[oled] init failed (continuing anyway)");
  }
  oled.clearDisplay();
  oled.setTextSize(1);
  oled.setTextColor(SSD1306_WHITE);
  oled.setCursor(0, 0);
  oled.println("WattGuard booting");
  oled.display();

  buildTopics();

  // 1 kHz sampling timer (timer 0, prescaler 80 -> 1 us tick).
  sampleTimer = timerBegin(0, 80, true);
  timerAttachInterrupt(sampleTimer, &onSampleTimer, true);
  timerAlarmWrite(sampleTimer, 1000000UL / SAMPLE_HZ, true);
  timerAlarmEnable(sampleTimer);

  connectWifi();
  connectMqtt();
}

void loop() {
  ensureMqtt();
  buttonLoop();
  buzzerLoop();

  uint32_t now = millis();
  if (now - lastTelemetryMs >= TELEMETRY_MS) {
    lastTelemetryMs = now;

    lastIRms = computeRms();
    lastPowerW = lastIRms * VOLTAGE_RMS;
    float dWh = lastPowerW * (TELEMETRY_MS / 3600000.0f);
    cumulativeWh += dWh;

    if (lastPowerW > HIGH_DRAW_W) {
      if (highDrawStartMs == 0) highDrawStartMs = now;
      if (!highDrawFired && now - highDrawStartMs >= HIGH_DRAW_MS) {
        publishEvent("high_draw", "warning", lastPowerW);
        buzzerUntilMs = now + 800;
        highDrawFired = true;
      }
    } else {
      highDrawStartMs = 0;
      highDrawFired = false;
    }

    if (mqtt.connected()) {
      publishTelemetry(lastIRms, lastPowerW, dWh);
      digitalWrite(PIN_LED_B, !digitalRead(PIN_LED_B));
    }
  }

  if (now - lastUiMs >= 250) {
    lastUiMs = now;
    renderOled();
  }
}
