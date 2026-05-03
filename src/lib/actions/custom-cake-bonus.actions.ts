"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/supabase/cached";

// Hardcoded Haengbocake bank account IDs — derived from a one-time
// listing query and unlikely to change. Storing as constants avoids
// an extra SELECT round-trip on every page load.
const BANK = {
  jago: "330e6b97-84b9-4c4a-8f00-615afa93d079",
  mandiri: "0b28aaa5-5ffd-4694-9cbf-7ea5ebb90875",
  cashPare: "947136f6-4458-40e6-9c4b-fd3a2a183a9f",
  cashSemarang: "a514d240-d75a-4621-8639-b445874a1b54",
} as const;

type BankKey = keyof typeof BANK;

const BANK_LABEL: Record<BankKey, string> = {
  jago: "Jago",
  mandiri: "Mandiri",
  cashPare: "Cash Pare (QRIS pengurang)",
  cashSemarang: "Cash Semarang",
};

/**
 * Per-day bonus formula derived from spreadsheet:
 *   IF C < 550_000  → 0
 *   IF 550_000 ≤ C ≤ 700_000 → C × 10%
 *   IF C > 700_000 → 70_000 + (C − 700_000) × 5%
 *
 * Inlined in `getCustomCakeBonusMonth` below — kept here as the
 * canonical reference. If you ever need it elsewhere, extract to a
 * non-"use server" helper module so it can stay sync.
 */

/**
 * Default classification rules per bank account. Returns whether a
 * transaction would be auto-included in custom cake total (before any
 * manual override).
 */
function autoIncludeRule(
  bankKey: BankKey,
  tx: {
    credit: number | string | null;
    description: string | null;
    source_destination: string | null;
    notes: string | null;
  }
): boolean {
  const credit = Number(tx.credit ?? 0);
  if (credit <= 0) return false;
  const desc = (tx.description ?? "").toLowerCase();
  const src = (tx.source_destination ?? "").toLowerCase();
  const notes = (tx.notes ?? "").toLowerCase();
  switch (bankKey) {
    case "jago":
      // SALES = custom cake by definition. Exclude:
      //   - Wholesale (Meidani) / mall outlet (Paragon) senders
      //   - Internal pocket movements (Bank Jago's "Pockets" feature)
      //   - Internal transfer from Mandiri ("Pindah dana qris haengbo")
      if (src.includes("meidani") || src.includes("paragon")) return false;
      if (desc.includes("pindah dana")) return false;
      if (desc.includes("main pocket movement")) return false;
      if (desc.includes("pocket money")) return false;
      return true;
    case "mandiri":
      // All credits = QRIS settlements. Pare portion is subtracted via
      // the cashPare bucket below — don't filter Mandiri itself.
      return true;
    case "cashPare":
      // QRIS-flavored Pare entries count as the Mandiri-QRIS deduction.
      // Matches both "POS QRIS: ..." (POSClient-generated) and manual
      // "Penjualan Qris" / similar journal entries entered by admin.
      // POS Cash / "Penjualan Cash" / "Cash Awal" don't match — those
      // are local Pare cash and irrelevant to the bonus.
      return desc.includes("qris");
    case "cashSemarang":
      // All credits = sales (mostly DP/lunas custom cake) by default.
      // Exclusions:
      //   - "ongkir" → shipping fee, not a sale
      //   - "dari mas venzo" → owner capital injection / refund, not sale
      if (notes.includes("ongkir") || desc.includes("ongkir")) return false;
      if (notes.includes("dari mas venzo") || desc.includes("dari mas venzo"))
        return false;
      return true;
  }
}

export interface DayBreakdown {
  date: string; // yyyy-mm-dd
  jago: number;
  mandiri: number;
  pareQrisDeduction: number; // negative contribution
  semarang: number;
  total: number;
  bonus: number;
  transactions: TxRow[];
}

export interface TxRow {
  id: string;
  bankKey: BankKey;
  bankLabel: string;
  date: string;
  description: string | null;
  sourceDestination: string | null;
  notes: string | null;
  credit: number;
  autoIncluded: boolean;
  manualOverride: boolean | null;
  effectiveIncluded: boolean;
}

interface BonusMonth {
  month: number;
  year: number;
  days: DayBreakdown[];
  totalBonus: number;
}

/** Pure compute: classify a fetched tx + collapse to display row. */
function buildTxRow(
  raw: {
    id: string;
    transaction_date: string;
    description: string;
    source_destination: string | null;
    notes: string | null;
    credit: number | string | null;
    custom_cake_included: boolean | null;
    statement_id: string;
  },
  bankKey: BankKey
): TxRow {
  const credit = Number(raw.credit ?? 0);
  const auto = autoIncludeRule(bankKey, raw);
  const override = raw.custom_cake_included;
  return {
    id: raw.id,
    bankKey,
    bankLabel: BANK_LABEL[bankKey],
    date: raw.transaction_date,
    description: raw.description,
    sourceDestination: raw.source_destination,
    notes: raw.notes,
    credit,
    autoIncluded: auto,
    manualOverride: override,
    effectiveIncluded: override ?? auto,
  };
}

