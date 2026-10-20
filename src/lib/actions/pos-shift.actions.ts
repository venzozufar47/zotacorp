"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "./_supabase-admin";
import {
  requireAdmin,
  requireAdminOrAssignee,
  requireAdminOrPosAssignee,
  type ActionResult,
} from "./_gates";
import { sendPushToAdmins } from "@/lib/push/web-push";
import { jakartaDateString, jakartaHHMM } from "@/lib/utils/jakarta";
import {
  buildIncidentalReport,
  cashMovementInWindow,
  findOpenShift,
  lastClosedShift,
  listShiftCashiers,
  loadShiftConfig,
  namesByIds,
  verifyShiftCashier,
} from "@/lib/pos/shift-data";
import { incidentalCookieName, incidentalCookieValue } from "@/lib/pos/shift-gate";
import {
  describeCashDiff,
  expectedClosingCash,
  expectedOpeningCash,
  incidentalReportHasContent,
  isCashDiffAlert,
  isNotaCategory,
  netCash,
  sumExpenses,
  type IncidentalReport,
} from "@/lib/pos/shift-math";
import { posBasePathForBranch, type PosBranchName } from "@/lib/pos/branch";

/**
 * Shift kasir POS: Buka shift (PIN kasir + opname + hitung kas) → jual → Tutup shift (PIN kasir yang SAMA +
 * opname + hitung kas). Alur "insidentil" (tanpa shift) hanya menandai sesi lewat cookie; transaksinya
 * tercatat atas akun login dan dilaporkan ke kasir shift berikutnya.
 *
 * Semua tulis memakai service-role (tabel shift terkunci ke admin) SETELAH gerbang akses POS lolos.
 * Hitungan kas "seharusnya" dibuat di server dari data penjualan — angka dari klien tidak pernah dipercaya.
 */

const TMP_BUCKET = "cash-closing-photos";
const RECEIPT_BUCKET = "cashflow-receipts";
const NOTA_TYPES = ["image/jpeg", "image/png", "image/webp"];
const NOTA_MAX_SIZE = 5 * 1024 * 1024;
/** Opname yang dipakai buka/tutup shift harus baru saja dibuat — mencegah memakai ulang opname lama. */
const OPNAME_MAX_AGE_MS = 3 * 3_600_000;
const INCIDENTAL_COOKIE_MAX_AGE_S = 12 * 3600;

export interface ShiftExpenseInput {
  amount: number;
  category: string;
  note: string;
  /** Path nota yang sudah diunggah lewat `uploadShiftNota`. Wajib. */
  photoPath: string;
}

async function requireShiftAccess(
  bankAccountId: string
): Promise<
  | { ok: true; userId: string; branch: string | null; accountName: string }
  | { ok: false; error: string }
> {
  const gate = await requireAdminOrPosAssignee(bankAccountId);
  if (!gate.ok) return { ok: false, error: gate.error };
  const cfg = await loadShiftConfig(createAdminClient(), bankAccountId);
  if (!cfg) return { ok: false, error: "Rekening POS tidak ditemukan" };
  if (!cfg.enabled) return { ok: false, error: "Mode shift belum aktif untuk cabang ini" };
  return { ok: true, userId: gate.userId, branch: cfg.branch, accountName: cfg.accountName };
}

function posUrl(branch: string | null): string {
  return posBasePathForBranch(branch === "Semarang" ? "Semarang" : ("Pare" as PosBranchName));
}

// ─────────────────────────────────────────────────────────────────────
//  Bacaan untuk layar buka/tutup shift
// ─────────────────────────────────────────────────────────────────────

export async function getShiftCashiers(
  bankAccountId: string
): Promise<ActionResult<{ cashiers: Array<{ id: string; name: string; hasPin: boolean }> }>> {
  const access = await requireShiftAccess(bankAccountId);
  if (!access.ok) return { ok: false, error: access.error };
  return { ok: true, data: { cashiers: await listShiftCashiers(createAdminClient(), bankAccountId) } };
}

