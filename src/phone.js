/**
 * UAE phone number utilities (backend copy).
 *
 * Kept independent of the frontend so the backend never trusts client-side
 * normalization. All inbound phone numbers are re-normalized and validated
 * here before use.
 */

/**
 * Normalizes any UAE phone input to the bare subscriber digits (no country
 * code, no leading national 0, no separators). e.g. "0501234567" -> "501234567".
 */
export function normalizeUaeLocalNumber(input) {
  let digits = String(input ?? "").replace(/[^\d]/g, "");

  if (digits.startsWith("00971")) {
    digits = digits.slice(5);
  } else if (digits.startsWith("971")) {
    digits = digits.slice(3);
  }

  if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  return digits;
}

/**
 * Validates a UAE mobile number: 9 digits starting with 5.
 */
export function isValidUaeMobile(input) {
  return /^5\d{8}$/.test(normalizeUaeLocalNumber(input));
}

/**
 * Converts any UAE phone input to the SMS-API-required format:
 * country code + subscriber digits, no "+", no spaces, no leading zero.
 * e.g. "+971 58 589 6615" -> "971585896615".
 */
export function toApiPhoneFormat(input) {
  return `971${normalizeUaeLocalNumber(input)}`;
}
