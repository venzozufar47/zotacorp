"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Plus, Banknote, ArrowRight, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BankAccountFormDialog } from "./BankAccountFormDialog";
import { formatIDR } from "@/lib/cashflow/format";
import type { BankCode } from "@/lib/cashflow/types";

interface StatementRow {
  id: string;
  period_month: number;
  period_year: number;
  opening_balance: number;
  closing_balance: number;
  status: string;
  pdf_path: string | null;
  created_at: string;
  confirmed_at: string | null;
}

interface AccountRow {
  id: string;
  businessUnit: string;
  bank: BankCode;
  accountNumber: string | null;
  accountName: string;
  isActive: boolean;
  statements: StatementRow[];
  /** Derived from the same credit−debit cumulation the rekening detail
   *  page renders, so the card stays in sync with the ledger even when
   *  stored running_balance / statement closing_balance drift (cash
   *  rekening never writes those columns). */
  latestBalance: number;
}

interface Props {
  businessUnits: string[];
  activeBusinessUnit: string;
  accounts: AccountRow[];
  /** Gates admin-only actions (BU tabs, "Tambah rekening", "Profit &
   *  Loss" link). Non-admin assignees only see their assigned
   *  rekening in a read-only header. */
  isAdmin: boolean;
}

const BU_AVAILABILITY: Record<string, boolean> = {
  Haengbocake: true,
  "Yeobo Space": false,
  "Yeobo Booth": false,
  Gritamora: false,
};

const BANK_LABELS: Record<BankCode, string> = {
  mandiri: "Bank Mandiri",
  jago: "Bank Jago",
  bca: "BCA",
  bri: "BRI",
  bni: "BNI",
  cash: "Cash",
  other: "Bank lainnya",
};

export function FinanceLandingClient({
  businessUnits,
  activeBusinessUnit,
  accounts,
  isAdmin,
}: Props) {
  const router = useRouter();
  const [addAccountOpen, setAddAccountOpen] = useState(false);

  const visibleAccounts = useMemo(
    () => accounts.filter((a) => a.isActive),
    [accounts]
  );

  function handleBUChange(bu: string) {
    if (!BU_AVAILABILITY[bu]) return;
    router.push(`/admin/finance?bu=${encodeURIComponent(bu)}`);
  }

  return (
    <div className="space-y-5">
      {/* Business unit tabs — hidden for non-admin (they only see
          their assigned rekening, which is always under one BU). */}
      {isAdmin && (
      <div className="flex gap-2 flex-wrap">
        {businessUnits.map((bu) => {
          const available = BU_AVAILABILITY[bu] ?? false;
          const active = bu === activeBusinessUnit;
          return (
            <button
              key={bu}
              type="button"
              onClick={() => handleBUChange(bu)}
              disabled={!available}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border-2 transition",
                active && available
                  ? "bg-primary text-primary-foreground border-primary shadow-[0_4px_14px_-4px_rgba(0,90,101,0.45)]"
                  : available
                  ? "bg-card text-foreground border-border hover:border-primary/50"
                  : "bg-muted text-muted-foreground border-border opacity-60 cursor-not-allowed"
              )}
            >
              <Building2 size={14} />
              {bu}
              {!available && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-background/80 text-muted-foreground">
                  Soon
                </span>
              )}
            </button>
          );
        })}
      </div>
      )}

      {/* Action bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">
            {isAdmin ? `Rekening — ${activeBusinessUnit}` : "Rekening yang kamu akses"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {isAdmin
              ? `${visibleAccounts.length} rekening aktif. Tambah rekening, lalu upload rekening koran bulanannya.`
              : `${visibleAccounts.length} rekening — hanya rekening yang di-assign ke kamu yang tampil di sini.`}
          </p>
        </div>
        {isAdmin && (
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/finance/pnl?bu=${encodeURIComponent(activeBusinessUnit)}`}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition"
          >
            <TrendingUp size={14} />
            Profit &amp; Loss
          </Link>
          <Button
            type="button"
            onClick={() => setAddAccountOpen(true)}
            className="gap-1.5"
            size="sm"
          >
            <Plus size={14} />
            Tambah rekening
          </Button>
        </div>
        )}
      </div>

      {/* Accounts grid */}
      {visibleAccounts.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-border p-10 text-center space-y-2">
          <Banknote size={28} className="mx-auto text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            Belum ada rekening untuk {activeBusinessUnit}. Klik "Tambah rekening" untuk mulai.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visibleAccounts.map((acc) => (
            <Link
              key={acc.id}
              href={`/admin/finance/rekening/${acc.id}`}
              className="group block rounded-3xl border border-border bg-card p-5 space-y-4 hover:border-primary/50 hover:shadow-[0_4px_20px_-8px_rgba(0,90,101,0.25)] transition"
            >
              <div className="min-w-0">
                <p className="font-display text-base font-semibold text-foreground truncate">
                  {acc.accountName}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                  {BANK_LABELS[acc.bank]}
                  {acc.accountNumber ? ` • ${acc.accountNumber}` : ""}
                </p>
              </div>

              {/* Summary block — no nested link, the outer card is the
                  navigation target. Actions (upload / manual / delete)
                  all live inside the detail page, not here. */}
              <div className="rounded-2xl border border-border/70 bg-background/50 p-3">
                <div className="space-y-0.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Saldo terakhir
                  </p>
                  <p className="font-mono tabular-nums text-lg font-semibold text-foreground">
                    Rp {formatIDR(acc.latestBalance)}
                  </p>
                </div>
                <p className="mt-3 text-xs font-semibold text-primary inline-flex items-center gap-1 group-hover:gap-2 transition-all">
                  Lihat cashflow
                  <ArrowRight size={12} />
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      <BankAccountFormDialog
        open={addAccountOpen}
        onOpenChange={setAddAccountOpen}
        businessUnit={activeBusinessUnit}
      />
    </div>
  );
}
