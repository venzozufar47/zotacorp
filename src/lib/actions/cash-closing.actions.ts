"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "./_supabase-admin";
import { requireAdminOrPosAssignee } from "./_gates";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { findPosAccount } from "./pos.actions";
import { jakartaDateString, jakartaDateMinusDays } from "@/lib/utils/jakarta";
import { sendPushToAdmins } from "@/lib/push/web-push";

/**
 * Tutup Kas Harian (PRD-1) — "Formulir A" digital, Dokumen 4 §2.1.
 *
 * Alur: staf A isi `submitCashClosing` (status → pending_verification),
 * staf B BERBEDA (atau admin) membuka `getCashClosingSnapshot` lalu
 * memanggil `verifyCashClosing`. Angka POS (cash_pos/qris_pos/void) tidak
 * pernah diinput manual — dibekukan dari `pos_sales` saat submit, supaya
 * selisih yang muncul murni selisih kas, bukan salah ketik ulang angka
 * yang sebenarnya sudah ada di sistem.
 *
 * Tabel baru belum ada di `Database` generated type, jadi semua query ke
 * `cash_closings` / `cash_closing_petty_expenses` memakai `as never` +
 * cast manual — pola yang sama dipakai modul baru lain sebelum types
 * di-generate ulang (lihat `cake_finance_admins`, `studio_heads` di
 * `_gates.ts`).
 */

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * `cash_closings` / `cash_closing_petty_expenses` belum ada di generated
 * `Database` type (types.ts belum di-regenerate sejak migrasi 195) — sama
 * situasi dengan `team_members` di `team.actions.ts`, pola yang sama
 * dipakai di sini: cast admin client ke `any` KHUSUS untuk dua tabel baru
 * ini. Tabel lain (`profiles`, `bank_accounts`, `pos_sales`) tetap lewat
 * `createAdminClient()` biasa supaya type-safety-nya tidak ikut hilang.
 */
function db(): any {
  return createAdminClient();
}

const PHOTO_BUCKET = "cash-closing-photos";
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

/** Selisih ≥ ini langsung kode merah ke Owner, berapa pun riwayatnya. */
const DIFF_ALERT_THRESHOLD = 50_000;
/** Selisih (berapa pun nilainya) yang terjadi sebanyak ini dalam jendela
 *  hari di bawah juga kode merah — pola berulang, bukan cuma nominal besar. */
const DIFF_STREAK_ALERT_COUNT = 3;
const DIFF_STREAK_WINDOW_DAYS = 30;

export type CashClosingBranch = "Pare" | "Semarang";

interface CashClosingRow {
  id: string;
  bank_account_id: string;
  closing_date: string;
  cash_pos: number;
  qris_pos: number;
  void_count: number;
  void_total: number;
  cash_physical: number;
  cash_diff: number;
  qris_received: number;
  petty_cash_opening: number;
  petty_cash_closing: number;
  token_kwh_remaining: number | null;
  token_photo_path: string | null;
  notes: string | null;
  status: "pending_verification" | "verified";
  counted_by: string;
  counted_at: string;
  verified_by: string | null;
  verified_at: string | null;
}

interface PettyExpenseRowDb {
  id: string;
  closing_id: string;
  amount: number;
  note: string | null;
  photo_path: string | null;
}

export interface PettyExpenseInput {
  amount: number;
  note: string | null;
}

export interface PettyExpenseView {
  id: string;
  amount: number;
  note: string | null;
  photoPath: string | null;
  photoUrl: string | null;
}

export interface CashClosingSnapshot {
  branch: CashClosingBranch;
  bankAccountId: string;
  closingDate: string;
  /** null = belum ada baris tersimpan hari ini — angka POS dihitung live. */
  id: string | null;
  status: "pending_verification" | "verified" | "not_started";
  cashPos: number;
  qrisPos: number;
  voidCount: number;
  voidTotal: number;
  cashPhysical: number | null;
  cashDiff: number | null;
  qrisReceived: number | null;
  pettyCashOpening: number | null;
  pettyCashClosing: number | null;
  tokenKwhRemaining: number | null;
  tokenPhotoPath: string | null;
  tokenPhotoUrl: string | null;
  notes: string | null;
  countedBy: string | null;
  countedByName: string | null;
  countedAt: string | null;
  verifiedBy: string | null;
  verifiedByName: string | null;
  verifiedAt: string | null;
  /** User login saat ini — klien pakai ini untuk tahu "saya penghitung" vs "saya boleh verifikasi". */
  currentUserId: string;
  pettyExpenses: PettyExpenseView[];
}

