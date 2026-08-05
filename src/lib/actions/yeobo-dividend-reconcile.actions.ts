"use server";

/**
 * Rekonsiliasi dividen: konsol vs rekening koran.
 *
 * LATAR BELAKANG
 * Ada dua catatan untuk satu peristiwa yang sama, dan tidak ada kode yang
 * menghubungkannya:
 *
 *   - Konsol (`yeobo_dividend_allocations`) — keputusan pembagian. Sumber
 *     angkanya operating profit per cabang + kas bergulir dari bulan yang
 *     dividennya tidak dibagi penuh. Ini yang benar secara bisnis.
 *   - Ledger (`cashflow_transactions` kategori "Dividend") — uang yang
 *     benar-benar keluar dari bank.
 *
 * Yang menyambungkan keduanya cuma admin: menghitung di konsol, lalu
 * mentransfer. Selama teliti angkanya berdekatan; begitu meleset, tidak
 * ada apa pun yang mengoreksi. Modul ini tidak mencoba menyambungkan
 * keduanya secara otomatis — itu justru berbahaya, karena ledger harus
 * tetap cermin rekening koran apa adanya. Tugasnya hanya MENAMPAKKAN
 * selisihnya.
 *
 * ARAH SELISIH ITU DIKETAHUI
 * Nominal yang mendarat di bank bisa LEBIH BESAR dari keputusan konsol,
 * karena biaya transfer ikut terbawa. Jadi:
 *
 *     ledger − konsol  =  biaya transfer  ≥  0
 *
 * Itu membuat pemeriksaannya satu arah dan jauh lebih tajam daripada
 * sekadar "beda > sekian":
 *   - selisih NEGATIF  → anomali; ada yang kurang ditransfer atau alokasi
 *                        belum tercatat.
 *   - selisih POSITIF wajar → biaya transfer, tampilkan nominalnya.
 *   - selisih POSITIF kelewat besar → anomali (mis. dua bulan menumpuk di
 *                        satu bucket, atau baris ganda).
 *
 * CAKUPAN
 * Mulai Mei 2026. Sebelum itu baris Dividend di PnL tidak dibaca dari
 * ledger sama sekali: Jan–Apr 2026 diganti `YEOBO_DIVIDEND_OVERRIDE` dan
 * sebelum 2026 diganti hardcode penuh. Membandingkannya hanya akan
 * menghasilkan alarm palsu.
 */

import { createAdminClient } from "./_supabase-admin";
import { requireAdmin, type ActionResult } from "./_gates";
import { expandBranchAllSplits } from "@/lib/cashflow/branch-split";

const BU = "Yeobo Space";
const PHYSICAL_BRANCHES = ["Tlogosari", "Tembalang", "Jebres"] as const;

/** Bulan pertama yang baris Dividend-nya benar-benar dibaca dari ledger. */
const START = { year: 2026, month: 5 };

/**
 * Batas atas biaya transfer yang dianggap wajar, per penerima.
 *
 * Angka awal, sengaja longgar. Transfer dilakukan borongan lewat Flip
 * (counterparty "FLIPTECH LENTERA INS"), jadi biaya sebenarnya per KIRIMAN
 * bukan per penerima — memakai jumlah penerima sebagai pengali membuat
 * batasnya pasti kelewat longgar, bukan kelewat ketat. Itu disengaja:
 * panel ini justru ada untuk memperlihatkan berapa biaya nyatanya, baru
 * setelah itu angka ini bisa dikencangkan.
 */
const MAX_FEE_PER_RECIPIENT = 10_000;

export type ReconcileStatus =
  | "cocok"
  | "biaya-transfer"
  | "ledger-kurang"
  | "selisih-besar"
  | "belum-ditransfer"
  | "tanpa-keputusan"
  | "kosong";

export interface ReconcileBranch {
  branch: string;
  /** Σ alokasi tersimpan di konsol. */
  consoleTotal: number;
  /** Σ baris Dividend ledger, setelah sentinel cabang di-split. */
  ledgerTotal: number;
  /** ledger − konsol. Positif = kemungkinan biaya transfer. */
  diff: number;
  recipientCount: number;
  status: ReconcileStatus;
}

export interface ReconcileLedgerRow {
  id: string;
  date: string;
  /** Bucket yang dipakai PnL (periode efektif, atau tanggal transaksi). */
  bucket: string;
  /** true = bucket jatuh ke tanggal transaksi karena periode efektif kosong. */
  bucketFromTxDate: boolean;
  branchTag: string | null;
  amount: number;
  description: string;
}

export interface ReconcilePeriod {
  year: number;
  month: number;
  branches: ReconcileBranch[];
  consoleTotal: number;
  ledgerTotal: number;
  diff: number;
  status: ReconcileStatus;
  /** Baris ledger mentah (sebelum split) yang jatuh di bucket ini. */
  ledgerRows: ReconcileLedgerRow[];
}

const ymRank = (y: number, m: number) => y * 100 + m;
const ymKey = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;

function classify(
  consoleTotal: number,
  ledgerTotal: number,
  recipientCount: number
): ReconcileStatus {
  const hasConsole = Math.abs(consoleTotal) > 0.5;
  const hasLedger = Math.abs(ledgerTotal) > 0.5;
  if (!hasConsole && !hasLedger) return "kosong";
  if (hasConsole && !hasLedger) return "belum-ditransfer";
  if (!hasConsole && hasLedger) return "tanpa-keputusan";

  const diff = ledgerTotal - consoleTotal;
  if (diff < -1) return "ledger-kurang";
  if (diff <= 1) return "cocok";
  // Minimal satu penerima supaya bulan dengan recipientCount 0 tapi ada
  // selisih tidak otomatis dicap "besar".
  const ceiling = Math.max(recipientCount, 1) * MAX_FEE_PER_RECIPIENT;
  return diff <= ceiling ? "biaya-transfer" : "selisih-besar";
}

