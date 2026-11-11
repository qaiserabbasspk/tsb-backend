const path = require("path");
const fs = require("fs");
const https = require("https");

function requiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getHotelbedsConfig() {
  return {
    baseUrl: (
      process.env.HOTELBEDS_BASE_URL || "https://api.test.hotelbeds.com"
    ).replace(/\/+$/, ""),

    bookingVersion: process.env.HOTELBEDS_API_VERSION || "1.0",
    contentVersion: process.env.HOTELBEDS_CONTENT_VERSION || "1.0",

    apiKey: requiredEnv("HOTELBEDS_API_KEY"),
    apiSecret: requiredEnv("HOTELBEDS_API_SECRET"),

    timeout: 30000,
  };
}

function getHttpsAgent() {
  const enabled =
    String(process.env.HOTELBEDS_MTLS_ENABLED).toLowerCase() === "true";

  if (!enabled) {
    return undefined;
  }

  const certPath = requiredEnv("HOTELBEDS_CERT_PATH");
  const keyPath = requiredEnv("HOTELBEDS_KEY_PATH");

  const cert = fs.readFileSync(path.resolve(certPath));
  const key = fs.readFileSync(path.resolve(keyPath));

  return new https.Agent({
    cert,
    key,
    keepAlive: true,
    rejectUnauthorized: true,
  });
}

module.exports = {
  getHotelbedsConfig,
  getHttpsAgent,
};
