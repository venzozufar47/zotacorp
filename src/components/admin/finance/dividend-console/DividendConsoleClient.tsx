"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Calculator,
  Eraser,
  Link2Off,
  Check,
  Send,
} from "lucide-react";
import { formatRp, formatIDR } from "@/lib/cashflow/format";
import { MONTH_FULL_NAMES, formatDateID } from "@/lib/utils/date-formats";
import {
  computeRecipientAmounts,
  type DivRecipient,
} from "@/lib/investor/dividend-allocation";
import {
  saveDividendConsoleMonth,
  type DividendConsoleData,
  type ConsoleBranch,
} from "@/lib/actions/yeobo-dividend-console.actions";

const ymRank = (s: string) => {
  const [y, m] = s.split("-").map(Number);
  return y * 100 + m;
};
const ymStr = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
function shiftMonth(y: number, m: number, d: number) {
  let mm = m + d;
  let yy = y;
  while (mm < 1) {
    mm += 12;
    yy -= 1;
  }
  while (mm > 12) {
    mm -= 12;
    yy += 1;
  }
  return { year: yy, month: mm };
}
function parseAmount(s: string): number {
  const digits = s.replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : 0;
}
function fmtPct(n: number): string {
  return (Math.round(n * 10) / 10).toLocaleString("id-ID", {
    maximumFractionDigits: 1,
  });
}
/** Porsi investor terhadap POOL INVESTOR (basis rumus): nominal investasi
 *  / total modal, atau pool_pct bila tanpa nominal. */
function investorPoolSharePct(
  investIdr: number | null,
  poolPct: number | null,
  totalInvest: number | null
): number | null {
  if (investIdr != null && totalInvest && totalInvest > 0)
    return (investIdr / totalInvest) * 100;
  if (poolPct != null) return poolPct;
  return null;
}

/** Hitung split rumus untuk satu cabang dengan basis tertentu. */
function splitForBranch(branch: ConsoleBranch, basis: number): Record<string, number> {
  const recips: DivRecipient[] = branch.rows.map((r) => ({
    id: r.recipientId,
    label: r.label,
    kind: r.kind,
    poolPct: r.poolPct,
    investIdr: r.investIdr,
    sortOrder: r.sortOrder,
    userId: r.userId,
    contractId: r.contractId,
  }));
  const res = computeRecipientAmounts({
    pool: Math.max(0, Math.round(basis)),
    afterBep: branch.afterBep,
    config: {
      branch: branch.branch,
      mgmtPctBeforeBep: branch.mgmtPctBeforeBep,
      mgmtPctAfterBep: branch.mgmtPctAfterBep,
      totalInvestmentIdr: branch.totalInvestmentIdr,
      bepReachedYm: null,
    },
    recipients: recips,
  });
  const out: Record<string, number> = {};
  for (const x of res) out[x.recipientId] = x.amount;
  return out;
}

