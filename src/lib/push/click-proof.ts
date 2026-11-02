import { createHmac, timingSafeEqual } from "node:crypto";

/** A plain endpoint is not proof of a tap. Only push payloads carry this signature. */
export function signPushClick(endpoint: string, secret: string, now = Date.now()) {
  const expires = String(now + 7 * 86_400_000);
  const signature = createHmac("sha256", secret).update(`${endpoint}\n${expires}`).digest("hex");
  return `${expires}.${signature}`;
}

export function verifyPushClick(endpoint: string, proof: unknown, secret: string, now = Date.now()) {
  if (!secret || typeof proof !== "string") return false;
  const [expires, signature, extra] = proof.split(".");
  if (extra || !/^\d{13}$/.test(expires ?? "") || !/^[a-f0-9]{64}$/.test(signature ?? "") || Number(expires) <= now) return false;
  const expected = createHmac("sha256", secret).update(`${endpoint}\n${expires}`).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
