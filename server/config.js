'use strict';

require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  mqttBrokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://broker.hivemq.com:1883',
  mqttTopicPrefix: process.env.MQTT_TOPIC_PREFIX || 'tinka-wattguard-9f3a2',
  deviceId: process.env.DEVICE_ID || 'WG-001',
  mainsVoltage: parseFloat(process.env.MAINS_VOLTAGE || '240'),
  alertCautionUnits: parseFloat(process.env.ALERT_CAUTION_UNITS || '10'),
  alertWarningUnits: parseFloat(process.env.ALERT_WARNING_UNITS || '5'),
  alertCriticalUnits: parseFloat(process.env.ALERT_CRITICAL_UNITS || '1'),
  retentionDays: parseInt(process.env.RETENTION_DAYS || '90', 10),
  dbPath: process.env.DB_PATH || require('path').join(__dirname, 'data', 'wattguard.db'),
};

config.topics = {
  telemetry: `${config.mqttTopicPrefix}/telemetry`,
  events:    `${config.mqttTopicPrefix}/events`,
  status:    `${config.mqttTopicPrefix}/status`,
  commands:  `${config.mqttTopicPrefix}/commands`,
};

module.exports = config;
