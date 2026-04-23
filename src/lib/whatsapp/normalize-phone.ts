/**
 * Normalize a user-entered phone to the E.164-without-plus form Fonnte
 * expects. Accepts:
 *  - "+6285..."        → "6285..."
 *  - "  6285... "      → "6285..."
 *  - "6285-123 456"    → "6285123456"
 *  - "0811..."         → "62811..." (Indonesian local 0-prefix auto-coerced
 *                         to country code 62 — employees overwhelmingly
 *                         enter nomor lokal, and silently dropping them
 *                         meant milestone WhatsApps never fired).
 *
 * Lives in its own plain module (not inside a "use server" file) because
 * Next turbopack only allows async exports from server-action modules.
 */
export function normalizePhone(input: string): string | null {
  let cleaned = input.replace(/[^\d+]/g, "").replace(/^\+/, "");
  // Indonesian local 08xxx → 628xxx. Heuristik aman: Fonnte hanya
  // terintegrasi dengan nomor ID untuk saat ini.
  if (cleaned.startsWith("0")) cleaned = "62" + cleaned.slice(1);
  if (!/^[1-9][0-9]{6,14}$/.test(cleaned)) return null;
  return cleaned;
}
