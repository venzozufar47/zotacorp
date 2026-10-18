import type { ApprovalCategory } from "@/lib/actions/approval-requests.actions";

/**
 * Dipisah dari `approval-requests.actions.ts` karena file `"use server"`
 * hanya boleh mengekspor async function — sama alasan dengan
 * `lib/leave/constants.ts` dan `lib/coaching/constants.ts`.
 */
export const APPROVAL_CATEGORY_LABEL: Record<ApprovalCategory, string> = {
  void: "Void",
  diskon: "Diskon",
  belanja: "Belanja",
  lembur: "Lembur",
  lainnya: "Lainnya",
};
