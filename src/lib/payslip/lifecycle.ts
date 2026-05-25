/**
 * Centralised payslip lifecycle stage derivation.
 *
 * Both the employee-facing 4-step PaymentTimeline and any admin status
 * indicator (badges, columns) MUST import from this module so the two
 * surfaces can never disagree on what stage a payslip is in. The
 * comment "konsisten dengan admin view" in the design plan refers to
 * exactly this contract.
 *
 * Source of truth columns:
 *   - payslips.status               ("draft" | "finalized")
 *   - payslips.employee_response    ("pending" | "acknowledged" | "issue")
 *   - payslips.payment_status       ("unpaid" | "paid")
 *
 * The drafts state is never surfaced to karyawan — they only see
 * finalized payslips — so Step 1 is always considered "done" in any
 * timeline the karyawan sees. The helper does not blow up if a draft
 * sneaks in; it simply marks Step 1 active.
 */

export type PayslipStageKey =
  | "finalized" // Step 1 — slip diterbitkan
  | "response"  // Step 2 — karyawan konfirmasi / sanggah
  | "payment"   // Step 3 — transfer ke rekening
  | "done";     // Step 4 — selesai

export type StageStatus =
  | "done"      // visual: solid checkmark
  | "active"    // visual: ring around current step
  | "blocked"   // visual: red exclamation — dispute prevents flow
  | "pending";  // visual: muted, not yet started

export interface PayslipStageStep {
  key: PayslipStageKey;
  status: StageStatus;
}

export interface PayslipStageInput {
  status: string | null;
  employee_response: string | null;
  payment_status: string | null;
}

/**
 * Compute the 4-step lifecycle for a payslip row.
 *
 * Edge cases:
 *   - Draft slip (shouldn't appear in employee UI): Step 1 = active,
 *     subsequent steps = pending.
 *   - Karyawan disputes (employee_response = "issue"): Step 2 = blocked,
 *     Step 3 + 4 = pending. Admin must resolve before payment proceeds.
 *   - Acknowledged + paid: all steps = done.
 */
export function derivePayslipStages(p: PayslipStageInput): PayslipStageStep[] {
  const isFinalized = p.status === "finalized";
  const response = p.employee_response ?? "pending";
  const paid = p.payment_status === "paid";

  const step1: PayslipStageStep = {
    key: "finalized",
    status: isFinalized ? "done" : "active",
  };

  if (!isFinalized) {
    return [
      step1,
      { key: "response", status: "pending" },
      { key: "payment", status: "pending" },
      { key: "done", status: "pending" },
    ];
  }

  // Finalized → progress through response.
  let step2: PayslipStageStep;
  let step3: PayslipStageStep;
  let step4: PayslipStageStep;

  if (response === "issue") {
    step2 = { key: "response", status: "blocked" };
    step3 = { key: "payment", status: "pending" };
    step4 = { key: "done", status: "pending" };
  } else if (response === "acknowledged") {
    step2 = { key: "response", status: "done" };
    if (paid) {
      step3 = { key: "payment", status: "done" };
      step4 = { key: "done", status: "done" };
    } else {
      step3 = { key: "payment", status: "active" };
      step4 = { key: "done", status: "pending" };
    }
  } else {
    // response === "pending"
    step2 = { key: "response", status: "active" };
    if (paid) {
      // Edge: admin paid before karyawan responded. Mark payment done,
      // keep response active so karyawan still sees the prompt.
      step3 = { key: "payment", status: "done" };
      step4 = { key: "done", status: "active" };
    } else {
      step3 = { key: "payment", status: "pending" };
      step4 = { key: "done", status: "pending" };
    }
  }

  return [step1, step2, step3, step4];
}

/**
 * Single high-level label for badges / chips that need one word to
 * describe the current overall state. The timeline UI uses the per-step
 * status from `derivePayslipStages` directly; this helper is for compact
 * surfaces that don't have room for the full 4-step view.
 */
export function overallStageLabel(p: PayslipStageInput): {
  key: "draft" | "awaiting_response" | "issue" | "awaiting_payment" | "paid";
} {
  if (p.status !== "finalized") return { key: "draft" };
  if (p.employee_response === "issue") return { key: "issue" };
  if (p.payment_status === "paid") return { key: "paid" };
  if (p.employee_response === "acknowledged") return { key: "awaiting_payment" };
  return { key: "awaiting_response" };
}
