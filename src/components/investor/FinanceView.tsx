"use client";

import { useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { useProgressRouter } from "@/lib/route-progress";
import {
  ArrowDownUp,
  Banknote,
  Building2,
  Check,
  ChevronDown,
  Clock,
  Download,
  FileText,
  Loader2,
  Lock,
  Search,
  X,
} from "lucide-react";
import { formatRp, formatIDR } from "@/lib/cashflow/format";
import { BANK_LABELS, BANK_COLORS } from "@/lib/cashflow/bank-display";
import type { BankCode } from "@/lib/cashflow/types";
import type { InvestorTxRow } from "@/lib/actions/investor-finance.actions";
import { getStatementPdfUrlForInvestor } from "@/lib/actions/investor-finance.actions";

const MONTH_NAMES_ID = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

export interface AccountSummaryProp {
  id: string;
  bank: BankCode;
  accountName: string;
  accountNumber: string | null;
  balance: number;
}

export interface StatementListItem {
  id: string;
  periodYear: number;
  periodMonth: number;
  status: "draft" | "confirmed";
  txCount: number;
}

export interface StmtBundleProp {
  statement: {
    id: string;
    periodYear: number;
    periodMonth: number;
    openingBalance: number;
    closingBalance: number;
    status: "draft" | "confirmed";
    pdfPath: string | null;
  };
  uploader: { name: string | null; at: string | null };
  summary: { totalDebit: number; totalCredit: number };
  transactions: InvestorTxRow[];
}

export function FinanceView({
  businessUnits,
  activeBu,
  accounts,
  activeAccId,
  statements,
  activeStmtId,
  bundleSlot,
}: {
  businessUnits: string[];
  activeBu: string;
  accounts: AccountSummaryProp[];
  activeAccId: string | null;
  statements: StatementListItem[];
  activeStmtId: string | null;
  /** Statement detail panel — rendered by server component lalu
   *  di-Suspense-kan. Boleh ReactNode supaya streaming bekerja
   *  (sidebar+kartu tampil dulu, detail streaming menyusul). */
  bundleSlot: React.ReactNode;
}) {
  const router = useProgressRouter();
  const sp = useSearchParams();
  const [navPending, startNavTransition] = useTransition();

  function setParam(updates: Record<string, string | null>) {
    const params = new URLSearchParams(sp?.toString() ?? "");
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    startNavTransition(() => {
      router.replace(`/investor/finance?${params.toString()}`, {
        scroll: false,
      });
    });
  }

  const activeAcc = accounts.find((a) => a.id === activeAccId) ?? null;

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <header className="flex items-end justify-between gap-6 flex-wrap">
        <div>
          <p className="eyebrow text-muted-foreground">Keuangan</p>
          <h1 className="mt-1 text-xl sm:text-2xl font-display font-semibold text-foreground">
            Rekening &amp; transaksi
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-xl">
            Akses transparan rekening koran &amp; setiap transaksi unit
            bisnis yang Anda dukung. Mode baca · tidak ada akses transfer.
          </p>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Rekonsiliasi otomatis aktif
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Lock size={11} />
            Mode baca
          </span>
        </div>
      </header>

      {/* BU tabs */}
      {businessUnits.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {businessUnits.map((bu) => {
            const active = bu === activeBu;
            return (
              <Link
                key={bu}
                href={`/investor/finance?bu=${encodeURIComponent(bu)}`}
                className={
                  "press-feedback inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border-2 transition " +
                  (active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-foreground border-border hover:border-primary/50")
                }
              >
                <Building2 size={14} />
                {bu}
              </Link>
            );
          })}
        </div>
      )}

      {/* Account picker grid */}
      {accounts.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-border p-10 text-center space-y-2">
          <Banknote
            size={28}
            className="mx-auto text-muted-foreground"
            aria-hidden
          />
          <p className="text-sm text-muted-foreground">
            Belum ada rekening untuk {activeBu}.
          </p>
        </div>
      ) : (
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {accounts.map((a) => {
            const active = a.id === activeAccId;
            const color = BANK_COLORS[a.bank];
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setParam({ acc: a.id, stmt: null })}
                className="press-feedback group relative text-left rounded-2xl p-5 overflow-hidden transition-all"
                style={{
                  background: active ? color : "var(--card, #fff)",
                  color: active ? "#fff" : undefined,
                  border: active ? "none" : "1px solid hsl(var(--border))",
                  boxShadow: active
                    ? "0 12px 32px -16px rgba(0,0,0,0.32)"
                    : "0 1px 2px rgba(0,0,0,0.04)",
                }}
              >
                {active && (
                  <div
                    aria-hidden
                    className="absolute -top-12 -right-10 w-[180px] h-[180px] rounded-full pointer-events-none"
                    style={{
                      background:
                        "radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 70%)",
                    }}
                  />
                )}
                <div className="relative flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p
                      className="text-[10px] uppercase tracking-[0.18em] font-semibold"
                      style={{ opacity: active ? 0.85 : 0.6 }}
                    >
                      {BANK_LABELS[a.bank]}
                    </p>
                    <p className="mt-1 font-display text-[14px] font-semibold leading-tight">
                      {a.accountName}
                    </p>
                    <p
                      className="mt-1 font-mono text-[11.5px] tabular-nums"
                      style={{ opacity: active ? 0.85 : 0.65 }}
                    >
                      {a.accountNumber ?? "—"}
                    </p>
                  </div>
                  <span
                    className="grid place-items-center size-10 rounded-xl shrink-0"
                    style={{
                      background: active
                        ? "rgba(255,255,255,0.18)"
                        : "hsl(var(--accent))",
                      color: active ? "#fff" : color,
                    }}
                  >
                    <Banknote size={18} strokeWidth={2.2} />
                  </span>
                </div>
                <div className="mt-4 relative">
                  <p
                    className="text-[10.5px] uppercase tracking-[0.16em] font-semibold"
                    style={{ opacity: active ? 0.8 : 0.55 }}
                  >
                    Saldo terakhir
                  </p>
                  <p className="mt-1 font-display text-[20px] font-semibold tabular-nums">
                    {formatRp(a.balance)}
                  </p>
                </div>
              </button>
            );
          })}
        </section>
      )}

      {/* Statement list + detail */}
      {activeAcc && (
        <section
          className={
            "grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-4 " +
            (navPending ? "is-pending" : "")
          }
        >
          {/* Statement list */}
          <aside className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Rekening koran
              </p>
              <h3 className="mt-0.5 font-display text-[14px] font-semibold">
                {BANK_LABELS[activeAcc.bank]}
              </h3>
              <p className="font-mono text-[10.5px] mt-0.5 text-muted-foreground">
                {activeAcc.accountNumber ?? "—"}
              </p>
            </div>
            <ul className="px-2 py-2 max-h-[640px] overflow-y-auto">
              {statements.length === 0 && (
                <li className="px-3 py-8 text-center text-[11.5px] text-muted-foreground">
                  Belum ada rekening koran diunggah.
                </li>
              )}
              {statements.map((s) => {
                const active = s.id === activeStmtId;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setParam({ stmt: s.id })}
                      className={
                        "press-feedback w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors " +
                        (active
                          ? "bg-accent text-primary"
                          : "hover:bg-muted/40 text-foreground")
                      }
                    >
                      <span
                        className="grid place-items-center size-9 rounded-lg shrink-0"
                        style={{
                          background: active
                            ? "#fff"
                            : "hsl(var(--muted) / 0.5)",
                          color: "hsl(var(--primary))",
                        }}
                      >
                        <FileText size={14} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] font-semibold">
                          {MONTH_NAMES_ID[s.periodMonth - 1]} {s.periodYear}
                        </p>
                        <p
                          className="text-[10.5px] tabular-nums"
                          style={{
                            color: active
                              ? "hsl(var(--primary))"
                              : "hsl(var(--muted-foreground))",
                            opacity: 0.85,
                          }}
                        >
                          {s.txCount} transaksi
                        </p>
                      </div>
                      <span
                        className={
                          "text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded " +
                          (activeAcc.bank === "cash"
                            ? "bg-sky-100 text-sky-800"
                            : s.status === "confirmed"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800")
                        }
                      >
                        {activeAcc.bank === "cash"
                          ? "Sync"
                          : s.status === "confirmed"
                            ? "Match"
                            : "Proses"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          {/* Detail — di-render dari server component lewat Suspense
              slot supaya shell tidak ikut blocking saat fetch detail. */}
          {bundleSlot ?? (
            <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
              Pilih rekening koran di sebelah kiri untuk melihat detail
              transaksi.
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export function BundleDetail({
  acc,
  bundle,
}: {
  acc: AccountSummaryProp;
  bundle: StmtBundleProp;
}) {
  const [q, setQ] = useState("");
  const [flow, setFlow] = useState<"all" | "credit" | "debit">("all");
  const [cat, setCat] = useState<string>("all");
  const [sortDesc, setSortDesc] = useState(false);
  const [pdfPending, startPdfTransition] = useTransition();

  const all = bundle.transactions;
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const t of all) if (t.category) set.add(t.category);
    return ["all", ...Array.from(set).sort()];
  }, [all]);

  const filtered = useMemo(() => {
    let out = all;
    const ql = q.trim().toLowerCase();
    if (ql) {
      out = out.filter((t) => {
        const hay = [
          t.description,
          t.category,
          t.sourceDestination,
          t.transactionDetails,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(ql);
      });
    }
    if (flow === "credit") out = out.filter((t) => t.credit > 0);
    if (flow === "debit") out = out.filter((t) => t.debit > 0);
    if (cat !== "all") out = out.filter((t) => t.category === cat);
    if (sortDesc) out = out.slice().reverse();
    return out;
  }, [all, q, flow, cat, sortDesc]);

  function handleDownloadPdf() {
    startPdfTransition(async () => {
      const res = await getStatementPdfUrlForInvestor(bundle.statement.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      window.open(res.data!.url, "_blank", "noopener,noreferrer");
    });
  }

  const periodLabel = `${MONTH_NAMES_ID[bundle.statement.periodMonth - 1]} ${bundle.statement.periodYear}`;

  // Integrity check: jumlah tx yang tanggal-nya di luar periode
  // statement. Kalau ada → label statement vs data tidak sinkron
  // (admin upload salah set period). Surface ke user supaya tidak
  // bingung lihat angka yang aneh. Skip untuk cash karena tx-nya
  // di-derive dari Google Sheet sync — opening tx kadang punya
  // tanggal carry-over yang sah.
  const outOfPeriodCount =
    acc.bank === "cash"
      ? 0
      : bundle.transactions.reduce((n, t) => {
          const [y, m] = t.date.split("-");
          return Number(y) === bundle.statement.periodYear &&
            Number(m) === bundle.statement.periodMonth
            ? n
            : n + 1;
        }, 0);

  // Cash account tidak punya opening/closing balance konsep statement
  // (tidak ada PDF rekening koran). Derive saldo dari running_balance
  // tx pertama/terakhir kalau opening/closing di-DB nol.
  const isCash = acc.bank === "cash";
  const txAsc = bundle.transactions; // already chronological asc from server
  const firstTx = txAsc[0];
  const lastTx = txAsc[txAsc.length - 1];
  const displayOpening =
    isCash && firstTx?.runningBalance != null
      ? firstTx.runningBalance - firstTx.credit + firstTx.debit
      : bundle.statement.openingBalance;
  const displayClosing =
    isCash && lastTx?.runningBalance != null
      ? lastTx.runningBalance
      : bundle.statement.closingBalance;

  const uploaderAt = bundle.uploader.at
    ? new Date(bundle.uploader.at).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Statement header */}
      <div className="px-6 pt-5 pb-4 border-b border-border">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Rekening koran · {BANK_LABELS[acc.bank]}
              {acc.accountNumber ? ` ${acc.accountNumber}` : ""}
            </p>
            <h3 className="mt-1 font-display text-[22px] font-semibold">
              {periodLabel}
            </h3>
            <p className="text-[11.5px] mt-1 text-muted-foreground">
              {bundle.transactions.length} transaksi
              {bundle.uploader.name
                ? ` · diunggah ${bundle.uploader.name}`
                : ""}
              {uploaderAt ? ` pada ${uploaderAt}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={pdfPending || !bundle.statement.pdfPath}
            title={
              !bundle.statement.pdfPath
                ? "PDF belum diunggah admin"
                : "Buka PDF di tab baru (link 5 menit)"
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pdfPending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Download size={12} strokeWidth={2.4} />
            )}
            Unduh PDF
          </button>
        </div>

        {outOfPeriodCount > 0 && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-900">
            <span className="text-amber-700 mt-0.5">⚠</span>
            <span>
              <strong>{outOfPeriodCount}</strong> dari{" "}
              {bundle.transactions.length} transaksi punya tanggal di
              luar periode <strong>{periodLabel}</strong>. Mungkin
              statement ini di-label salah saat upload — minta admin
              re-upload atau ubah period_year/period_month.
            </span>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SumStat
            label="Saldo awal"
            value={formatRp(displayOpening)}
          />
          <SumStat
            label="Total kredit (masuk)"
            value={formatRp(bundle.summary.totalCredit)}
            tone="positive"
          />
          <SumStat
            label="Total debit (keluar)"
            value={formatRp(bundle.summary.totalDebit)}
            tone="negative"
          />
          <SumStat
            label="Saldo akhir"
            value={formatRp(displayClosing)}
            tone="accent"
          />
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-6 py-3 flex items-center gap-2 flex-wrap border-b border-border">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg flex-1 min-w-[200px] bg-muted/40 border border-border">
          <Search
            size={13}
            strokeWidth={2.2}
            className="text-muted-foreground"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari deskripsi atau kategori…"
            className="flex-1 bg-transparent text-[12.5px] outline-none"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="text-muted-foreground"
              aria-label="Clear"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <ChipGroup
          value={flow}
          onChange={(v) => setFlow(v as typeof flow)}
          options={[
            { id: "all", label: "Semua" },
            { id: "credit", label: "Masuk" },
            { id: "debit", label: "Keluar" },
          ]}
        />

        <div className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11.5px] font-semibold bg-muted/40 border border-border">
          <select
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            className="bg-transparent outline-none pr-1"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === "all" ? "Semua kategori" : c}
              </option>
            ))}
          </select>
          <ChevronDown size={11} className="text-muted-foreground" />
        </div>

        <button
          type="button"
          onClick={() => setSortDesc((d) => !d)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold bg-muted/40 border border-border"
        >
          <ArrowDownUp size={12} />
          {sortDesc ? "Terbaru" : "Terlama"}
        </button>

        <p className="text-[11px] tabular-nums text-muted-foreground">
          {filtered.length} dari {all.length} transaksi
        </p>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className="bg-muted/40">
            <tr>
              <Th className="text-left w-[100px]">Tanggal</Th>
              <Th className="text-left">Deskripsi</Th>
              <Th className="text-left w-[140px]">Kategori</Th>
              <Th className="text-right w-[140px]">Debit</Th>
              <Th className="text-right w-[140px]">Kredit</Th>
              <Th className="text-right w-[160px]">Saldo</Th>
              {acc.bank !== "cash" && (
                <Th className="text-right w-[110px]">Status</Th>
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={acc.bank === "cash" ? 6 : 7}
                  className="px-6 py-10 text-center text-[12px] text-muted-foreground"
                >
                  Tidak ada transaksi yang cocok dengan filter.
                </td>
              </tr>
            )}
            {filtered.map((t) => (
              <tr
                key={t.id}
                className="hover:bg-muted/30 border-t border-border align-top"
              >
                <td className="px-6 py-2.5 font-mono text-[11.5px] whitespace-nowrap">
                  {formatTxDate(t.date)}
                  {t.time ? (
                    <span className="text-muted-foreground">
                      {" "}
                      {t.time.slice(0, 5)}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2.5">
                  <p className="font-medium leading-snug">{t.description}</p>
                  {t.sourceDestination && (
                    <p className="text-[10.5px] text-muted-foreground mt-0.5">
                      {t.sourceDestination}
                    </p>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {t.category ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] font-semibold bg-accent text-primary">
                      {t.category}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td
                  className="px-3 py-2.5 text-right tabular-nums font-semibold"
                  style={{ color: t.debit ? "#b42234" : "hsl(var(--border))" }}
                >
                  {t.debit ? formatIDR(t.debit) : "—"}
                </td>
                <td
                  className="px-3 py-2.5 text-right tabular-nums font-semibold"
                  style={{
                    color: t.credit ? "#1d6b3a" : "hsl(var(--border))",
                  }}
                >
                  {t.credit ? formatIDR(t.credit) : "—"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                  {t.runningBalance != null ? formatIDR(t.runningBalance) : "—"}
                </td>
                {acc.bank !== "cash" && (
                  <td className="px-6 py-2.5 text-right">
                    <StatusBadge
                      status={
                        bundle.statement.status === "confirmed"
                          ? "matched"
                          : "pending"
                      }
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={
        "px-3 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground " +
        className
      }
    >
      {children}
    </th>
  );
}

function SumStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "accent";
}) {
  return (
    <div
      className={
        "rounded-xl px-4 py-3 border border-border " +
        (tone === "accent" ? "bg-accent" : "bg-muted/40")
      }
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p
        className="mt-1 font-display text-[15px] font-semibold tabular-nums"
        style={{
          color:
            tone === "positive"
              ? "#1d6b3a"
              : tone === "negative"
                ? "#b42234"
                : tone === "accent"
                  ? "hsl(var(--primary))"
                  : undefined,
        }}
      >
        {value}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: "matched" | "pending" }) {
  if (status === "matched") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-semibold bg-emerald-100 text-emerald-800">
        <Check size={10} strokeWidth={2.4} />
        Match
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-semibold bg-amber-100 text-amber-800">
      <Clock size={10} strokeWidth={2.4} />
      Pending
    </span>
  );
}

function ChipGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ id: T; label: string }>;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-muted/40 border border-border">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={
              "px-2.5 py-1 rounded text-[11.5px] font-semibold " +
              (active
                ? "bg-card text-primary shadow-sm"
                : "text-muted-foreground")
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function formatTxDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
