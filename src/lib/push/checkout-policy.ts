export const PUSH_CLICK_MAX_AGE_MS = 7 * 86_400_000;
export const CHECKOUT_ATTEMPT_MS = 30 * 60_000;
export const PUSH_TEST_EXPIRY_MS = 5 * 60_000;

export function needsPushVerification(lastClickedAt: string | null, exempt: boolean, now = Date.now()) {
  if (exempt) return false;
  const clicked = lastClickedAt ? Date.parse(lastClickedAt) : NaN;
  return !Number.isFinite(clicked) || clicked > now || now - clicked > PUSH_CLICK_MAX_AGE_MS;
}
