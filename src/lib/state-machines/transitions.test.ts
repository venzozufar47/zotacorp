/**
 * Tes regresi mesin status (docs/STATE_MACHINES.md). Server actions ASLI
 * dijalankan (transpile + vm, pola sama dengan tickets/notifications.test.ts)
 * di atas fake-db yang benar-benar mengevaluasi filter, sehingga balapan
 * "baca → orang lain menulis → tulis" bisa direproduksi lewat `db.onRead`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { createFakeDb, type FakeDb } from "./fake-db.ts";
import { SETTLE_LEASE_MS, settleLeaseFreeFilter } from "../pos/settle-lease.ts";
import { publishBonusRunRows } from "../bonus/publish-run.ts";

/* eslint-disable @typescript-eslint/no-explicit-any -- mock batas modul, jalankan server actions asli */
const require = createRequire(import.meta.url);
const ts = require("typescript");
const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const EMP = "00000000-0000-4000-8000-0000000000e1";

function load(path: string, modules: Record<string, any>) {
  const source = readFileSync(path, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  runInNewContext(
    outputText,
    {
      exports,
      process: { env: {} },
      console: { error() {}, warn() {}, log() {} },
      require: (id: string) => {
        if (id in modules) return modules[id];
        if (id.startsWith("node:")) return require(id);
        throw new Error(`Unexpected dependency: ${id}`);
      },
    },
    { filename: path }
  );
  return exports as any;
}

function common(db: FakeDb, actor: string, pushes: string[]) {
  return {
    "server-only": {},
    "next/cache": { revalidatePath() {} },
    "@/lib/supabase/server": { createClient: async () => db },
    "./_supabase-admin": { createAdminClient: () => db },
    "@/lib/supabase/cached": {
      getCurrentUser: async () => ({ id: actor }),
      getCurrentRole: async () => (actor === ADMIN ? "admin" : "employee"),
    },
    "@/lib/push/web-push": {
      sendPushToUser: async (id: string) => void pushes.push(id),
      sendPushToAdmins: async () => void pushes.push("admins"),
    },
  };
}

// ─── SM-3: keputusan atas permintaan "pending" ────────────────────────────────

test("lembur: keputusan kedua kalah, log absensi tetap mengikuti keputusan pertama", async () => {
  const db = createFakeDb({
    overtime_requests: [{ id: "r1", attendance_log_id: "l1", status: "pending" }],
    attendance_logs: [{ id: "l1", is_overtime: true, overtime_minutes: 90, overtime_status: "pending" }],
  });
  const actions = load("src/lib/actions/overtime.actions.ts", common(db, ADMIN, []));
  // Admin lain menyetujui tepat setelah admin ini membaca status "pending".
  db.onRead("overtime_requests", () => {
    db.tables.overtime_requests[0].status = "approved";
    db.tables.attendance_logs[0].overtime_status = "approved";
  });
  const res = await actions.reviewOvertimeRequest("r1", "rejected", "tidak perlu");
  assert.equal(res.error, "Request already reviewed");
  assert.equal(db.tables.overtime_requests[0].status, "approved");
  assert.equal(db.tables.attendance_logs[0].overtime_status, "approved");
  assert.equal(db.tables.attendance_logs[0].overtime_minutes, 90);
});

test("lembur: log absensi gagal ditulis → permintaan kembali pending", async () => {
  const db = createFakeDb({
    overtime_requests: [{ id: "r1", attendance_log_id: "l1", status: "pending" }],
    attendance_logs: [{ id: "l1", is_overtime: true, overtime_minutes: 90, overtime_status: "pending" }],
  });
  const actions = load("src/lib/actions/overtime.actions.ts", common(db, ADMIN, []));
  db.failOn("attendance_logs", "update", "boom");
  const res = await actions.reviewOvertimeRequest("r1", "approved");
  assert.equal(res.error, "boom");
  assert.equal(db.tables.overtime_requests[0].status, "pending");
  assert.equal(db.tables.attendance_logs[0].overtime_status, "pending");
});

test("izin: atasan kedua tidak menimpa keputusan atasan pertama", async () => {
  const db = createFakeDb({ leave_requests: [{ id: "q1", user_id: EMP, status: "pending" }] });
  const pushes: string[] = [];
  const actions = load("src/lib/actions/leave-requests.actions.ts", {
    ...common(db, ADMIN, pushes),
    "@/lib/leave/constants": { LEAVE_KIND_LABEL: {} },
  });
  db.onRead("leave_requests", () => {
    Object.assign(db.tables.leave_requests[0], { status: "approved", approver_id: "leader-1" });
  });
  const res = await actions.decideLeaveRequest({ requestId: "q1", decision: "rejected" });
  assert.equal(res.ok, false);
  assert.equal(db.tables.leave_requests[0].status, "approved");
  assert.equal(db.tables.leave_requests[0].approver_id, "leader-1");
  assert.deepEqual(pushes, []);
});

function approvalActions(db: FakeDb, pushes: string[]) {
  return load("src/lib/actions/approval-requests.actions.ts", {
    ...common(db, ADMIN, pushes),
    "@/lib/approvals/constants": { APPROVAL_CATEGORY_LABEL: {} },
  });
}

test("persetujuan: keputusan owner tidak ditimpa keputusan kedua", async () => {
  const db = createFakeDb({
    approval_requests: [{ id: "a1", requested_by: EMP, status: "pending", proposal: "x", category: "lain" }],
  });
  const pushes: string[] = [];
  const actions = approvalActions(db, pushes);
  db.onRead("approval_requests", () => void (db.tables.approval_requests[0].status = "approved"));
  const res = await actions.decideApprovalRequest({ id: "a1", decision: "rejected" });
  assert.equal(res.ok, false);
  assert.equal(db.tables.approval_requests[0].status, "approved");
  assert.deepEqual(pushes, []);
});

test("persetujuan: auto-approve tidak menimpa penolakan owner yang datang bersamaan", async () => {
  const db = createFakeDb({
    approval_requests: [
      { id: "a1", requested_by: EMP, status: "pending", created_at: "2026-10-01T02:00:00.000Z", nominal: null, has_safety_or_sanction_impact: false },
    ],
  });
  const actions = approvalActions(db, []);
  db.onRead("approval_requests", () => void (db.tables.approval_requests[0].status = "rejected"));
  await actions.listApprovalRequests();
  assert.equal(db.tables.approval_requests[0].status, "rejected");
});

test("persetujuan: auto-approve tetap jalan untuk yang memang terlantar", async () => {
  const db = createFakeDb({
    approval_requests: [
      { id: "a1", requested_by: EMP, status: "pending", created_at: "2026-10-01T02:00:00.000Z", nominal: null, has_safety_or_sanction_impact: false },
    ],
  });
  await approvalActions(db, []).listApprovalRequests();
  assert.equal(db.tables.approval_requests[0].status, "auto_approved");
});

// ─── SM-4: slip gaji ─────────────────────────────────────────────────────────

function payslipActions(db: FakeDb, actor: string, pushes: string[]) {
  return load("src/lib/actions/payslip.actions.ts", {
    ...common(db, actor, pushes),
    "@/lib/utils/break-windows": { parseBreakWindows: () => [], effectiveStandardHours: () => 8 },
    "@/lib/payslip/finalize-guard": {
      findFinalizeBlockers: () => [],
      describeFinalizeBlockers: () => "",
      hasConfiguredExtraWorkRate: () => true,
    },
    "@/lib/payslip/net-total": { explainNetTotal: () => ({}) },
    "@/lib/payslip/attendance-gate": { attendanceAffectsPay: () => false, shortDayLabel: String },
    "@/lib/utils/jakarta": { jakartaDateString: () => "2026-11-09" },
    "@/lib/cake-bonus": { getCakeBonusDetailByPosition: async () => ({}) },
    "@/lib/cake-bonus/positions": { isCakeBonusPosition: () => false },
    "@/lib/whatsapp/templates": { renderWaTemplate: async () => "" },
    "@/lib/cashflow/format": { formatRp: String },
  });
}

const slip = (over: Record<string, unknown> = {}) => ({
  id: "p1", user_id: EMP, month: 10, year: 2026, status: "finalized",
  employee_response: "pending", payment_status: "unpaid", net_total: 1_000_000,
  monthly_bonus: 0, other_penalty: 0, debt_deduction_auto: 0, debt_deduction_manual: 0,
  prorated_salary: 1_000_000, overtime_pay: 0, late_penalty: 0, deliverables_pay: 0, breakdown_json: {},
  ...over,
});

test("slip: konfirmasi karyawan tidak tercatat bila admin membuka ulang slip di tengah jalan", async () => {
  const db = createFakeDb({ payslips: [slip()] });
  const actions = payslipActions(db, EMP, []);
  db.onRead("payslips", () => void (db.tables.payslips[0].status = "draft"));
  const res = await actions.submitPayslipResponse("p1", "acknowledged");
  assert.ok("error" in res);
  assert.equal(db.tables.payslips[0].employee_response, "pending");
});

test("slip: edit manual kalah dari finalisasi yang terjadi bersamaan", async () => {
  const db = createFakeDb({ payslips: [slip({ status: "draft" })] });
  const actions = payslipActions(db, ADMIN, []);
  db.onRead("payslips", () => void (db.tables.payslips[0].status = "finalized"));
  const res = await actions.updatePayslipManualEntries("p1", { monthly_bonus: 500_000 });
  assert.equal(res.error, "Cannot edit a finalized payslip.");
  assert.equal(db.tables.payslips[0].net_total, 1_000_000);
  assert.equal(db.tables.payslips[0].monthly_bonus, 0);
});

test("slip: finalisasi ganda tidak menghapus tanggapan karyawan dan tidak push dua kali", async () => {
  const db = createFakeDb({ payslips: [slip({ status: "draft" })] });
  const pushes: string[] = [];
  const actions = payslipActions(db, ADMIN, pushes);
  assert.equal((await actions.finalizePayslip("p1")).error, undefined);
  assert.equal(db.tables.payslips[0].status, "finalized");
  db.tables.payslips[0].employee_response = "acknowledged";
  const again = await actions.finalizePayslip("p1");
  assert.ok(again.error);
  assert.equal(db.tables.payslips[0].employee_response, "acknowledged");
  assert.deepEqual(pushes, [EMP]);
});

test("slip: draft tidak bisa ditandai lunas, tapi tanda lunas tetap bisa dibatalkan", async () => {
  const db = createFakeDb({ payslips: [slip({ status: "draft" })] });
  const actions = payslipActions(db, ADMIN, []);
  assert.ok("error" in (await actions.markPayslipPaid("p1", true)));
  assert.equal(db.tables.payslips[0].payment_status, "unpaid");
  assert.equal((await actions.bulkMarkPayslipsPaid(["p1"])).paidCount, 0);

  db.tables.payslips[0].payment_status = "paid"; // dibayar lalu dibuka ulang
  assert.equal((await actions.markPayslipPaid("p1", false)).ok, true);
  assert.equal(db.tables.payslips[0].payment_status, "unpaid");
});

// ─── SM-2: pesanan POS ───────────────────────────────────────────────────────

function pesananActions(db: FakeDb) {
  return load("src/lib/actions/pos-pesanan.actions.ts", {
    ...common(db, ADMIN, []),
    "@supabase/supabase-js": { createClient: () => db },
    "./_gates": { requireAdminOrPosAssignee: async () => ({ ok: true, userId: ADMIN }) },
    "@/lib/cashflow/categories": { POS_CASH_CATEGORY: "POS Cash", POS_QRIS_CATEGORY: "POS QRIS" },
    "@/lib/utils/jakarta": { jakartaDateString: () => "2026-11-09", jakartaHHMM: () => "10:00" },
    "@/lib/pos/stock-restore": { applyStockDeltaIfAbsorbed: async () => {}, restoreStockIfAbsorbedByOpname: async () => {} },
    "@/lib/pos/authorizers": { verifyOperationPin: async () => ({ ok: true, authorizerName: "Spv" }) },
    "@/lib/cake-orders/ready-stock": { releaseReadyCakesForSale: async () => {} },
    "@/lib/cake-orders/ready-cake-sale-payment": {
      loadReadyCakeSaleLines: async () => [],
      recordReadyCakeSalePayments: async () => ({ ok: true }),
      reverseReadyCakeSalePayments: async () => ({ ok: true }),
    },
    "@/lib/pos/sugar-levels": { isSugarLevel: () => true },
    "@/lib/pos/settle-lease": { settleLeaseFreeFilter },
  });
}

const pesanan = (over: Record<string, unknown> = {}) => ({
  id: "s1", bank_account_id: "b1", sale_date: "2026-11-09", sale_time: "09:00", total: 50_000,
  customer_name: "Ani", payment_status: "pending", voided_at: null, settled_at: null,
  created_at: "2026-11-09T02:00:00.000Z", ...over,
});

test("pesanan: pelunasan bersamaan hanya mencatat SATU baris kas", async () => {
  const db = createFakeDb({ pos_sales: [pesanan()], bank_accounts: [{ id: "b1", default_branch: "Pare", ledger_account_id: null }] });
  const actions = pesananActions(db);
  // Perangkat lain menyelesaikan pelunasan tepat setelah perangkat ini membaca "pending".
  db.onRead("pos_sales", () => {
    db.tables.cashflow_transactions = [{ id: "tx-other", credit: 50_000 }];
    Object.assign(db.tables.pos_sales[0], {
      payment_status: "paid", settled_via: "cash", settled_at: new Date().toISOString(), cashflow_transaction_id: "tx-other",
    });
  });
  const res = await actions.settlePesanan({ saleId: "s1", settledVia: "cash" });
  assert.equal(res.ok, false);
  assert.equal(db.tables.cashflow_transactions.length, 1);
  assert.equal(db.tables.pos_sales[0].cashflow_transaction_id, "tx-other");
});

test("pesanan: pelunasan normal tetap jalan dan klaim menjadi waktu lunas", async () => {
  const db = createFakeDb({ pos_sales: [pesanan()], bank_accounts: [{ id: "b1", default_branch: "Pare", ledger_account_id: null }] });
  const res = await pesananActions(db).settlePesanan({ saleId: "s1", settledVia: "qris", qrisVerification: "audio" });
  assert.equal(res.ok, true);
  const sale = db.tables.pos_sales[0];
  assert.equal(sale.payment_status, "paid");
  assert.equal(sale.cashflow_transaction_id, db.tables.cashflow_transactions[0].id);
  assert.equal(db.tables.cashflow_transactions.length, 1);
});

test("pesanan: klaim pelunasan yang masih hidup menolak pelunasan kedua; klaim basi boleh diambil alih", async () => {
  const fresh = new Date(Date.now() - 10_000).toISOString();
  const db = createFakeDb({ pos_sales: [pesanan({ settled_at: fresh })], bank_accounts: [{ id: "b1" }] });
  const actions = pesananActions(db);
  assert.equal((await actions.settlePesanan({ saleId: "s1", settledVia: "cash" })).ok, false);
  assert.equal(db.tables.cashflow_transactions?.length ?? 0, 0);

  db.tables.pos_sales[0].settled_at = new Date(Date.now() - SETTLE_LEASE_MS - 1_000).toISOString();
  assert.equal((await actions.settlePesanan({ saleId: "s1", settledVia: "cash" })).ok, true);
  assert.equal(db.tables.cashflow_transactions.length, 1);
});

test("pesanan: gagal mencatat kas melepas klaim sehingga bisa dicoba ulang", async () => {
  const db = createFakeDb({ pos_sales: [pesanan()], bank_accounts: [{ id: "b1" }] });
  const actions = pesananActions(db);
  db.failOn("cashflow_transactions", "insert", "jaringan putus");
  assert.equal((await actions.settlePesanan({ saleId: "s1", settledVia: "cash" })).ok, false);
  assert.equal(db.tables.pos_sales[0].settled_at, null);
  assert.equal((await actions.settlePesanan({ saleId: "s1", settledVia: "cash" })).ok, true);
});

test("pesanan: pembatalan kalah dari pelunasan yang terjadi bersamaan", async () => {
  const db = createFakeDb({ pos_sales: [pesanan()] });
  const actions = pesananActions(db);
  db.onRead("pos_sales", () => {
    Object.assign(db.tables.pos_sales[0], { payment_status: "paid", settled_at: new Date().toISOString() });
  });
  const res = await actions.cancelPesanan({ saleId: "s1", reason: "batal pesan", pin: "1234" });
  assert.equal(res.ok, false);
  assert.equal(db.tables.pos_sales[0].voided_at, null);
});

// ─── SM-5: terbitkan bonus ───────────────────────────────────────────────────

const runValues = {
  branch: "Pare", period: "2026-10", gross_profit: 10, lk_dasar: 1, p: 0.1, scorecard_multiplier: 1, pool: 5, breakdown: {},
};
const shares = [{ user_id: EMP, hours: 100, share: 5, excluded: false, excluded_reason: null }];

test("bonus: penerbitan kedua ditolak dan bagian tidak ditulis ulang", async () => {
  const db = createFakeDb({});
  assert.equal((await publishBonusRunRows(db, runValues, shares, ADMIN)).ok, true);
  const second = await publishBonusRunRows(db, runValues, shares, ADMIN);
  assert.deepEqual(second, { ok: false, error: "Bonus bulan ini sudah terbit." });
  assert.equal(db.tables.bonus_runs.length, 1);
  assert.equal(db.tables.bonus_runs[0].status, "finalized");
  assert.equal(db.log.filter((l) => l.table === "bonus_run_shares" && l.op === "insert").length, 1);
});

test("bonus: bagian gagal ditulis → run kembali draft dan bisa diterbitkan ulang", async () => {
  const db = createFakeDb({});
  db.failOn("bonus_run_shares", "insert", "constraint");
  assert.deepEqual(await publishBonusRunRows(db, runValues, shares, ADMIN), { ok: false, error: "constraint" });
  assert.equal(db.tables.bonus_runs[0].status, "draft");
  assert.equal((await publishBonusRunRows(db, runValues, shares, ADMIN)).ok, true);
  assert.equal(db.tables.bonus_runs[0].status, "finalized");
  assert.equal(db.tables.bonus_run_shares.length, 1);
});
