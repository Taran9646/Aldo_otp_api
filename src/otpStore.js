/**
 * Server-side OTP store.
 *
 * Keeps OTPs, expiry, resend cooldowns, send counts, and verification status
 * keyed by the API phone format. The OTP value never leaves the backend.
 *
 * This in-memory implementation is suitable for a single-instance backend.
 * For multi-instance/production scale, swap the Map for Redis or a database
 * with TTL support - the public functions below are the seam for that.
 */

import { randomInt } from "node:crypto";

import { config } from "./config.js";

/**
 * @typedef {Object} OtpRecord
 * @property {string} code            The hashed-free OTP (kept server-side only)
 * @property {number} expiresAt       Epoch ms when the OTP expires
 * @property {number} lastSentAt      Epoch ms of the last send (for cooldown)
 * @property {number[]} sendTimestamps Epoch ms of sends within the rolling hour
 * @property {number} verifyAttempts  Failed verify attempts for current code
 */

/** @type {Map<string, OtpRecord>} */
const otpByPhone = new Map();

/** @type {Map<string, number>} phone -> epoch ms when verification was granted */
const verifiedPhones = new Map();

/**
 * Generates a cryptographically secure numeric OTP of the configured length.
 */
export function generateOtp() {
  const { length } = config.otp;
  const min = 10 ** (length - 1);
  const max = 10 ** length;
  return String(randomInt(min, max));
}

/**
 * Checks whether a new send is allowed for this phone, enforcing the resend
 * cooldown and the hourly send cap.
 *
 * @returns {{ allowed: true } | { allowed: false, reason: string, retryAfterSeconds?: number }}
 */
export function canSend(phone) {
  const now = Date.now();
  const record = otpByPhone.get(phone);
  if (!record) return { allowed: true };

  const cooldownMs = config.otp.resendCooldownSeconds * 1000;
  const sinceLast = now - record.lastSentAt;
  if (sinceLast < cooldownMs) {
    return {
      allowed: false,
      reason: "cooldown",
      retryAfterSeconds: Math.ceil((cooldownMs - sinceLast) / 1000),
    };
  }

  const recentSends = record.sendTimestamps.filter(
    (ts) => now - ts < 60 * 60 * 1000,
  );
  if (recentSends.length >= config.otp.maxSendsPerHour) {
    return { allowed: false, reason: "rate_limited" };
  }

  return { allowed: true };
}

/**
 * Stores a freshly generated OTP for the phone and records send bookkeeping.
 */
export function saveOtp(phone, code) {
  const now = Date.now();
  const existing = otpByPhone.get(phone);
  const recentSends = (existing?.sendTimestamps ?? []).filter(
    (ts) => now - ts < 60 * 60 * 1000,
  );

  otpByPhone.set(phone, {
    code,
    expiresAt: now + config.otp.ttlSeconds * 1000,
    lastSentAt: now,
    sendTimestamps: [...recentSends, now],
    verifyAttempts: 0,
  });

  // A new OTP invalidates any prior verification for this phone.
  verifiedPhones.delete(phone);
}

/**
 * Verifies a submitted code against the stored OTP.
 *
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function verifyOtp(phone, submittedCode) {
  const record = otpByPhone.get(phone);
  if (!record) {
    return { ok: false, reason: "not_found" };
  }

  if (Date.now() > record.expiresAt) {
    otpByPhone.delete(phone);
    return { ok: false, reason: "expired" };
  }

  if (record.verifyAttempts >= config.otp.maxVerifyAttempts) {
    otpByPhone.delete(phone);
    return { ok: false, reason: "too_many_attempts" };
  }

  if (String(submittedCode) !== record.code) {
    record.verifyAttempts += 1;
    return { ok: false, reason: "mismatch" };
  }

  // Success: consume the OTP and mark the phone verified.
  otpByPhone.delete(phone);
  verifiedPhones.set(phone, Date.now());
  return { ok: true };
}

/**
 * Returns whether the phone currently has a valid verification.
 */
export function isVerified(phone) {
  return verifiedPhones.has(phone);
}

/**
 * Clears verification for a phone (e.g. when the number changes).
 */
export function clearVerification(phone) {
  verifiedPhones.delete(phone);
}

/**
 * Periodically prunes expired OTPs to keep memory bounded.
 */
export function startCleanupTimer() {
  const interval = setInterval(() => {
    const now = Date.now();
    for (const [phone, record] of otpByPhone.entries()) {
      if (now > record.expiresAt) otpByPhone.delete(phone);
    }
  }, 60 * 1000);
  interval.unref?.();
  return interval;
}
