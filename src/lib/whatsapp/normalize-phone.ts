/**
 * Normalize a user-entered phone to the E.164-without-plus form Fonnte
 * expects. Accepts:
 *  - "+6285..."        → "6285..."
 *  - "  6285... "      → "6285..."
 *  - "6285-123 456"    → "6285123456"
 *  - "0811..."         → rejected (Indonesian local 0-prefix — admin must
 *                         provide the full international number to avoid
 *                         ambiguity when we add non-ID recipients later).
 *
 * Lives in its own plain module (not inside a "use server" file) because
 * Next turbopack only allows async exports from server-action modules.
 */
export function normalizePhone(input: string): string | null {
  const cleaned = input.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (!/^[1-9][0-9]{6,14}$/.test(cleaned)) return null;
  return cleaned;
}