export async function getDividendReconciliation(): Promise<
  ActionResult<ReconcilePeriod[]>
> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const db = createAdminClient();

  // ── Sisi konsol: alokasi tersimpan, dipetakan ke cabang lewat recipient.
  const { data: allocRows, error: allocErr } = await db
    .from("yeobo_dividend_allocations")
    .select(
      "period_year, period_month, amount_idr, yeobo_dividend_recipients!inner(branch)"
    );
  if (allocErr) return { ok: false, error: allocErr.message };

  /** `${ym}│${branch}` → { total, n } */
  const consoleMap = new Map<string, { total: number; n: number }>();
  for (const r of (allocRows ?? []) as unknown as Array<{
    period_year: number;
    period_month: number;
    amount_idr: string | number;
    yeobo_dividend_recipients: { branch: string } | null;
  }>) {
    const branch = r.yeobo_dividend_recipients?.branch;
    if (!branch) continue;
    const key = `${ymKey(r.period_year, r.period_month)}│${branch}`;
    const cur = consoleMap.get(key) ?? { total: 0, n: 0 };
    cur.total += Number(r.amount_idr);
    cur.n += 1;
    consoleMap.set(key, cur);
  }

  // ── Sisi ledger: baris kategori Dividend milik BU ini.
  const { data: txRows, error: txErr } = await db
    .from("cashflow_transactions")
    .select(
      "id, transaction_date, effective_period_year, effective_period_month, " +
        "branch, debit, credit, description, " +
        "cashflow_statements!inner(bank_accounts!inner(business_unit))"
    )
    .eq("category", "Dividend")
    .eq("cashflow_statements.bank_accounts.business_unit", BU);
  if (txErr) return { ok: false, error: txErr.message };

  type Tx = {
    id: string;
    transaction_date: string;
    effective_period_year: number | null;
    effective_period_month: number | null;
    branch: string | null;
    debit: string | number;
    credit: string | number;
    description: string;
  };

  /** `${ym}│${branch}` → total (sesudah split sentinel) */
  const ledgerMap = new Map<string, number>();
  const rowsByYm = new Map<string, ReconcileLedgerRow[]>();

  for (const t of (txRows ?? []) as unknown as Tx[]) {
    const fromTxDate = t.effective_period_month == null;
    const y = t.effective_period_year ?? Number(t.transaction_date.slice(0, 4));
    const m =
      t.effective_period_month ?? Number(t.transaction_date.slice(5, 7));
    const ym = ymKey(y, m);
    const debit = Number(t.debit);
    const credit = Number(t.credit);

    // Konvensi PnL: Dividend adalah pengeluaran (debit). Credit dihitung
    // negatif supaya koreksi/pengembalian tidak salah tanda.
    const amount = debit - credit;

    const list = rowsByYm.get(ym) ?? [];
    list.push({
      id: t.id,
      date: t.transaction_date,
      bucket: ym,
      bucketFromTxDate: fromTxDate,
      branchTag: t.branch,
      amount,
      description: t.description,
    });
    rowsByYm.set(ym, list);

    // Split sentinel cabang persis seperti agregator PnL, supaya angka di
    // panel ini identik dengan yang tampil di spreadsheet.
    for (const part of expandBranchAllSplits(
      [{ branch: t.branch, debit, credit }],
      BU
    )) {
      if (!part.branch) continue;
      const key = `${ym}│${part.branch}`;
      ledgerMap.set(
        key,
        (ledgerMap.get(key) ?? 0) + (part.debit - part.credit)
      );
    }
  }

  // ── Rentang bulan: dari START sampai bulan terakhir yang punya data.
  const allYms = new Set<string>([
    ...[...consoleMap.keys()].map((k) => k.split("│")[0]),
    ...rowsByYm.keys(),
  ]);
  let maxRank = ymRank(START.year, START.month);
  for (const ym of allYms) {
    const [y, m] = ym.split("-").map(Number);
    maxRank = Math.max(maxRank, ymRank(y, m));
  }

  const out: ReconcilePeriod[] = [];
  for (
    let r = ymRank(START.year, START.month);
    r <= maxRank;
    r = r % 100 === 12 ? (Math.floor(r / 100) + 1) * 100 + 1 : r + 1
  ) {
    const y = Math.floor(r / 100);
    const m = r % 100;
    const ym = ymKey(y, m);

    const branches: ReconcileBranch[] = PHYSICAL_BRANCHES.map((branch) => {
      const c = consoleMap.get(`${ym}│${branch}`) ?? { total: 0, n: 0 };
      const ledgerTotal = Math.round(ledgerMap.get(`${ym}│${branch}`) ?? 0);
      const consoleTotal = Math.round(c.total);
      return {
        branch,
        consoleTotal,
        ledgerTotal,
        diff: ledgerTotal - consoleTotal,
        recipientCount: c.n,
        status: classify(consoleTotal, ledgerTotal, c.n),
      };
    });

    const consoleTotal = branches.reduce((s, b) => s + b.consoleTotal, 0);
    const ledgerTotal = branches.reduce((s, b) => s + b.ledgerTotal, 0);
    const recipientCount = branches.reduce((s, b) => s + b.recipientCount, 0);

    out.push({
      year: y,
      month: m,
      branches,
      consoleTotal,
      ledgerTotal,
      diff: ledgerTotal - consoleTotal,
      status: classify(consoleTotal, ledgerTotal, recipientCount),
      ledgerRows: (rowsByYm.get(ym) ?? []).sort((a, b) =>
        a.date < b.date ? -1 : 1
      ),
    });
  }

  return { ok: true, data: out };
}