export interface CashClosingBranchStatus {
  branch: CashClosingBranch;
  status: "not_started" | "pending_verification" | "verified";
  cashDiff: number | null;
  /** Current user adalah penghitungnya — tidak bisa verifikasi barisnya sendiri. */
  isCounter: boolean;
}

/**
 * Agregat `pos_sales` SATU HARI untuk satu rekening. Tanpa paginasi —
 * beda dari agregat bulanan di `admin-home.actions.ts` yang memang perlu
 * itu: volume harian satu cabang jauh di bawah 1000 baris (puncak ±5
 * transaksi/jam, lihat Dokumen 4 §1).
 */
async function sumPosForDate(
  bankAccountId: string,
  dateIso: string
): Promise<{ cashPos: number; qrisPos: number; voidCount: number; voidTotal: number }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("pos_sales")
    .select("total, payment_method, payment_status, voided_at")
    .eq("bank_account_id", bankAccountId)
    .eq("sale_date", dateIso);

  let cashPos = 0;
  let qrisPos = 0;
  let voidCount = 0;
  let voidTotal = 0;
  for (const s of data ?? []) {
    if (s.voided_at) {
      voidCount += 1;
      voidTotal += s.total;
      continue;
    }
    if (s.payment_status !== "paid") continue;
    if (s.payment_method === "cash") cashPos += s.total;
    else if (s.payment_method === "qris") qrisPos += s.total;
  }
  return { cashPos, qrisPos, voidCount, voidTotal };
}

async function signPhoto(path: string | null): Promise<string | null> {
  if (!path) return null;
  const admin = createAdminClient();
  const { data } = await admin.storage.from(PHOTO_BUCKET).createSignedUrl(path, 1800);
  return data?.signedUrl ?? null;
}

async function namesFor(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("id, full_name").in("id", unique);
  return new Map((data ?? []).map((p) => [p.id, p.full_name]));
}

/**
 * Snapshot hari ini untuk satu cabang: baris tersimpan (kalau sudah ada
 * yang submit) atau angka POS live (kalau form masih kosong). Dipanggil
 * dari halaman `/tutup-kas/[branch]` DAN dari dialog verifikasi.
 */
export async function getCashClosingSnapshot(
  branch: CashClosingBranch
): Promise<ActionResult<CashClosingSnapshot>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const account = await findPosAccount(branch);
  if (!account) return { ok: false, error: "Rekening kas cabang ini tidak ditemukan" };
  const gate = await requireAdminOrPosAssignee(account.id);
  if (!gate.ok) return { ok: false, error: gate.error };

  const date = jakartaDateString(new Date());
  const { data: rowData } = await db()
    .from("cash_closings")
    .select("*")
    .eq("bank_account_id", account.id)
    .eq("closing_date", date)
    .maybeSingle();
  const row = rowData as unknown as CashClosingRow | null;

  if (!row) {
    const snap = await sumPosForDate(account.id, date);
    return {
      ok: true,
      data: {
        branch,
        bankAccountId: account.id,
        closingDate: date,
        id: null,
        status: "not_started",
        cashPos: snap.cashPos,
        qrisPos: snap.qrisPos,
        voidCount: snap.voidCount,
        voidTotal: snap.voidTotal,
        cashPhysical: null,
        cashDiff: null,
        qrisReceived: null,
        pettyCashOpening: null,
        pettyCashClosing: null,
        tokenKwhRemaining: null,
        tokenPhotoPath: null,
        tokenPhotoUrl: null,
        notes: null,
        countedBy: null,
        countedByName: null,
        countedAt: null,
        verifiedBy: null,
        verifiedByName: null,
        verifiedAt: null,
        currentUserId: user.id,
        pettyExpenses: [],
      },
    };
  }

  const { data: expensesData } = await db()
    .from("cash_closing_petty_expenses")
    .select("*")
    .eq("closing_id", row.id)
    .order("created_at", { ascending: true });
  const expenses = (expensesData ?? []) as unknown as PettyExpenseRowDb[];

  const [names, tokenPhotoUrl, pettyPhotoUrls] = await Promise.all([
    namesFor([row.counted_by, row.verified_by ?? ""]),
    signPhoto(row.token_photo_path),
    Promise.all(expenses.map((e) => signPhoto(e.photo_path))),
  ]);

  return {
    ok: true,
    data: {
      branch,
      bankAccountId: account.id,
      closingDate: date,
      id: row.id,
      status: row.status,
      cashPos: row.cash_pos,
      qrisPos: row.qris_pos,
      voidCount: row.void_count,
      voidTotal: row.void_total,
      cashPhysical: row.cash_physical,
      cashDiff: row.cash_diff,
      qrisReceived: row.qris_received,
      pettyCashOpening: row.petty_cash_opening,
      pettyCashClosing: row.petty_cash_closing,
      tokenKwhRemaining: row.token_kwh_remaining,
      tokenPhotoPath: row.token_photo_path,
      tokenPhotoUrl,
      notes: row.notes,
      countedBy: row.counted_by,
      countedByName: names.get(row.counted_by) ?? null,
      countedAt: row.counted_at,
      verifiedBy: row.verified_by,
      verifiedByName: row.verified_by ? names.get(row.verified_by) ?? null : null,
      verifiedAt: row.verified_at,
      currentUserId: user.id,
      pettyExpenses: expenses.map((e, i) => ({
        id: e.id,
        amount: e.amount,
        note: e.note,
        photoPath: e.photo_path,
        photoUrl: pettyPhotoUrls[i] ?? null,
      })),
    },
  };
}