/** Cek PIN lebih awal supaya PIN salah ketahuan sebelum kasir mengisi opname. */
export async function verifyShiftPin(input: {
  bankAccountId: string;
  cashierId: string;
  pin: string;
}): Promise<ActionResult<{ name: string }>> {
  const access = await requireShiftAccess(input.bankAccountId);
  if (!access.ok) return { ok: false, error: access.error };
  const v = await verifyShiftCashier(createAdminClient(), input.bankAccountId, input.cashierId, input.pin);
  if (!v.ok) return { ok: false, error: v.error };
  return { ok: true, data: { name: v.name } };
}

/** Laporan transaksi di luar shift sejak shift terakhir ditutup, untuk kasir yang akan membuka shift. */
export async function getOpeningBriefing(
  bankAccountId: string
): Promise<ActionResult<{ report: IncidentalReport; hasContent: boolean }>> {
  const access = await requireShiftAccess(bankAccountId);
  if (!access.ok) return { ok: false, error: access.error };
  const admin = createAdminClient();
  const prev = await lastClosedShift(admin, bankAccountId);
  const report = await buildIncidentalReport(admin, bankAccountId, prev?.closedAt ?? null, new Date().toISOString());
  return { ok: true, data: { report, hasContent: incidentalReportHasContent(report) } };
}

/**
 * Kas laci yang seharusnya ada SEBELUM pengeluaran bernota yang baru diinput (hitungan terakhir + gerakan
 * ledger sampai sekarang). Klien mengurangkan nota yang sedang diinput, lalu membandingkannya dengan hitungan
 * fisik — rumus sama dengan `openShift`/`closeShift`, yang tetap menghitung ulang di server saat simpan.
 * null = tidak ada pembanding (shift pertama / shift sebelumnya ditutup paksa).
 */
export async function getShiftCashExpectation(input: {
  bankAccountId: string;
  phase: "open" | "close";
}): Promise<ActionResult<{ base: number | null; since: string | null }>> {
  const access = await requireShiftAccess(input.bankAccountId);
  if (!access.ok) return { ok: false, error: access.error };
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  if (input.phase === "open") {
    const prev = await lastClosedShift(admin, input.bankAccountId);
    if (!prev || prev.closeCashCounted === null) return { ok: true, data: { base: null, since: null } };
    const net = netCash(await cashMovementInWindow(admin, input.bankAccountId, prev.closedAt, nowIso));
    return { ok: true, data: { base: prev.closeCashCounted + net, since: prev.closedAt } };
  }
  const shift = await findOpenShift(admin, input.bankAccountId);
  if (!shift) return { ok: false, error: "Tidak ada shift yang terbuka." };
  const { data: row } = await admin
    .from("pos_shifts")
    .select("opened_at, open_cash_counted")
    .eq("id", shift.id)
    .maybeSingle();
  if (!row) return { ok: false, error: "Tidak ada shift yang terbuka." };
  const net = netCash(await cashMovementInWindow(admin, input.bankAccountId, row.opened_at, nowIso));
  return { ok: true, data: { base: Number(row.open_cash_counted) + net, since: row.opened_at } };
}

// ─────────────────────────────────────────────────────────────────────
//  Sesi insidentil
// ─────────────────────────────────────────────────────────────────────

export async function startIncidentalSession(bankAccountId: string): Promise<ActionResult> {
  const access = await requireShiftAccess(bankAccountId);
  if (!access.ok) return { ok: false, error: access.error };
  if (await findOpenShift(createAdminClient(), bankAccountId)) {
    return { ok: false, error: "Ada shift yang masih terbuka — tutup dulu shift itu." };
  }
  const jar = await cookies();
  jar.set(incidentalCookieName(bankAccountId), incidentalCookieValue(access.userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: INCIDENTAL_COOKIE_MAX_AGE_S,
  });
  revalidatePath("/pos", "layout");
  return { ok: true };
}

