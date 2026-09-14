/**
 * OTP HTTP route handlers.
 *
 * These endpoints are called by the Checkout UI Extension. They never return
 * the OTP value - only success/failure and safe metadata.
 */

import { Router } from "express";

import { config } from "./config.js";
import { isValidUaeMobile, toApiPhoneFormat } from "./phone.js";
import {
  generateOtp,
  canSend,
  saveOtp,
  verifyOtp as verifyStoredOtp,
  isVerified,
  clearVerification,
} from "./otpStore.js";
import { sendOtpSms } from "./smsProvider.js";

export const otpRouter = Router();

const SEND_ERROR_MESSAGES = {
  cooldown: "Please wait before requesting another code.",
  rate_limited: "Too many requests. Please try again later.",
  timeout: "The SMS service timed out. Please try again.",
  network_error: "Could not reach the SMS service. Please try again.",
  provider_error: "Failed to send the code. Please try again.",
};

const VERIFY_ERROR_MESSAGES = {
  not_found: "No active code. Please request a new one.",
  expired: "This code has expired. Please request a new one.",
  too_many_attempts: "Too many attempts. Please request a new code.",
  mismatch: "Invalid code. Please try again.",
};

/**
 * POST /api/otp/send
 * Body: { phone: string }
 */
otpRouter.post("/send", async (req, res) => {
  const { phone } = req.body ?? {};

  if (!isValidUaeMobile(phone)) {
    return res
      .status(400)
      .json({ ok: false, message: "Enter a valid UAE mobile number." });
  }

  const apiPhone = toApiPhoneFormat(phone);

  const gate = canSend(apiPhone);
  if (!gate.allowed) {
    const status = gate.reason === "rate_limited" ? 429 : 429;
    return res.status(status).json({
      ok: false,
      message: SEND_ERROR_MESSAGES[gate.reason] ?? "Please try again later.",
      retryAfterSeconds: gate.retryAfterSeconds,
    });
  }

  const otp = generateOtp();
  const result = await sendOtpSms(apiPhone, otp);

  if (!result.ok) {
    return res.status(502).json({
      ok: false,
      message: SEND_ERROR_MESSAGES[result.reason] ?? "Failed to send the code.",
      // Temporary diagnostic to identify provider issues in production.
      debugReason: result.reason,
      debugDetail: result.detail,
    });
  }

  // Only persist the OTP once the SMS was accepted by the provider.
  saveOtp(apiPhone, otp);

  return res.json({
    ok: true,
    message: "OTP sent successfully.",
    expiresInSeconds: config.otp.ttlSeconds,
    resendCooldownSeconds: config.otp.resendCooldownSeconds,
  });
});

/**
 * POST /api/otp/verify
 * Body: { phone: string, code: string }
 */
otpRouter.post("/verify", (req, res) => {
  const { phone, code } = req.body ?? {};

  if (!isValidUaeMobile(phone)) {
    return res
      .status(400)
      .json({ ok: false, message: "Enter a valid UAE mobile number." });
  }
  if (!code || !String(code).trim()) {
    return res.status(400).json({ ok: false, message: "Enter the OTP." });
  }

  const apiPhone = toApiPhoneFormat(phone);
  const result = verifyStoredOtp(apiPhone, String(code).trim());

  if (!result.ok) {
    return res.status(400).json({
      ok: false,
      message: VERIFY_ERROR_MESSAGES[result.reason] ?? "Verification failed.",
    });
  }

  return res.json({
    ok: true,
    message: "Phone number verified successfully.",
  });
});

/**
 * GET /api/otp/status?phone=...
 * Lets the extension re-check verification (e.g. after reload) without
 * exposing the OTP. Returns only a boolean.
 */
otpRouter.get("/status", (req, res) => {
  const phone = req.query.phone;
  if (!isValidUaeMobile(phone)) {
    return res.json({ ok: true, verified: false });
  }
  return res.json({ ok: true, verified: isVerified(toApiPhoneFormat(phone)) });
});

/**
 * POST /api/otp/reset
 * Body: { phone: string }
 * Clears verification when the phone number changes.
 */
otpRouter.post("/reset", (req, res) => {
  const { phone } = req.body ?? {};
  if (isValidUaeMobile(phone)) {
    clearVerification(toApiPhoneFormat(phone));
  }
  return res.json({ ok: true });
});