export interface SubmitCashClosingInput {
  branch: CashClosingBranch;
  cashPhysical: number;
  qrisReceived: number;
  pettyCashOpening: number;
  pettyCashClosing: number;
  tokenKwhRemaining: number | null;
  notes: string | null;
  pettyExpenses: PettyExpenseInput[];
}

/**
 * Submit / re-submit (sebelum diverifikasi) tutup kas hari ini. Re-submit
 * membuang baris pengeluaran kas kecil lama (+ foto) dan menulis ulang
 * dari form — lebih sederhana dan aman daripada mencocokkan baris mana
 * yang berubah.
 */
export async function submitCashClosing(
  input: SubmitCashClosingInput
): Promise<ActionResult<{ closingId: string; pettyExpenseIds: string[] }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const account = await findPosAccount(input.branch);
  if (!account) return { ok: false, error: "Rekening kas cabang ini tidak ditemukan" };
  const gate = await requireAdminOrPosAssignee(account.id);
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!Number.isFinite(input.cashPhysical) || input.cashPhysical < 0)
    return { ok: false, error: "Tunai fisik tidak valid" };
  if (!Number.isFinite(input.qrisReceived) || input.qrisReceived < 0)
    return { ok: false, error: "QRIS masuk tidak valid" };
  for (const pe of input.pettyExpenses) {
    if (!Number.isFinite(pe.amount) || pe.amount <= 0)
      return { ok: false, error: "Nominal pengeluaran kas kecil tidak valid" };
  }

  const date = jakartaDateString(new Date());
  const admin = createAdminClient();

  const { data: existingData } = await db()
    .from("cash_closings")
    .select("id, status")
    .eq("bank_account_id", account.id)
    .eq("closing_date", date)
    .maybeSingle();
  const existing = existingData as unknown as { id: string; status: string } | null;
  if (existing?.status === "verified") {
    return { ok: false, error: "Tutup kas hari ini sudah diverifikasi dan terkunci." };
  }

  const snap = await sumPosForDate(account.id, date);
  const nowIso = new Date().toISOString();
  const payload = {
    bank_account_id: account.id,
    closing_date: date,
    cash_pos: snap.cashPos,
    qris_pos: snap.qrisPos,
    void_count: snap.voidCount,
    void_total: snap.voidTotal,
    cash_physical: input.cashPhysical,
    qris_received: input.qrisReceived,
    petty_cash_opening: input.pettyCashOpening,
    petty_cash_closing: input.pettyCashClosing,
    token_kwh_remaining: input.tokenKwhRemaining,
    notes: input.notes,
    counted_by: user.id,
    counted_at: nowIso,
    status: "pending_verification" as const,
    updated_at: nowIso,
  };

  let closingId: string;
  if (existing) {
    const { error } = await db()
      .from("cash_closings")
      .update(payload)
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
    closingId = existing.id;

    const { data: oldExpensesData } = await db()
      .from("cash_closing_petty_expenses")
      .select("photo_path")
      .eq("closing_id", closingId);
    const oldPaths = ((oldExpensesData ?? []) as unknown as { photo_path: string | null }[])
      .map((e) => e.photo_path)
      .filter((p): p is string => !!p);
    if (oldPaths.length) await admin.storage.from(PHOTO_BUCKET).remove(oldPaths);
    await db().from("cash_closing_petty_expenses").delete().eq("closing_id", closingId);
  } else {
    const { data: inserted, error } = await db()
      .from("cash_closings")
      .insert(payload)
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    closingId = (inserted as unknown as { id: string }).id;
  }

  const pettyExpenseIds: string[] = [];
  if (input.pettyExpenses.length > 0) {
    // Insert SATU PER SATU (bukan batch) supaya urutan id yang dikembalikan
    // dijamin sama dengan urutan input — klien menautkan foto ke baris lewat
    // index array ini, dan batch insert tidak menjamin urutan balikan sama
    // dengan urutan payload di semua driver Postgres.
    for (const pe of input.pettyExpenses) {
      const { data: insertedPe, error: peErr } = await db()
        .from("cash_closing_petty_expenses")
        .insert({ closing_id: closingId, amount: pe.amount, note: pe.note, created_by: user.id })
        .select("id")
        .single();
      if (peErr) return { ok: false, error: peErr.message };
      pettyExpenseIds.push((insertedPe as unknown as { id: string }).id);
    }
  }

  revalidatePath(`/tutup-kas/${input.branch.toLowerCase()}`);
  revalidatePath("/dashboard");
  return { ok: true, data: { closingId, pettyExpenseIds } };
}

