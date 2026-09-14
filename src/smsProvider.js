/**
 * SMS provider integration (Synapse).
 *
 * Builds the provider payload with credentials pulled from the environment and
 * sends the message. Credentials never leave this module / the backend.
 */

import { config, getSmsCredentials } from "./config.js";

/**
 * Sends an OTP SMS to the given API-formatted phone number (e.g. 971585896615).
 *
 * @param {string} apiPhone  Phone in provider format (no +, no spaces, no leading 0)
 * @param {string} otp       The one-time code to include in the message
 * @returns {Promise<{ ok: true } | { ok: false, reason: string }>}
 */
export async function sendOtpSms(apiPhone, otp) {
  const { userName, password, senderId } = getSmsCredentials();

  const payload = {
    userName,
    msgType: 0,
    senderId,
    message: `Your verification code is ${otp}`,
    mobileNumbers: {
      messageParams: [{ mobileNumber: apiPhone }],
    },
    password,
  };

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    config.sms.requestTimeoutMs,
  );

  try {
    const response = await fetch(config.sms.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { ok: false, reason: `provider_status_${response.status}` };
    }

    // Some providers return non-JSON bodies; treat a 2xx as success but guard
    // against explicit error flags when JSON is present.
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (body && typeof body === "object") {
      const errorFlag =
        body.error === true ||
        body.status === "error" ||
        body.success === false;
      if (errorFlag) {
        return { ok: false, reason: "provider_error" };
      }
    }

    return { ok: true };
  } catch (err) {
    if (err?.name === "AbortError") {
      return { ok: false, reason: "timeout" };
    }
    return { ok: false, reason: "network_error" };
  } finally {
    clearTimeout(timeout);
  }
}
