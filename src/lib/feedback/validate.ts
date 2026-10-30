/**
 * Validasi isian feedback pelanggan (dipakai server action, boleh juga dipakai form untuk pesan kekurangan).
 * Modul murni.
 */

import {
  ASPECT_ALL_GOOD,
  COMMENT_MAX,
  FEEDBACK_ASPECTS,
  WISH_MAX,
  type FeedbackAspectKey,
  type VisitType,
} from "./constants.ts";

export interface FeedbackInput {
  visitType: unknown;
  rating: unknown;
  aspects: unknown;
  comment: unknown;
  productWish: unknown;
}

export interface CleanFeedback {
  visitType: VisitType;
  rating: number;
  aspects: FeedbackAspectKey[];
  comment: string | null;
  productWish: string | null;
}

const KNOWN = new Set<string>(FEEDBACK_ASPECTS.map((a) => a.key));

const clean = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Hasil: data bersih, atau pesan galat berbahasa Indonesia yang ramah untuk pelanggan. */
export function validateFeedback(input: FeedbackInput): { ok: true; data: CleanFeedback } | { ok: false; error: string } {
  if (input.visitType !== "first" && input.visitType !== "returning") {
    return { ok: false, error: "Pilih dulu: baru pertama kali datang atau sudah pernah." };
  }
  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: "Pilih jumlah bintang dulu ya, kak." };
  }
  const picked = Array.isArray(input.aspects) ? input.aspects.filter((a): a is string => typeof a === "string" && KNOWN.has(a)) : [];
  let aspects = [...new Set(picked)] as FeedbackAspectKey[];
  if (aspects.includes(ASPECT_ALL_GOOD)) aspects = [ASPECT_ALL_GOOD];
  const comment = clean(input.comment, COMMENT_MAX);
  if (aspects.length === 0 && comment === "") {
    return { ok: false, error: "Pilih satu atau lebih masukan, atau tulis sendiri ya, kak." };
  }
  const wish = clean(input.productWish, WISH_MAX);
  return {
    ok: true,
    data: { visitType: input.visitType, rating, aspects, comment: comment || null, productWish: wish || null },
  };
}
