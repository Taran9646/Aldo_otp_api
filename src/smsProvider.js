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

    // Synapse returns JSON like: { "result": "<txnId>", "status": "SUCCESS" }.
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (body && typeof body === "object" && "status" in body) {
      const status = String(body.status).toUpperCase();
      if (status !== "SUCCESS") {
        return { ok: false, reason: "provider_error" };
      }
      // Accepted by the gateway. `body.result` is the provider transaction ID.
      return { ok: true, reference: body.result };
    }

    // Fallback: no recognizable status field but HTTP was 2xx.
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