export async function getCustomCakeBonusMonth(
  month: number,
  year: number
): Promise<BonusMonth> {
  const role = await getCurrentRole();
  if (role !== "admin")
    return { month, year, days: [], totalBonus: 0 };

  const supabase = await createClient();
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  // Single query — pull ALL transactions across the 4 Haengbocake
  // accounts via JOIN to statements, then classify in-memory.
  const { data } = await supabase
    .from("cashflow_transactions")
    .select(
      "id, transaction_date, description, source_destination, notes, credit, custom_cake_included, statement_id, cashflow_statements!inner(bank_account_id)"
    )
    .gte("transaction_date", monthStart)
    .lt("transaction_date", monthEnd)
    .gt("credit", 0)
    .in("cashflow_statements.bank_account_id", Object.values(BANK))
    .order("transaction_date");

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    transaction_date: string;
    description: string;
    source_destination: string | null;
    notes: string | null;
    credit: number | string | null;
    custom_cake_included: boolean | null;
    statement_id: string;
    cashflow_statements: { bank_account_id: string };
  }>;

  // Index bank_account_id → BankKey
  const idToKey = new Map<string, BankKey>();
  for (const [key, id] of Object.entries(BANK)) idToKey.set(id, key as BankKey);

  // Group by date. Drop entries that are pure noise (not sales at all)
  // so the verification UI only shows rows admin actually needs to
  // judge: Meidani/Paragon senders (admin verifies "yes exclude"),
  // ambiguous senders (admin verifies "include"), POS QRIS Pare for
  // deduction, etc.
  const byDate = new Map<string, TxRow[]>();
  for (const r of rows) {
    const bankKey = idToKey.get(r.cashflow_statements.bank_account_id);
    if (!bankKey) continue;
    const desc = (r.description ?? "").toLowerCase();
    if (bankKey === "cashPare") {
      // Only QRIS-flavored entries are deductions; rest is Pare local
      // cash (irrelevant to bonus). Matches POS-generated rows + manual
      // "Penjualan Qris" journal entries.
      if (!desc.includes("qris")) continue;
    }
    if (bankKey === "jago") {
      // Internal pocket / Mandiri-to-Jago movements are not sales.
      if (
        desc.includes("pindah dana") ||
        desc.includes("main pocket movement") ||
        desc.includes("pocket money")
      ) {
        continue;
      }
    }
    if (bankKey === "cashSemarang") {
      // Owner capital injections / personal transfers are not sales.
      const notes = (r.notes ?? "").toLowerCase();
      if (desc.includes("dari mas venzo") || notes.includes("dari mas venzo")) {
        continue;
      }
    }
    const txRow = buildTxRow(r, bankKey);
    const arr = byDate.get(txRow.date) ?? [];
    arr.push(txRow);
    byDate.set(txRow.date, arr);
  }

  const days: DayBreakdown[] = [];
  for (const [date, txs] of [...byDate.entries()].sort()) {
    let jago = 0;
    let mandiri = 0;
    let pareQrisDeduction = 0;
    let semarang = 0;
    for (const tx of txs) {
      if (!tx.effectiveIncluded) continue;
      if (tx.bankKey === "jago") jago += tx.credit;
      else if (tx.bankKey === "mandiri") mandiri += tx.credit;
      else if (tx.bankKey === "cashPare") pareQrisDeduction += tx.credit;
      else if (tx.bankKey === "cashSemarang") semarang += tx.credit;
    }
    const total = jago + mandiri - pareQrisDeduction + semarang;
    const bonus =
      total < 550_000
        ? 0
        : total <= 700_000
          ? Math.round(total * 0.1)
          : Math.round(70_000 + (total - 700_000) * 0.05);
    days.push({
      date,
      jago,
      mandiri,
      pareQrisDeduction,
      semarang,
      total,
      bonus,
      transactions: txs,
    });
  }

  const totalBonus = days.reduce((s, d) => s + d.bonus, 0);
  return { month, year, days, totalBonus };
}

/** Manual override: null = revert to auto-classification. */
export async function setCustomCakeIncluded(
  txId: string,
  included: boolean | null
): Promise<{ ok: true } | { error: string }> {
  const role = await getCurrentRole();
  if (role !== "admin") return { error: "Forbidden" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("cashflow_transactions")
    .update({ custom_cake_included: included })
    .eq("id", txId);
  if (error) return { error: error.message };
  revalidatePath("/admin/payslips/variables");
  return { ok: true };
}