/**
 * Upload foto token meteran atau nota pengeluaran kas kecil. Dua langkah
 * (baris dulu, lalu foto) seperti `uploadCashflowAttachment` — bukan
 * sekali jalan — supaya baris selalu punya id sebelum foto ditaut.
 */
export async function uploadCashClosingPhoto(
  formData: FormData
): Promise<ActionResult<{ path: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const kind = formData.get("kind");
  const closingId = formData.get("closingId");
  const pettyExpenseId = formData.get("pettyExpenseId");
  const file = formData.get("file");
  if (kind !== "token" && kind !== "petty")
    return { ok: false, error: "kind tidak valid" };
  if (typeof closingId !== "string" || !closingId)
    return { ok: false, error: "closingId wajib" };
  if (!(file instanceof File)) return { ok: false, error: "File wajib" };
  if (!ALLOWED_TYPES.includes(file.type)) return { ok: false, error: "Hanya JPG / PNG / WEBP" };
  if (file.size > MAX_SIZE) return { ok: false, error: "File maksimal 5MB" };

  const admin = createAdminClient();
  const { data: closingData } = await db()
    .from("cash_closings")
    .select("id, bank_account_id, status, token_photo_path")
    .eq("id", closingId)
    .maybeSingle();
  const closing = closingData as unknown as
    | { id: string; bank_account_id: string; status: string; token_photo_path: string | null }
    | null;
  if (!closing) return { ok: false, error: "Tutup kas tidak ditemukan" };
  if (closing.status === "verified")
    return { ok: false, error: "Sudah diverifikasi, tidak bisa diubah" };
  const gate = await requireAdminOrPosAssignee(closing.bank_account_id);
  if (!gate.ok) return { ok: false, error: gate.error };

  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${closing.bank_account_id}/${closingId}-${kind}-${Date.now()}.${ext || "jpg"}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from(PHOTO_BUCKET)
    .upload(path, buffer, { contentType: file.type });
  if (upErr) return { ok: false, error: upErr.message };

  if (kind === "token") {
    if (closing.token_photo_path)
      await admin.storage.from(PHOTO_BUCKET).remove([closing.token_photo_path]);
    const { error } = await db()
      .from("cash_closings")
      .update({ token_photo_path: path })
      .eq("id", closingId);
    if (error) {
      await admin.storage.from(PHOTO_BUCKET).remove([path]);
      return { ok: false, error: error.message };
    }
  } else {
    if (typeof pettyExpenseId !== "string" || !pettyExpenseId) {
      await admin.storage.from(PHOTO_BUCKET).remove([path]);
      return { ok: false, error: "pettyExpenseId wajib" };
    }
    const { error } = await db()
      .from("cash_closing_petty_expenses")
      .update({ photo_path: path })
      .eq("id", pettyExpenseId)
      .eq("closing_id", closingId);
    if (error) {
      await admin.storage.from(PHOTO_BUCKET).remove([path]);
      return { ok: false, error: error.message };
    }
  }

  return { ok: true, data: { path } };
}

/**
 * Verifikasi tutup kas — WAJIB orang berbeda dari yang submit, kecuali
 * admin (jalan keluar saat cabang hanya diisi satu orang hari itu).
 * Memicu kode merah ke semua admin bila selisih besar atau berulang.
 */