export async function exitIncidentalSession(bankAccountId: string): Promise<ActionResult> {
  const gate = await requireAdminOrPosAssignee(bankAccountId);
  if (!gate.ok) return { ok: false, error: gate.error };
  const jar = await cookies();
  jar.delete(incidentalCookieName(bankAccountId));
  revalidatePath("/pos", "layout");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
//  Nota pengeluaran
// ─────────────────────────────────────────────────────────────────────

/** Unggah foto nota ke bucket sementara; dipindah ke lampiran ledger saat shift disimpan. */
export async function uploadShiftNota(formData: FormData): Promise<ActionResult<{ path: string }>> {
  const bankAccountId = formData.get("bankAccountId");
  const file = formData.get("file");
  if (typeof bankAccountId !== "string" || !bankAccountId)
    return { ok: false, error: "bankAccountId wajib" };
  if (!(file instanceof File)) return { ok: false, error: "Foto nota wajib" };
  if (!NOTA_TYPES.includes(file.type)) return { ok: false, error: "Hanya JPG / PNG / WEBP" };
  if (file.size > NOTA_MAX_SIZE) return { ok: false, error: "Foto maksimal 5MB" };
  const access = await requireShiftAccess(bankAccountId);
  if (!access.ok) return { ok: false, error: access.error };

  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${bankAccountId}/shift-tmp/${access.userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await createAdminClient()
    .storage.from(TMP_BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { path } };
}

/** Buang nota sementara yang batal dipakai (best-effort). */
export async function discardShiftNota(input: { bankAccountId: string; path: string }): Promise<ActionResult> {
  const gate = await requireAdminOrPosAssignee(input.bankAccountId);
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!input.path.startsWith(`${input.bankAccountId}/shift-tmp/`)) return { ok: false, error: "Path tidak valid" };
  await createAdminClient().storage.from(TMP_BUCKET).remove([input.path]);
  return { ok: true };
}

type Admin = ReturnType<typeof createAdminClient>;

function validateExpenses(
  bankAccountId: string,
  expenses: ShiftExpenseInput[]
): { ok: true; clean: ShiftExpenseInput[] } | { ok: false; error: string } {
  const clean: ShiftExpenseInput[] = [];
  for (const e of expenses ?? []) {
    const amount = Math.round(Number(e.amount));
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Nominal pengeluaran tidak valid" };
    const note = String(e.note ?? "").trim();
    if (!note) return { ok: false, error: "Keterangan pengeluaran wajib diisi" };
    if (note.length > 200) return { ok: false, error: "Keterangan pengeluaran maksimal 200 karakter" };
    if (!isNotaCategory(e.category)) return { ok: false, error: "Kategori pengeluaran tidak valid" };
    if (!e.photoPath || !e.photoPath.startsWith(`${bankAccountId}/shift-tmp/`))
      return { ok: false, error: "Foto nota wajib untuk setiap pengeluaran" };
    clean.push({ amount, note, category: e.category, photoPath: e.photoPath });
  }
  return { ok: true, clean };
}

interface CreatedExpense {
  expenseId: string;
  txId: string;
  finalPath: string;
  tmpPath: string;
}

/**
 * Setiap pengeluaran bernota → transaksi DEBIT di ledger cashflow rekening kas (lampiran = foto nota) +
 * baris `pos_shift_expenses` (siapa yang memasukkan). Bila satu gagal, semua yang sudah dibuat dibatalkan.
 */
async function recordExpenses(
  admin: Admin,
  p: {
    shiftId: string;
    bankAccountId: string;
    branch: string | null;
    phase: "open" | "close";
    cashierId: string;
    cashierName: string;
    expenses: ShiftExpenseInput[];
  }
): Promise<{ ok: true; created: CreatedExpense[] } | { ok: false; error: string }> {
  const created: CreatedExpense[] = [];
  const rollback = async () => {
    for (const c of created) {
      await admin.from("pos_shift_expenses").delete().eq("id", c.expenseId);
      await admin.from("cashflow_transactions").delete().eq("id", c.txId);
      await admin.storage.from(RECEIPT_BUCKET).remove([c.finalPath]);
    }
  };
  if (p.expenses.length === 0) return { ok: true, created };

  const now = new Date();
  const date = jakartaDateString(now);
  const hhmm = jakartaHHMM(now);
  const [y, m] = date.split("-").map(Number);

  const { data: stmt } = await admin
    .from("cashflow_statements")
    .select("id")
    .eq("bank_account_id", p.bankAccountId)
    .eq("period_year", y)
    .eq("period_month", m)
    .maybeSingle();
  let statementId = stmt?.id ?? null;
  if (!statementId) {
    const { data: ns, error } = await admin
      .from("cashflow_statements")
      .insert({
        bank_account_id: p.bankAccountId,
        period_month: m,
        period_year: y,
        opening_balance: 0,
        closing_balance: 0,
        status: "draft",
        created_by: p.cashierId,
      })
      .select("id")
      .single();
    if (error || !ns) return { ok: false, error: error?.message ?? "Gagal membuat statement kas" };
    statementId = ns.id;
  }

  const { data: maxRow } = await admin
    .from("cashflow_transactions")
    .select("sort_order")
    .eq("statement_id", statementId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  let sort = (maxRow?.sort_order ?? -1) + 1;

  for (const e of p.expenses) {
    const { data: tx, error: txErr } = await admin
      .from("cashflow_transactions")
      .insert({
        statement_id: statementId,
        transaction_date: date,
        transaction_time: hhmm,
        description: `Pengeluaran kas shift (${p.phase === "open" ? "buka" : "tutup"}): ${e.note}`,
        notes: `Diinput oleh ${p.cashierName} · shift ${p.shiftId.slice(0, 8)} — nota terlampir`,
        debit: e.amount,
        credit: 0,
        running_balance: null,
        category: e.category,
        branch: p.branch,
        sort_order: sort++,
      })
      .select("id")
      .single();
    if (txErr || !tx) {
      await rollback();
      return { ok: false, error: txErr?.message ?? "Gagal mencatat pengeluaran ke ledger" };
    }

    // Pindahkan nota dari bucket sementara ke lampiran ledger (path ikut pola uploadCashflowAttachment).
    const { data: blob, error: dlErr } = await admin.storage.from(TMP_BUCKET).download(e.photoPath);
    if (dlErr || !blob) {
      await admin.from("cashflow_transactions").delete().eq("id", tx.id);
      await rollback();
      return { ok: false, error: "Foto nota tidak ditemukan — unggah ulang notanya" };
    }
    const ext = e.photoPath.split(".").pop() ?? "jpg";
    const finalPath = `${p.bankAccountId}/${tx.id}-${Date.now()}.${ext}`;
    const { error: upErr } = await admin.storage
      .from(RECEIPT_BUCKET)
      .upload(finalPath, Buffer.from(await blob.arrayBuffer()), {
        contentType: blob.type || "image/jpeg",
        upsert: true,
      });
    if (upErr) {
      await admin.from("cashflow_transactions").delete().eq("id", tx.id);
      await rollback();
      return { ok: false, error: upErr.message };
    }
    await admin.from("cashflow_transactions").update({ attachment_path: finalPath }).eq("id", tx.id);

    const { data: row, error: rowErr } = await admin
      .from("pos_shift_expenses")
      .insert({
        shift_id: p.shiftId,
        phase: p.phase,
        amount: e.amount,
        category: e.category,
        note: e.note,
        photo_path: finalPath,
        entered_by: p.cashierId,
        cashflow_transaction_id: tx.id,
      })
      .select("id")
      .single();
    if (rowErr || !row) {
      await admin.from("cashflow_transactions").delete().eq("id", tx.id);
      await admin.storage.from(RECEIPT_BUCKET).remove([finalPath]);
      await rollback();
      return { ok: false, error: rowErr?.message ?? "Gagal mencatat pengeluaran" };
    }
    created.push({ expenseId: row.id, txId: tx.id, finalPath, tmpPath: e.photoPath });
  }

  // Semua berhasil: buang berkas sementara.
  await admin.storage.from(TMP_BUCKET).remove(created.map((c) => c.tmpPath));
  return { ok: true, created };
}

/** Opname yang dipakai harus: milik rekening ini, dilakukan kasir ini, baru, dan belum dipakai shift lain. */
async function checkOpname(
  admin: Admin,
  p: { opnameId: string; bankAccountId: string; cashierId: string; notBefore?: string }
): Promise<{ ok: true; createdAt: string } | { ok: false; error: string }> {
  if (!p.opnameId) return { ok: false, error: "Opname stok wajib diisi dulu." };
  const { data: op } = await admin
    .from("pos_stock_opnames")
    .select("id, bank_account_id, performed_by, created_at")
    .eq("id", p.opnameId)
    .maybeSingle();
  if (!op || op.bank_account_id !== p.bankAccountId) return { ok: false, error: "Opname tidak ditemukan." };
  if (op.performed_by !== p.cashierId) return { ok: false, error: "Opname ini bukan dilakukan kasir shift." };
  const age = Date.now() - new Date(op.created_at).getTime();
  if (age > OPNAME_MAX_AGE_MS) return { ok: false, error: "Opname sudah terlalu lama — ulangi opname." };
  if (p.notBefore && new Date(op.created_at) < new Date(p.notBefore))
    return { ok: false, error: "Opname ini dibuat sebelum shift dibuka." };
  const { data: used } = await admin
    .from("pos_shifts")
    .select("id")
    .or(`open_opname_id.eq.${p.opnameId},close_opname_id.eq.${p.opnameId}`)
    .limit(1);
  if (used && used.length > 0) return { ok: false, error: "Opname ini sudah dipakai shift lain." };
  return { ok: true, createdAt: op.created_at };
}

function notifyDiff(args: {
  accountName: string;
  branch: string | null;
  cashierName: string;
  phase: "buka" | "tutup";
  diff: number | null;
}) {
  if (!isCashDiffAlert(args.diff)) return;
  after(async () => {
    try {
      await sendPushToAdmins({
        title: `Selisih kas ${args.phase} shift — ${args.accountName}`,
        body: `${args.cashierName}: ${describeCashDiff(args.diff)}`,
        url: `${posUrl(args.branch)}/shift`,
      });
    } catch (err) {
      console.error("[pos-shift] push selisih gagal", err);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────
//  Buka shift
// ─────────────────────────────────────────────────────────────────────

export async function openShift(input: {
  bankAccountId: string;
  cashierId: string;
  pin: string;
  /** Opname yang baru dibuat di langkah sebelumnya (dilakukan kasir ini). */
  opnameId: string;
  cashCounted: number;
  expenses: ShiftExpenseInput[];
  notes?: string;
}): Promise<ActionResult<{ shiftId: string; diff: number | null }>> {
  const access = await requireShiftAccess(input.bankAccountId);
  if (!access.ok) return { ok: false, error: access.error };
  const admin = createAdminClient();

  const counted = Math.round(Number(input.cashCounted));
  if (!Number.isFinite(counted) || counted < 0) return { ok: false, error: "Hitungan kas tidak valid" };
  const exp = validateExpenses(input.bankAccountId, input.expenses);
  if (!exp.ok) return { ok: false, error: exp.error };

  if (await findOpenShift(admin, input.bankAccountId)) {
    return { ok: false, error: "Sudah ada shift yang terbuka di cabang ini." };
  }
  const cashier = await verifyShiftCashier(admin, input.bankAccountId, input.cashierId, input.pin);
  if (!cashier.ok) return { ok: false, error: cashier.error };
  const opname = await checkOpname(admin, {
    opnameId: input.opnameId,
    bankAccountId: input.bankAccountId,
    cashierId: input.cashierId,
  });
  if (!opname.ok) return { ok: false, error: opname.error };

  const nowIso = new Date().toISOString();
  const prev = await lastClosedShift(admin, input.bankAccountId);
  // Pembanding kas awal hanya ada bila shift sebelumnya punya hitungan (bukan shift pertama / tutup paksa).
  const prevCounted = prev?.closeCashCounted ?? null;
  const expected =
    prev && prevCounted !== null
      ? expectedOpeningCash(
          prevCounted,
          netCash(await cashMovementInWindow(admin, input.bankAccountId, prev.closedAt, nowIso)),
          sumExpenses(exp.clean)
        )
      : null;
  // Laporan = yang dilihat kasir sebelum opname, jadi berhenti di saat opname dibuat.
  const report = await buildIncidentalReport(admin, input.bankAccountId, prev?.closedAt ?? null, opname.createdAt);

  const { data: shift, error } = await admin
    .from("pos_shifts")
    .insert({
      bank_account_id: input.bankAccountId,
      cashier_id: input.cashierId,
      opened_by_user: access.userId,
      opened_at: nowIso,
      open_opname_id: input.opnameId,
      open_cash_counted: counted,
      open_cash_expected: expected,
      open_notes: input.notes?.trim() || null,
      incidental_report: report as never,
    })
    .select("id, open_cash_diff")
    .single();
  if (error || !shift) {
    // Unique index "satu shift terbuka per rekening": dua perangkat menekan serentak.
    return {
      ok: false,
      error: error?.code === "23505" ? "Sudah ada shift yang terbuka di cabang ini." : (error?.message ?? "Gagal membuka shift"),
    };
  }

  const rec = await recordExpenses(admin, {
    shiftId: shift.id,
    bankAccountId: input.bankAccountId,
    branch: access.branch,
    phase: "open",
    cashierId: input.cashierId,
    cashierName: cashier.name,
    expenses: exp.clean,
  });
  if (!rec.ok) {
    await admin.from("pos_shifts").delete().eq("id", shift.id);
    return { ok: false, error: rec.error };
  }

  const jar = await cookies();
  jar.delete(incidentalCookieName(input.bankAccountId));
  const diff = shift.open_cash_diff === null ? null : Number(shift.open_cash_diff);
  notifyDiff({ accountName: access.accountName, branch: access.branch, cashierName: cashier.name, phase: "buka", diff });
  revalidatePath("/pos", "layout");
  revalidatePath("/admin/finance", "layout");
  return { ok: true, data: { shiftId: shift.id, diff } };
}

// ─────────────────────────────────────────────────────────────────────
//  Tutup shift
// ─────────────────────────────────────────────────────────────────────

export async function closeShift(input: {
  bankAccountId: string;
  /** PIN kasir yang membuka shift — penutup HARUS orang yang sama. */
  pin: string;
  opnameId: string;
  cashCounted: number;
  expenses: ShiftExpenseInput[];
  notes?: string;
}): Promise<ActionResult<{ diff: number | null; expected: number }>> {
  const access = await requireShiftAccess(input.bankAccountId);
  if (!access.ok) return { ok: false, error: access.error };
  const admin = createAdminClient();

  const counted = Math.round(Number(input.cashCounted));
  if (!Number.isFinite(counted) || counted < 0) return { ok: false, error: "Hitungan kas tidak valid" };
  const exp = validateExpenses(input.bankAccountId, input.expenses);
  if (!exp.ok) return { ok: false, error: exp.error };

  const { data: shift } = await admin
    .from("pos_shifts")
    .select("id, cashier_id, opened_at, open_cash_counted")
    .eq("bank_account_id", input.bankAccountId)
    .eq("status", "open")
    .maybeSingle();
  if (!shift) return { ok: false, error: "Tidak ada shift yang terbuka." };

  const cashier = await verifyShiftCashier(admin, input.bankAccountId, shift.cashier_id, input.pin);
  if (!cashier.ok) return { ok: false, error: cashier.error };
  const opname = await checkOpname(admin, {
    opnameId: input.opnameId,
    bankAccountId: input.bankAccountId,
    cashierId: shift.cashier_id,
    notBefore: shift.opened_at,
  });
  if (!opname.ok) return { ok: false, error: opname.error };

  const nowIso = new Date().toISOString();
  const movement = await cashMovementInWindow(admin, input.bankAccountId, shift.opened_at, nowIso);
  const expected = expectedClosingCash(Number(shift.open_cash_counted), netCash(movement), sumExpenses(exp.clean));

  const rec = await recordExpenses(admin, {
    shiftId: shift.id,
    bankAccountId: input.bankAccountId,
    branch: access.branch,
    phase: "close",
    cashierId: shift.cashier_id,
    cashierName: cashier.name,
    expenses: exp.clean,
  });
  if (!rec.ok) return { ok: false, error: rec.error };

  const { data: closed, error } = await admin
    .from("pos_shifts")
    .update({
      status: "closed",
      closed_at: nowIso,
      closed_by_user: access.userId,
      close_opname_id: input.opnameId,
      close_cash_counted: counted,
      close_cash_expected: expected,
      close_notes: input.notes?.trim() || null,
    })
    .eq("id", shift.id)
    .eq("status", "open")
    .select("close_cash_diff")
    .maybeSingle();
  if (error || !closed) {
    // Ditutup oleh perangkat lain di saat yang sama, atau gagal tulis: batalkan pengeluaran yang baru dibuat.
    for (const c of rec.created) {
      await admin.from("pos_shift_expenses").delete().eq("id", c.expenseId);
      await admin.from("cashflow_transactions").delete().eq("id", c.txId);
      await admin.storage.from(RECEIPT_BUCKET).remove([c.finalPath]);
    }
    return { ok: false, error: error?.message ?? "Shift sudah ditutup di perangkat lain." };
  }

  const diff = closed.close_cash_diff === null ? null : Number(closed.close_cash_diff);
  notifyDiff({ accountName: access.accountName, branch: access.branch, cashierName: cashier.name, phase: "tutup", diff });
  const jar = await cookies();
  jar.delete(incidentalCookieName(input.bankAccountId));
  revalidatePath("/pos", "layout");
  revalidatePath("/admin/finance", "layout");
  return { ok: true, data: { diff, expected } };
}

/**
 * Tutup paksa (admin): kasir lupa menutup. Tidak ada hitungan kas/opname — shift ditandai ditutup paksa dan
 * shift berikutnya tidak punya pembanding kas awal (tidak ada angka yang bisa dipercaya).
 */
export async function forceCloseShift(input: {
  bankAccountId: string;
  reason?: string;
}): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, error: admin.error };
  const db = createAdminClient();
  const { data, error } = await db
    .from("pos_shifts")
    .update({
      status: "closed",
      closed_at: new Date().toISOString(),
      closed_by_user: admin.userId,
      forced_by: admin.userId,
      force_reason: input.reason?.trim() || null,
    })
    .eq("bank_account_id", input.bankAccountId)
    .eq("status", "open")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Tidak ada shift yang terbuka." };
  revalidatePath("/pos", "layout");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
//  Riwayat shift (admin & assignee penuh)
// ─────────────────────────────────────────────────────────────────────

export interface ShiftHistoryRow {
  id: string;
  status: "open" | "closed";
  cashierName: string;
  openedAt: string;
  closedAt: string | null;
  openDiff: number | null;
  closeDiff: number | null;
  forced: boolean;
  forceReason: string | null;
  expensesCount: number;
  expensesTotal: number;
}

export async function listRecentShifts(
  bankAccountId: string,
  limit = 15
): Promise<ShiftHistoryRow[]> {
  const gate = await requireAdminOrAssignee(bankAccountId);
  if (!gate.ok) return [];
  const db = createAdminClient();
  const { data } = await db
    .from("pos_shifts")
    .select("id, status, cashier_id, opened_at, closed_at, open_cash_diff, close_cash_diff, forced_by, force_reason")
    .eq("bank_account_id", bankAccountId)
    .order("opened_at", { ascending: false })
    .limit(limit);
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const [names, { data: expenses }] = await Promise.all([
    namesByIds(db, rows.map((r) => r.cashier_id)),
    db.from("pos_shift_expenses").select("shift_id, amount").in("shift_id", rows.map((r) => r.id)),
  ]);
  const byShift = new Map<string, { count: number; total: number }>();
  for (const e of expenses ?? []) {
    const cur = byShift.get(e.shift_id) ?? { count: 0, total: 0 };
    cur.count += 1;
    cur.total += Number(e.amount);
    byShift.set(e.shift_id, cur);
  }
  return rows.map((r) => ({
    id: r.id,
    status: r.status as "open" | "closed",
    cashierName: names.get(r.cashier_id) ?? "Kasir",
    openedAt: r.opened_at,
    closedAt: r.closed_at,
    openDiff: r.open_cash_diff === null ? null : Number(r.open_cash_diff),
    closeDiff: r.close_cash_diff === null ? null : Number(r.close_cash_diff),
    forced: !!r.forced_by,
    forceReason: r.force_reason,
    expensesCount: byShift.get(r.id)?.count ?? 0,
    expensesTotal: byShift.get(r.id)?.total ?? 0,
  }));
}