export function DividendConsoleClient({
  data,
  minYm,
  maxYm,
}: {
  data: DividendConsoleData;
  minYm: string;
  maxYm: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Nominal transfer per recipient (init: allocation tersimpan ?? 0 — tanpa
  // auto-prefill; admin pakai tombol hitung per cabang).
  const [amounts, setAmounts] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const b of data.branches)
      for (const r of b.rows) init[r.recipientId] = r.savedAllocation ?? 0;
    return init;
  });
  const [paidAt, setPaidAt] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [ref, setRef] = useState("");

  const setAmount = (id: string, v: number) =>
    setAmounts((prev) => ({ ...prev, [id]: v }));
  const applyValues = (values: Record<string, number>) =>
    setAmounts((prev) => ({ ...prev, ...values }));

  const curR = ymRank(ymStr(data.year, data.month));
  const canPrev = curR > ymRank(minYm);
  const canNext = curR < ymRank(maxYm);
  const monthLabel = `${MONTH_FULL_NAMES[data.month - 1]} ${data.year}`;
  const go = (y: number, m: number) =>
    router.push(`/admin/finance/dividen?month=${ymStr(y, m)}`);

  // Σ transfer per cabang (live).
  const branchSum = useMemo(() => {
    const m: Record<string, number> = {};
    for (const b of data.branches)
      m[b.branch] = b.rows.reduce((s, r) => s + (amounts[r.recipientId] ?? 0), 0);
    return m;
  }, [data.branches, amounts]);

  // Cabang yang akan disimpan: ada nominal > 0 ATAU sudah pernah tersimpan
  // (agar bisa di-nol-kan / dikoreksi).
  const submittable = data.branches.filter(
    (b) => branchSum[b.branch] > 0 || b.savedExists
  );
  const canSave = submittable.length > 0;

  const totalToInvestors = useMemo(() => {
    let t = 0;
    for (const b of data.branches)
      for (const r of b.rows)
        if (r.kind === "investor") t += amounts[r.recipientId] ?? 0;
    return t;
  }, [data.branches, amounts]);

  function handleSave() {
    if (!canSave) return;
    const branches = submittable.map((b) => ({
      branch: b.branch,
      rows: b.rows.map((r) => ({
        recipientId: r.recipientId,
        amount: amounts[r.recipientId] ?? 0,
      })),
    }));
    startTransition(async () => {
      const res = await saveDividendConsoleMonth({
        year: data.year,
        month: data.month,
        paidAt,
        ref: ref.trim() || null,
        branches,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `Tersimpan — ${res.data?.savedBranches} cabang, ${res.data?.syncedPayouts} payout investor disinkron.`
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* 1. Month navigation */}
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          disabled={!canPrev}
          onClick={() => {
            const p = shiftMonth(data.year, data.month, -1);
            go(p.year, p.month);
          }}
          className="grid size-9 place-items-center rounded-full border border-border bg-card text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition"
          aria-label="Bulan sebelumnya"
        >
          <ChevronLeft size={17} />
        </button>
        <div className="min-w-[170px] text-center text-lg font-bold text-foreground">
          {monthLabel}
        </div>
        <button
          type="button"
          disabled={!canNext}
          onClick={() => {
            const n = shiftMonth(data.year, data.month, +1);
            go(n.year, n.month);
          }}
          className="grid size-9 place-items-center rounded-full border border-border bg-card text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition"
          aria-label="Bulan berikutnya"
        >
          <ChevronRight size={17} />
        </button>
      </div>

      {/* 2. Branch summary cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        {data.branches.map((b) => {
          const pool = branchSum[b.branch] ?? 0;
          const kasIni =
            b.kasLastMonth == null ? null : b.kasLastMonth + b.operatingProfit - pool;
          return (
            <div
              key={b.branch}
              className="rounded-2xl border border-border bg-card p-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-foreground">
                  {b.branch}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    b.afterBep
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {b.afterBep ? "Setelah BEP" : "Sebelum BEP"} · Mgmt {b.mgmtPct}%
                </span>
              </div>
              <dl className="mt-3 space-y-1.5 text-[12.5px]">
                <Stat
                  label="Kas bulan lalu"
                  value={b.kasLastMonth == null ? "—" : formatRp(b.kasLastMonth)}
                  tone={b.kasLastMonth != null && b.kasLastMonth < 0 ? "neg" : "muted"}
                />
                <Stat
                  label="Operating profit"
                  value={formatRp(b.operatingProfit)}
                  tone={b.operatingProfit < 0 ? "neg" : "fg"}
                />
                <Stat label="Pool dividen" value={formatRp(pool)} tone="fg" strong />
                <Stat
                  label="Kas bulan ini"
                  value={kasIni == null ? "—" : formatRp(kasIni)}
                  tone={kasIni != null && kasIni < 0 ? "neg" : "fg"}
                  strong
                />
                {b.totalInvestmentIdr != null && (
                  <Stat
                    label="Modal terbalik"
                    value={`${formatIDR(b.investorRecouped)} / ${formatIDR(
                      b.totalInvestmentIdr
                    )}`}
                    tone="muted"
                  />
                )}
              </dl>
            </div>
          );
        })}
      </div>

      {/* 3. Per-branch allocation tables */}
      <div className="space-y-4">
        {data.branches.map((b) => (
          <BranchAllocationTable
            key={b.branch}
            branch={b}
            sum={branchSum[b.branch] ?? 0}
            amounts={amounts}
            setAmount={setAmount}
            onFillOpProfit={() =>
              applyValues(splitForBranch(b, b.operatingProfit))
            }
            onFillOpProfitPlusKas={() =>
              applyValues(
                splitForBranch(b, b.operatingProfit + (b.kasLastMonth ?? 0))
              )
            }
            onClear={() =>
              applyValues(
                Object.fromEntries(b.rows.map((r) => [r.recipientId, 0]))
              )
            }
          />
        ))}
      </div>

      {/* 4. Cross-branch investor view */}
      <InvestorCrossBranchTable data={data} amounts={amounts} />

      {/* 5. Transfer panel */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-bold text-foreground">
          Tandai bagi hasil tertransfer — {monthLabel}
        </h3>
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Tanggal transfer
            </span>
            <input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Referensi (opsional)
            </span>
            <input
              type="text"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="mis. BCA bulk 13/06"
              className="w-56 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          <div className="ml-auto flex flex-col items-end gap-1.5">
            <span className="text-[12px] text-muted-foreground">
              {submittable.length} cabang ·{" "}
              <span className="font-mono tabular-nums font-semibold text-foreground">
                {formatRp(totalToInvestors)}
              </span>{" "}
              ke investor
            </span>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave || pending}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:pointer-events-none transition"
            >
              <Send size={15} />
              {pending ? "Menyimpan…" : "Simpan & tandai tertransfer"}
            </button>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Nilai ini jadi bagi hasil riil yang memengaruhi BEP investor.{" "}
          <strong>Tidak masuk ke ledger</strong> — Dividend di P&L tetap dari
          rekening koran. Menyimpan ulang menimpa nominal & tanggal transfer
          bulan ini.
        </p>
      </div>

      {/* 6. Payout history */}
      {data.history.length > 0 && <PayoutHistory data={data} />}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "fg",
  strong,
}: {
  label: string;
  value: string;
  tone?: "fg" | "muted" | "neg";
  strong?: boolean;
}) {
  const toneCls =
    tone === "neg"
      ? "text-destructive"
      : tone === "muted"
        ? "text-muted-foreground"
        : "text-foreground";
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`font-mono tabular-nums ${toneCls} ${strong ? "font-semibold" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

// ── Branch allocation table ────────────────────────────────────────────
function BranchAllocationTable({
  branch,
  sum,
  amounts,
  setAmount,
  onFillOpProfit,
  onFillOpProfitPlusKas,
  onClear,
}: {
  branch: ConsoleBranch;
  sum: number;
  amounts: Record<string, number>;
  setAmount: (id: string, v: number) => void;
  onFillOpProfit: () => void;
  onFillOpProfitPlusKas: () => void;
  onClear: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <span className="text-sm font-bold text-foreground">{branch.branch}</span>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onFillOpProfit}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
            title={`Bagi ${formatRp(Math.max(0, branch.operatingProfit))} sesuai rumus`}
          >
            <Calculator size={12} /> Op profit
          </button>
          <button
            type="button"
            onClick={onFillOpProfitPlusKas}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
            title={`Bagi ${formatRp(
              Math.max(0, branch.operatingProfit + (branch.kasLastMonth ?? 0))
            )} (op profit + sisa Kas lalu)`}
          >
            <Calculator size={12} /> Op profit + Kas
          </button>
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted"
          >
            <Eraser size={12} /> Kosongkan
          </button>
        </div>
      </div>

      {/* Rumus pembagian cabang ini */}
      <div className="px-4 py-2 border-b border-border/60 text-[11.5px] text-muted-foreground">
        Rumus {branch.afterBep ? "setelah" : "sebelum"} BEP: Manajemen{" "}
        <strong className="text-foreground">{branch.mgmtPct}%</strong> · Investor{" "}
        <strong className="text-foreground">{100 - branch.mgmtPct}%</strong>{" "}
        (dibagi per porsi modal)
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2 text-left font-semibold">Penerima</th>
            <th className="px-4 py-2 text-right font-semibold">Porsi rumus</th>
            <th className="px-4 py-2 text-right font-semibold">% dari pool</th>
            <th className="px-4 py-2 text-right font-semibold">Nominal transfer</th>
            <th className="px-4 py-2 text-right font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {branch.rows.map((r) => {
            const val = amounts[r.recipientId] ?? 0;
            const ofPool = sum > 0 ? (val / sum) * 100 : null;
            const invShare =
              r.kind === "investor"
                ? investorPoolSharePct(
                    r.investIdr,
                    r.poolPct,
                    branch.totalInvestmentIdr
                  )
                : null;
            return (
              <tr key={r.recipientId} className="border-t border-border/60">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">
                      {r.investorName ?? r.label}
                    </span>
                    {r.investorName && r.investorName !== r.label && (
                      <span className="text-[10.5px] text-muted-foreground">
                        ({r.label})
                      </span>
                    )}
                    {r.kind === "investor" && !r.contractId && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-600">
                        <Link2Off size={11} /> belum tersambung
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right text-[12px] text-muted-foreground whitespace-nowrap">
                  {r.kind === "management"
                    ? `${branch.mgmtPct}% pool`
                    : invShare != null
                      ? `${fmtPct(invShare)}% pool investor`
                      : "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[12px] text-muted-foreground">
                  {ofPool == null ? "—" : `${fmtPct(ofPool)}%`}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatIDR(val)}
                    onChange={(e) =>
                      setAmount(r.recipientId, parseAmount(e.target.value))
                    }
                    className="w-32 rounded-lg border border-border bg-background px-2.5 py-1.5 text-right font-mono tabular-nums text-foreground"
                  />
                </td>
                <td className="px-4 py-2.5 text-right text-[11.5px]">
                  {r.payout ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600">
                      <Check size={13} />
                      {r.payout.paidAt ? formatDateID(r.payout.paidAt) : "tersinkron"}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/60">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-border bg-muted/30 font-semibold">
            <td className="px-4 py-2.5">Pool dividen (transfer)</td>
            <td className="px-4 py-2.5" />
            <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
              {sum > 0 ? "100%" : "—"}
            </td>
            <td className="px-4 py-2.5 text-right font-mono tabular-nums">
              {formatRp(sum)}
            </td>
            <td className="px-4 py-2.5" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Cross-branch investor view ─────────────────────────────────────────
function InvestorCrossBranchTable({
  data,
  amounts,
}: {
  data: DividendConsoleData;
  amounts: Record<string, number>;
}) {
  const liveSliceDue = (recipientId: string | null, fallback: number) =>
    recipientId != null ? amounts[recipientId] ?? fallback : fallback;

  const grand = data.investors.reduce(
    (acc, inv) => {
      const due = inv.slices.reduce(
        (s, sl) => s + liveSliceDue(sl.recipientId, sl.dueThisMonth),
        0
      );
      acc.due += due;
      acc.cum += inv.totalCumulative;
      return acc;
    },
    { due: 0, cum: 0 }
  );
  // Slot investor yang belum tersambung kontrak ikut masuk grand total due.
  for (const u of data.unlinkedRecipients)
    grand.due += amounts[u.recipientId] ?? u.due;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <span className="text-sm font-bold text-foreground">
          Per investor — lintas cabang
        </span>
        <span className="ml-2 text-[12px] text-muted-foreground">
          satu baris per investor; sub-baris per cabang
        </span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2 text-left font-semibold">Investor</th>
            <th className="px-4 py-2 text-left font-semibold">Cabang</th>
            <th className="px-4 py-2 text-right font-semibold">Due bulan ini</th>
            <th className="px-4 py-2 text-right font-semibold">Kumulatif</th>
            <th className="px-4 py-2 text-right font-semibold">BEP</th>
          </tr>
        </thead>
        <tbody>
          {data.management && (data.management.totalCumulative > 0 ||
            data.management.totalDue > 0) && (
            <FragmentInvestor
              name="Manajemen"
              multiBranch
              liveDue={data.management.slices.reduce(
                (s, sl) => s + liveSliceDue(sl.recipientId, sl.due),
                0
              )}
              totalCumulative={data.management.totalCumulative}
              totalBepTarget={0}
              totalBepPct={0}
              slices={data.management.slices.map((sl) => ({
                branch: sl.branch,
                bankName: null,
                rekeningNumber: null,
                permanent: false,
                due: liveSliceDue(sl.recipientId, sl.due),
                cumulativePayout: sl.cumulative,
                bepTargetIdr: 0,
                bepPct: 0,
              }))}
            />
          )}
          {data.investors.map((inv) => {
            const liveDue = inv.slices.reduce(
              (s, sl) => s + liveSliceDue(sl.recipientId, sl.dueThisMonth),
              0
            );
            return (
              <FragmentInvestor
                key={inv.userId}
                name={inv.name}
                multiBranch={inv.multiBranch}
                liveDue={liveDue}
                totalCumulative={inv.totalCumulative}
                totalBepTarget={inv.totalBepTarget}
                totalBepPct={inv.totalBepPct}
                slices={inv.slices.map((sl) => ({
                  branch: sl.branch,
                  bankName: sl.bankName,
                  rekeningNumber: sl.rekeningNumber,
                  permanent: sl.permanent,
                  due: liveSliceDue(sl.recipientId, sl.dueThisMonth),
                  cumulativePayout: sl.cumulativePayout,
                  bepTargetIdr: sl.bepTargetIdr,
                  bepPct: sl.bepPct,
                }))}
              />
            );
          })}
          {data.unlinkedRecipients.map((u) => {
            const due = amounts[u.recipientId] ?? u.due;
            return (
              <tr
                key={u.recipientId}
                className="border-t border-border bg-muted/20"
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{u.label}</span>
                    <span className="inline-flex items-center gap-1 text-[10px] text-amber-600">
                      <Link2Off size={11} /> belum tersambung
                    </span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-[12px] text-muted-foreground">
                  {u.branch}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold">
                  {formatRp(due)}
                </td>
                <td className="px-4 py-2.5 text-right text-[11px] text-muted-foreground/60">
                  —
                </td>
                <td className="px-4 py-2.5 text-right text-[11px] text-muted-foreground/60">
                  belum ada BEP
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border bg-muted/40 font-semibold">
            <td className="px-4 py-2.5" colSpan={2}>
              Total semua investor
            </td>
            <td className="px-4 py-2.5 text-right font-mono tabular-nums">
              {formatRp(grand.due)}
            </td>
            <td className="px-4 py-2.5 text-right font-mono tabular-nums">
              {formatRp(grand.cum)}
            </td>
            <td className="px-4 py-2.5" />
          </tr>
        </tfoot>
      </table>

      {data.unlinkedRecipients.length > 0 && (
        <div className="border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
          <Link2Off size={11} className="inline mr-1" />
          Slot &quot;belum tersambung&quot; akan otomatis masuk riwayat bagi
          hasil investor begitu di-link ke kontraknya (tab Dividen Yeobo).
        </div>
      )}
    </div>
  );
}

function FragmentInvestor({
  name,
  multiBranch,
  liveDue,
  totalCumulative,
  totalBepTarget,
  totalBepPct,
  slices,
}: {
  name: string;
  multiBranch: boolean;
  liveDue: number;
  totalCumulative: number;
  totalBepTarget: number;
  totalBepPct: number;
  slices: Array<{
    branch: string | null;
    bankName: string | null;
    rekeningNumber: string | null;
    permanent: boolean;
    due: number;
    cumulativePayout: number;
    bepTargetIdr: number;
    bepPct: number;
  }>;
}) {
  const bank = slices.find((s) => s.bankName || s.rekeningNumber);
  return (
    <>
      <tr className="border-t border-border bg-muted/20">
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">{name}</span>
            {multiBranch && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                {slices.length} cabang
              </span>
            )}
          </div>
          {bank && (bank.bankName || bank.rekeningNumber) && (
            <span className="text-[11px] text-muted-foreground">
              {[bank.bankName, bank.rekeningNumber].filter(Boolean).join(" · ")}
            </span>
          )}
        </td>
        <td className="px-4 py-2.5 text-[12px] text-muted-foreground">
          {multiBranch ? "—" : slices[0]?.branch ?? "—"}
        </td>
        <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold">
          {formatRp(liveDue)}
        </td>
        <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold">
          {formatRp(totalCumulative)}
        </td>
        <td className="px-4 py-2.5 text-right">
          {totalBepTarget > 0 ? (
            <BepBar pct={totalBepPct} />
          ) : (
            <span className="text-[11px] text-muted-foreground/60">—</span>
          )}
        </td>
      </tr>
      {multiBranch &&
        slices.map((sl, i) => (
          <tr key={i} className="border-t border-border/40 text-[12.5px]">
            <td className="px-4 py-1.5 pl-8 text-muted-foreground">↳</td>
            <td className="px-4 py-1.5 text-muted-foreground">
              {sl.branch ?? "—"}
              {sl.permanent && (
                <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[9px] uppercase text-muted-foreground">
                  permanen
                </span>
              )}
            </td>
            <td className="px-4 py-1.5 text-right font-mono tabular-nums">
              {formatRp(sl.due)}
            </td>
            <td className="px-4 py-1.5 text-right font-mono tabular-nums">
              {formatRp(sl.cumulativePayout)}
            </td>
            <td className="px-4 py-1.5 text-right">
              {sl.bepTargetIdr > 0 ? (
                <BepBar pct={sl.bepPct} small />
              ) : (
                <span className="text-[11px] text-muted-foreground/60">—</span>
              )}
            </td>
          </tr>
        ))}
    </>
  );
}

function BepBar({ pct, small }: { pct: number; small?: boolean }) {
  const done = pct >= 100;
  return (
    <div className="inline-flex items-center gap-2">
      <div
        className={`${small ? "w-16" : "w-20"} h-1.5 rounded-full bg-muted overflow-hidden`}
      >
        <div
          className={`h-full rounded-full ${done ? "bg-emerald-500" : "bg-primary"}`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
      <span className="font-mono tabular-nums text-[11px] text-muted-foreground">
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

// ── Payout history ─────────────────────────────────────────────────────
function PayoutHistory({ data }: { data: DividendConsoleData }) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <span className="text-sm font-bold text-foreground">
          Riwayat payout (bulan sebelumnya)
        </span>
      </div>
      <div className="divide-y divide-border/60">
        {data.history.map((h) => (
          <div key={`${h.year}-${h.month}`} className="px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-foreground">
                {MONTH_FULL_NAMES[h.month - 1]} {h.year}
              </span>
              <span className="font-mono tabular-nums text-[13px] font-semibold text-foreground">
                {formatRp(h.total)}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
              {h.entries.map((e, i) => (
                <span key={i}>
                  {e.investorName}
                  {e.branch ? ` (${e.branch})` : ""}:{" "}
                  <span className="font-mono tabular-nums text-foreground">
                    {formatIDR(e.amountIdr)}
                  </span>
                  {e.paidAt ? ` · ${formatDateID(e.paidAt)}` : ""}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