export async function verifyCashClosing(
  closingId: string
): Promise<ActionResult<{ alerted: boolean }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const role = await getCurrentRole();
  const admin = createAdminClient();

  const { data: closingData } = await db()
    .from("cash_closings")
    .select("id, bank_account_id, closing_date, status, counted_by, cash_diff")
    .eq("id", closingId)
    .maybeSingle();
  const row = closingData as unknown as
    | {
        id: string;
        bank_account_id: string;
        closing_date: string;
        status: string;
        counted_by: string;
        cash_diff: number;
      }
    | null;
  if (!row) return { ok: false, error: "Tutup kas tidak ditemukan" };
  if (row.status === "verified") return { ok: false, error: "Sudah diverifikasi" };

  const gate = await requireAdminOrPosAssignee(row.bank_account_id);
  if (!gate.ok) return { ok: false, error: gate.error };
  if (role !== "admin" && user.id === row.counted_by) {
    return {
      ok: false,
      error:
        "Verifikasi harus orang berbeda dari yang menghitung. Minta rekan lain memverifikasi, atau minta admin.",
    };
  }

  const nowIso = new Date().toISOString();
  const { error } = await db()
    .from("cash_closings")
    .update({ status: "verified", verified_by: user.id, verified_at: nowIso, updated_at: nowIso })
    .eq("id", closingId);
  if (error) return { ok: false, error: error.message };

  const bigDiff = Math.abs(row.cash_diff) >= DIFF_ALERT_THRESHOLD;
  let streakHit = false;
  if (row.cash_diff !== 0) {
    const since = jakartaDateMinusDays(row.closing_date, DIFF_STREAK_WINDOW_DAYS);
    const { data: recentData } = await db()
      .from("cash_closings")
      .select("id, cash_diff")
      .eq("bank_account_id", row.bank_account_id)
      .neq("id", row.id)
      .gte("closing_date", since)
      .lte("closing_date", row.closing_date);
    const recent = (recentData ?? []) as unknown as { id: string; cash_diff: number }[];
    const occurrences = 1 + recent.filter((r) => r.cash_diff !== 0).length;
    streakHit = occurrences >= DIFF_STREAK_ALERT_COUNT;
  }

  let alerted = false;
  if (bigDiff || streakHit) {
    const { data: account } = await admin
      .from("bank_accounts")
      .select("default_branch")
      .eq("id", row.bank_account_id)
      .maybeSingle();
    const branchLabel = account?.default_branch ?? "cabang";
    const reason = bigDiff
      ? `selisih Rp${Math.abs(row.cash_diff).toLocaleString("id-ID")}`
      : `selisih berulang ${DIFF_STREAK_ALERT_COUNT}x dalam ${DIFF_STREAK_WINDOW_DAYS} hari`;
    await sendPushToAdmins({
      title: `Kode merah — selisih kas ${branchLabel}`,
      body: `Tutup kas ${row.closing_date}: ${reason}.`,
      url: `/tutup-kas/${String(branchLabel).toLowerCase()}`,
    });
    alerted = true;
  }

  revalidatePath("/tutup-kas", "layout");
  revalidatePath("/dashboard");
  return { ok: true, data: { alerted } };
}

/**
 * Status hari ini untuk tiap cabang yang boleh diakses user login —
 * dipakai kartu ringkasan di dashboard karyawan.
 */
export async function getMyCashClosingBranchStatuses(): Promise<CashClosingBranchStatus[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const role = await getCurrentRole();
  const date = jakartaDateString(new Date());
  const branches: CashClosingBranch[] = ["Pare", "Semarang"];

  const results: CashClosingBranchStatus[] = [];
  for (const branch of branches) {
    const account = await findPosAccount(branch);
    if (!account) continue;
    if (role !== "admin") {
      const gate = await requireAdminOrPosAssignee(account.id);
      if (!gate.ok) continue;
    }
    const { data: rowData } = await db()
      .from("cash_closings")
      .select("status, cash_diff, counted_by")
      .eq("bank_account_id", account.id)
      .eq("closing_date", date)
      .maybeSingle();
    const row = rowData as unknown as
      | { status: "pending_verification" | "verified"; cash_diff: number; counted_by: string }
      | null;
    results.push({
      branch,
      status: row?.status ?? "not_started",
      cashDiff: row?.cash_diff ?? null,
      isCounter: row?.counted_by === user.id,
    });
  }
  return results;
}
