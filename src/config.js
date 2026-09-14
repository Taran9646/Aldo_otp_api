/**
 * Centralized, validated configuration loaded from environment variables.
 *
 * All secrets (SMS credentials) come from the environment only. Nothing here
 * is ever sent to the frontend.
 */

import "dotenv/config";

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function intEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  port: intEnv("PORT", 8080),

  sms: {
    apiUrl:
      process.env.SYNAPSE_SMS_URL?.trim() ||
      "http://api.me.synapselive.com/v1/multichannel/messages/sendsms",
    // Read lazily via getSmsCredentials() so the server can boot for health
    // checks even before credentials are set, but sending will fail clearly.
    requestTimeoutMs: intEnv("SMS_REQUEST_TIMEOUT_MS", 10000),
  },

  otp: {
    length: intEnv("OTP_LENGTH", 6),
    ttlSeconds: intEnv("OTP_TTL_SECONDS", 300),
    resendCooldownSeconds: intEnv("OTP_RESEND_COOLDOWN_SECONDS", 60),
    maxSendsPerHour: intEnv("OTP_MAX_SENDS_PER_HOUR", 5),
    maxVerifyAttempts: intEnv("OTP_MAX_VERIFY_ATTEMPTS", 5),
  },
};

/**
 * Returns the SMS credentials, throwing a clear error if any are missing.
 * Called at send time so misconfiguration surfaces as a controlled failure.
 */
export function getSmsCredentials() {
  return {
    userName: requireEnv("SYNAPSE_USERNAME"),
    password: requireEnv("SYNAPSE_PASSWORD"),
    senderId: requireEnv("SYNAPSE_SENDER_ID"),
  };
}
