"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Calculator,
  Eraser,
  HandCoins,
  Link2Off,
  Check,
  Send,
  TriangleAlert,
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
/** Sama seperti parseAmount, tapi input kosong = null (pool "belum
 *  dideklarasikan"), bukan 0 (pool "sengaja dideklarasikan nol"). */
function parsePoolInput(s: string): number | null {
  const digits = s.replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : null;
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

/** Hitung split rumus untuk satu cabang dengan basis (pool) tertentu —
 *  dipakai untuk preview LIVE di klien; server menghitung ulang yang sama
 *  persis saat save (lihat computeRecipientAmounts di
 *  saveDividendConsoleMonth) supaya keduanya tidak pernah berbeda. */
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
  basePath,
}: {
  data: DividendConsoleData;
  minYm: string;
  maxYm: string;
  /**
   * Awalan URL untuk navigasi bulan, HARUS berakhir dengan `?` atau `&`.
   *
   * WAJIB, tanpa default. Sebelumnya default-nya "/admin/finance/dividen?" —
   * dan rute itu sekarang cuma redirect ke tab Distribusi, jadi pemanggil yang
   * lupa mengisi prop ini akan mengirim pengguna memantul lewat redirect tiap
   * kali mengganti bulan. Konsolnya hanya punya satu tempat render sekarang;
   * default yang menunjuk pintu lama tidak punya pengguna sah lagi.
   */
  basePath: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Nominal transfer per recipient (init: allocation tersimpan ?? 0 — tanpa
  // auto-prefill; admin pakai tombol "Isi dari op profit" / "Bayar penuh").
  const [amounts, setAmounts] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const b of data.branches)
      for (const r of b.rows) init[r.recipientId] = r.savedAllocation ?? 0;
    return init;
  });
  // Pool dividen yang dideklarasikan per cabang — sumber kebenaran "hak"
  // (entitlement). null = belum dideklarasikan. Seed dari nilai server bila
  // bulan ini sudah pernah dideklarasikan.
  const [declaredPool, setDeclaredPoolState] = useState<Record<string, number | null>>(
    () => {
      const init: Record<string, number | null> = {};
      for (const b of data.branches) init[b.branch] = b.declaredPool;
      return init;
    }
  );
  const setDeclaredPool = (branch: string, v: number | null) =>
    setDeclaredPoolState((prev) => ({ ...prev, [branch]: v }));

  // Tanggal transfer: seed dari payout PALING AWAL yang sudah tersimpan
  // bulan ini (bukan selalu hari ini) — supaya membuka & menyimpan ulang
  // bulan LAMPAU (mis. untuk mendeklarasikan pool susulan) tidak diam-diam
  // menimpa tanggal transfer asli seluruh payout bulan itu dengan hari ini.
  const [paidAt, setPaidAt] = useState<string>(() => {
    let earliest: string | null = null;
    for (const b of data.branches)
      for (const r of b.rows) {
        const d = r.payout?.paidAt?.slice(0, 10);
        if (d && (earliest == null || d < earliest)) earliest = d;
      }
    return earliest ?? new Date().toISOString().slice(0, 10);
  });
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
    router.push(`${basePath}month=${ymStr(y, m)}`);

  // Σ transfer per cabang (live).
  const branchSum = useMemo(() => {
    const m: Record<string, number> = {};
    for (const b of data.branches)
      m[b.branch] = b.rows.reduce((s, r) => s + (amounts[r.recipientId] ?? 0), 0);
    return m;
  }, [data.branches, amounts]);

  // Hak (entitlement) LIVE per cabang, dari pool yang sedang dideklarasikan
  // di form (bukan dari nilai beku server) — supaya "Hak bulan ini" &
  // tombol "Bayar penuh" langsung bereaksi begitu admin mengubah pool.
  const liveEntitlement = useMemo(() => {
    const m: Record<string, Record<string, number>> = {};
    for (const b of data.branches) {
      const pool = declaredPool[b.branch];
      m[b.branch] = pool != null ? splitForBranch(b, pool) : {};
    }
    return m;
  }, [data.branches, declaredPool]);

  // Cabang yang akan disimpan: ada nominal transfer > 0, ATAU sudah pernah
  // tersimpan (agar bisa dikoreksi), ATAU pool baru saja dideklarasikan
  // (agar skenario "deklarasikan pool, transfer 0 ke semua" bisa disimpan).
  const submittable = data.branches.filter(
    (b) => branchSum[b.branch] > 0 || b.savedExists || declaredPool[b.branch] != null
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
      declaredPool: declaredPool[b.branch] ?? null,
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
      const skipped = res.data?.skippedRecipients ?? 0;
      toast.success(
        `Tersimpan — ${res.data?.savedBranches} cabang, ${res.data?.syncedPayouts} payout investor disinkron.` +
          (skipped > 0
            ? ` ${skipped} penerima baru dilewati (belum ada saat bulan ini pertama dideklarasikan).`
            : "")
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

      {data.orphanArrears.length > 0 && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-[12.5px] text-amber-700">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">
              Ada tunggakan milik penerima yang sudah tidak aktif di roster
            </p>
            <ul className="mt-1 space-y-0.5">
              {data.orphanArrears.map((o) => (
                <li key={o.recipientId}>
                  {o.label}: <span className="font-mono tabular-nums">{formatRp(o.arrears)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* 2. Branch summary cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        {data.branches.map((b) => {
          const transferred = branchSum[b.branch] ?? 0;
          const kasIni =
            b.kasLastMonth == null
              ? null
              : b.kasLastMonth + b.operatingProfit - transferred;
          const pool = declaredPool[b.branch];
          const drift =
            b.declaredPool != null ? b.operatingProfit - b.declaredPool : null;
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
                <Stat
                  label="Pool dividen (deklarasi)"
                  value={pool == null ? "—" : formatRp(pool)}
                  tone="fg"
                  strong
                />
                <Stat
                  label="Tunggakan masuk"
                  value={b.arrearsBefore === 0 ? "—" : formatRp(b.arrearsBefore)}
                  tone={b.arrearsBefore > 0 ? "amber" : b.arrearsBefore < 0 ? "muted" : "muted"}
                />
                <Stat label="Ditransfer" value={formatRp(transferred)} tone="fg" />
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
              {drift != null && drift !== 0 && (
                <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-700">
                  <span>
                    Pool dideklarasikan {drift > 0 ? "kurang" : "lebih"}{" "}
                    <span className="font-mono tabular-nums">{formatRp(Math.abs(drift))}</span>{" "}
                    dari op profit sekarang
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setDeclaredPool(b.branch, Math.max(0, Math.round(b.operatingProfit)))
                    }
                    className="shrink-0 rounded-full border border-amber-600/30 px-2 py-0.5 font-semibold hover:bg-amber-500/10"
                  >
                    Sesuaikan
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 3. Per-branch allocation tables */}
      <div className="space-y-4">
        {data.branches.map((b) => {
          const kasIni =
            b.kasLastMonth == null
              ? null
              : b.kasLastMonth + b.operatingProfit - (branchSum[b.branch] ?? 0);
          return (
          <BranchAllocationTable
            key={b.branch}
            branch={b}
            amounts={amounts}
            setAmount={setAmount}
            declaredPool={declaredPool[b.branch] ?? null}
            onPoolChange={(v) => setDeclaredPool(b.branch, v)}
            liveEntitlement={liveEntitlement[b.branch] ?? {}}
            kasIni={kasIni}
            onFillPool={() =>
              setDeclaredPool(b.branch, Math.max(0, Math.round(kasIni ?? 0)))
            }
            onFillFull={() => {
              const ent = liveEntitlement[b.branch] ?? {};
              const values: Record<string, number> = {};
              for (const r of b.rows)
                values[r.recipientId] = Math.max(0, (ent[r.recipientId] ?? 0) + r.arrearsBefore);
              applyValues(values);
            }}
            onClear={() =>
              applyValues(
                Object.fromEntries(b.rows.map((r) => [r.recipientId, 0]))
              )
            }
          />
          );
        })}
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
          rekening koran. Menyimpan ulang menimpa nominal transfer bulan ini
          (tanggal transfer tidak ikut tertimpa bila sudah ada sebelumnya).
          Nominal transfer yang lebih kecil dari hak + tunggakan otomatis
          tercatat sebagai tunggakan baru dan terbawa ke bulan berikutnya —
          milik penerima itu sendiri, tidak pernah ke penerima lain.
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
  tone?: "fg" | "muted" | "neg" | "amber";
  strong?: boolean;
}) {
  const toneCls =
    tone === "neg"
      ? "text-destructive"
      : tone === "amber"
        ? "text-amber-600"
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
  amounts,
  setAmount,
  declaredPool,
  onPoolChange,
  liveEntitlement,
  kasIni,
  onFillPool,
  onFillFull,
  onClear,
}: {
  branch: ConsoleBranch;
  amounts: Record<string, number>;
  setAmount: (id: string, v: number) => void;
  declaredPool: number | null;
  onPoolChange: (v: number | null) => void;
  liveEntitlement: Record<string, number>;
  kasIni: number | null;
  onFillPool: () => void;
  onFillFull: () => void;
  onClear: () => void;
}) {
  const sum = branch.rows.reduce((s, r) => s + (amounts[r.recipientId] ?? 0), 0);
  const poolFilled = declaredPool != null;
  const transferFilled = sum > 0;
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-foreground">{branch.branch}</span>
          <label className="flex items-center gap-1.5">
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
              Pool
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={declaredPool == null ? "" : formatIDR(declaredPool)}
              onChange={(e) => onPoolChange(parsePoolInput(e.target.value))}
              placeholder="belum dideklarasikan"
              className="w-40 rounded-lg border border-border bg-background px-2.5 py-1.5 text-right font-mono tabular-nums text-foreground placeholder:text-[11px] placeholder:font-sans"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {poolFilled ? (
            <button
              type="button"
              onClick={() => onPoolChange(null)}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted"
            >
              <Eraser size={12} /> Kosongkan pool
            </button>
          ) : (
            <button
              type="button"
              onClick={onFillPool}
              disabled={kasIni == null}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted disabled:opacity-40 disabled:pointer-events-none"
              title={kasIni == null ? "Kas belum berlaku (sebelum Mei 2026)" : `Set pool = kas bulan ini (${formatRp(Math.max(0, kasIni))})`}
            >
              <Calculator size={12} /> Isi dari kas bulan ini
            </button>
          )}
          {transferFilled ? (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted"
            >
              <Eraser size={12} /> Kosongkan transfer
            </button>
          ) : (
            <button
              type="button"
              onClick={onFillFull}
              disabled={declaredPool == null}
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/15 disabled:opacity-40 disabled:pointer-events-none"
              title="Isi nominal transfer = hak bulan ini + tunggakan, untuk semua penerima"
            >
              <HandCoins size={12} /> Bayar penuh
            </button>
          )}
        </div>
      </div>

      {/* Rumus pembagian cabang ini */}
      <div className="px-4 py-2 border-b border-border/60 text-[11.5px] text-muted-foreground">
        Rumus {branch.afterBep ? "setelah" : "sebelum"} BEP: Manajemen{" "}
        <strong className="text-foreground">{branch.mgmtPct}%</strong> · Investor{" "}
        <strong className="text-foreground">{100 - branch.mgmtPct}%</strong>{" "}
        (dibagi per porsi modal). Pool yang belum ditransfer penuh tetap di
        Kas sebagai tunggakan milik penerimanya — bukan pool baru untuk
        dibagi ulang.
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2 text-left font-semibold">Penerima</th>
              <th className="px-4 py-2 text-right font-semibold">Porsi rumus</th>
              <th className="px-4 py-2 text-right font-semibold">Hak bulan ini</th>
              <th className="px-4 py-2 text-right font-semibold">Tunggakan</th>
              <th className="px-4 py-2 text-right font-semibold">Total hak</th>
              <th className="px-4 py-2 text-right font-semibold">Nominal transfer</th>
              <th className="px-4 py-2 text-right font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {branch.rows.map((r) => {
              const val = amounts[r.recipientId] ?? 0;
              const entitlement = liveEntitlement[r.recipientId] ?? null;
              const totalHak =
                entitlement != null ? entitlement + r.arrearsBefore : null;
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
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[12.5px] text-foreground">
                    {entitlement == null ? "—" : formatRp(entitlement)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[12.5px]">
                    {r.arrearsBefore === 0 ? (
                      <span className="text-muted-foreground/60">—</span>
                    ) : r.arrearsBefore > 0 ? (
                      <span className="text-amber-600">{formatRp(r.arrearsBefore)}</span>
                    ) : (
                      <span className="text-muted-foreground">
                        Lebih bayar {formatRp(Math.abs(r.arrearsBefore))}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[12.5px] font-semibold text-foreground">
                    {totalHak == null ? "—" : formatRp(totalHak)}
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
                    {totalHak != null && val !== totalHak && (
                      <div className="mt-0.5 text-right text-[10.5px] text-muted-foreground">
                        {val < totalHak
                          ? `kurang ${formatRp(totalHak - val)}`
                          : `lebih ${formatRp(val - totalHak)}`}
                      </div>
                    )}
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
              <td className="px-4 py-2.5">Total</td>
              <td className="px-4 py-2.5" />
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                {branch.declaredPool == null && declaredPool == null
                  ? "—"
                  : formatRp(
                      branch.rows.reduce(
                        (s, r) => s + (liveEntitlement[r.recipientId] ?? 0),
                        0
                      )
                    )}
              </td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                {formatRp(branch.arrearsBefore)}
              </td>
              <td className="px-4 py-2.5" />
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                {formatRp(sum)}
              </td>
              <td className="px-4 py-2.5" />
            </tr>
          </tfoot>
        </table>
      </div>
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
      const transferred = inv.slices.reduce(
        (s, sl) => s + liveSliceDue(sl.recipientId, sl.transferredThisMonth),
        0
      );
      acc.transferred += transferred;
      acc.arrears += inv.totalArrears;
      acc.cum += inv.totalCumulative;
      return acc;
    },
    { transferred: 0, arrears: 0, cum: 0 }
  );
  // Slot investor yang belum tersambung kontrak ikut masuk grand total.
  for (const u of data.unlinkedRecipients) {
    grand.transferred += amounts[u.recipientId] ?? u.due;
    grand.arrears += u.arrearsBefore;
    grand.cum += u.cumulative;
  }
  const mgmtArrears = data.management.slices.reduce((s, sl) => s + sl.arrearsBefore, 0);

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
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2 text-left font-semibold">Investor</th>
              <th className="px-4 py-2 text-left font-semibold">Cabang</th>
              <th className="px-4 py-2 text-right font-semibold">Tunggakan</th>
              <th className="px-4 py-2 text-right font-semibold">Ditransfer</th>
              <th className="px-4 py-2 text-right font-semibold">Kumulatif</th>
              <th className="px-4 py-2 text-right font-semibold">BEP</th>
            </tr>
          </thead>
          <tbody>
            {data.management &&
              (data.management.totalCumulative > 0 || data.management.totalDue > 0 || mgmtArrears !== 0) && (
                <FragmentInvestor
                  name="Manajemen"
                  multiBranch
                  liveTransferred={data.management.slices.reduce(
                    (s, sl) => s + liveSliceDue(sl.recipientId, sl.due),
                    0
                  )}
                  totalArrears={mgmtArrears}
                  totalCumulative={data.management.totalCumulative}
                  totalBepTarget={0}
                  totalBepPct={0}
                  slices={data.management.slices.map((sl) => ({
                    branch: sl.branch,
                    bankName: null,
                    rekeningNumber: null,
                    permanent: false,
                    transferred: liveSliceDue(sl.recipientId, sl.due),
                    arrearsBefore: sl.arrearsBefore,
                    cumulativePayout: sl.cumulative,
                    bepTargetIdr: 0,
                    bepPct: 0,
                  }))}
                />
              )}
            {data.investors.map((inv) => {
              const liveTransferred = inv.slices.reduce(
                (s, sl) => s + liveSliceDue(sl.recipientId, sl.transferredThisMonth),
                0
              );
              return (
                <FragmentInvestor
                  key={inv.userId}
                  name={inv.name}
                  multiBranch={inv.multiBranch}
                  liveTransferred={liveTransferred}
                  totalArrears={inv.totalArrears}
                  totalCumulative={inv.totalCumulative}
                  totalBepTarget={inv.totalBepTarget}
                  totalBepPct={inv.totalBepPct}
                  slices={inv.slices.map((sl) => ({
                    branch: sl.branch,
                    bankName: sl.bankName,
                    rekeningNumber: sl.rekeningNumber,
                    permanent: sl.permanent,
                    transferred: liveSliceDue(sl.recipientId, sl.transferredThisMonth),
                    arrearsBefore: sl.arrearsBefore,
                    cumulativePayout: sl.cumulativePayout,
                    bepTargetIdr: sl.bepTargetIdr,
                    bepPct: sl.bepPct,
                  }))}
                />
              );
            })}
            {groupUnlinked(data.unlinkedRecipients).map((g) => (
              <FragmentUnlinked
                key={g.key}
                name={g.name}
                items={g.items.map((u) => ({
                  recipientId: u.recipientId,
                  branch: u.branch,
                  transferred: amounts[u.recipientId] ?? u.due,
                  arrearsBefore: u.arrearsBefore,
                  cumulative: u.cumulative,
                }))}
              />
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/40 font-semibold">
              <td className="px-4 py-2.5" colSpan={2}>
                Total semua investor
              </td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                {formatRp(grand.arrears)}
              </td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                {formatRp(grand.transferred)}
              </td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                {formatRp(grand.cum)}
              </td>
              <td className="px-4 py-2.5" />
            </tr>
          </tfoot>
        </table>
      </div>

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
  liveTransferred,
  totalArrears,
  totalCumulative,
  totalBepTarget,
  totalBepPct,
  slices,
}: {
  name: string;
  multiBranch: boolean;
  liveTransferred: number;
  totalArrears: number;
  totalCumulative: number;
  totalBepTarget: number;
  totalBepPct: number;
  slices: Array<{
    branch: string | null;
    bankName: string | null;
    rekeningNumber: string | null;
    permanent: boolean;
    transferred: number;
    arrearsBefore: number;
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
          {totalArrears === 0 ? (
            <span className="text-muted-foreground/60 font-normal">—</span>
          ) : totalArrears > 0 ? (
            <span className="text-amber-600">{formatRp(totalArrears)}</span>
          ) : (
            <span className="text-muted-foreground font-normal">
              Lebih {formatRp(Math.abs(totalArrears))}
            </span>
          )}
        </td>
        <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold">
          {formatRp(liveTransferred)}
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
              {sl.arrearsBefore === 0 ? (
                <span className="text-muted-foreground/60">—</span>
              ) : sl.arrearsBefore > 0 ? (
                <span className="text-amber-600">{formatRp(sl.arrearsBefore)}</span>
              ) : (
                formatRp(sl.arrearsBefore)
              )}
            </td>
            <td className="px-4 py-1.5 text-right font-mono tabular-nums">
              {formatRp(sl.transferred)}
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

// Gabungkan slot "belum tersambung" milik 1 orang (placeholder lintas cabang)
// jadi satu grup. Kunci: claim_token → placeholder_name → recipientId (standalone).
type UnlinkedItem = DividendConsoleData["unlinkedRecipients"][number];
function groupUnlinked(
  list: UnlinkedItem[]
): Array<{ key: string; name: string; items: UnlinkedItem[] }> {
  const map = new Map<string, { key: string; name: string; items: UnlinkedItem[] }>();
  for (const u of list) {
    const key = u.claimToken
      ? `t:${u.claimToken}`
      : u.placeholderName
        ? `n:${u.placeholderName.toLowerCase()}`
        : `r:${u.recipientId}`;
    const g =
      map.get(key) ?? { key, name: u.placeholderName || u.label, items: [] };
    g.items.push(u);
    map.set(key, g);
  }
  return [...map.values()];
}

function FragmentUnlinked({
  name,
  items,
}: {
  name: string;
  items: Array<{
    recipientId: string;
    branch: string;
    transferred: number;
    arrearsBefore: number;
    cumulative: number;
  }>;
}) {
  const multi = items.length > 1;
  const totalTransferred = items.reduce((s, x) => s + x.transferred, 0);
  const totalArrears = items.reduce((s, x) => s + x.arrearsBefore, 0);
  const totalCum = items.reduce((s, x) => s + x.cumulative, 0);
  return (
    <>
      <tr className="border-t border-border bg-muted/20">
        <td className="px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">{name}</span>
            {multi && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                {items.length} cabang
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[10px] text-amber-600">
              <Link2Off size={11} /> belum tersambung
            </span>
          </div>
        </td>
        <td className="px-4 py-2.5 text-[12px] text-muted-foreground">
          {multi ? "—" : items[0]?.branch ?? "—"}
        </td>
        <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold">
          {totalArrears === 0 ? (
            <span className="text-muted-foreground/60 font-normal">—</span>
          ) : (
            formatRp(totalArrears)
          )}
        </td>
        <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold">
          {formatRp(totalTransferred)}
        </td>
        <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold">
          {totalCum > 0 ? formatRp(totalCum) : "—"}
        </td>
        <td className="px-4 py-2.5 text-right text-[11px] text-muted-foreground/60">
          belum ada BEP
        </td>
      </tr>
      {multi &&
        items.map((it) => (
          <tr
            key={it.recipientId}
            className="border-t border-border/40 text-[12.5px]"
          >
            <td className="px-4 py-1.5 pl-8 text-muted-foreground">↳</td>
            <td className="px-4 py-1.5 text-muted-foreground">{it.branch}</td>
            <td className="px-4 py-1.5 text-right font-mono tabular-nums">
              {it.arrearsBefore === 0 ? (
                <span className="text-muted-foreground/60">—</span>
              ) : (
                formatRp(it.arrearsBefore)
              )}
            </td>
            <td className="px-4 py-1.5 text-right font-mono tabular-nums">
              {formatRp(it.transferred)}
            </td>
            <td className="px-4 py-1.5 text-right font-mono tabular-nums">
              {it.cumulative > 0 ? formatRp(it.cumulative) : "—"}
            </td>
            <td className="px-4 py-1.5 text-right text-[11px] text-muted-foreground/60">
              belum ada BEP
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
/**
 * Riwayat payout per periode.
 *
 * Versi sebelumnya menuang semua entri sebagai satu paragraf
 * "Nama (Cabang): nominal · tanggal" yang membungkus baris. Tiga hal membuatnya
 * tidak bisa dibaca: tanggal transfer diulang di SETIAP entri padahal satu
 * batch = satu tanggal (sepuluh kali "15 Jul 2026"), nominalnya mengalir di
 * tengah teks sehingga tidak bisa dibandingkan antar penerima, dan dua belas
 * periode terbuka sekaligus.
 *
 * Jadi: tanggal naik ke header periode (turun ke baris HANYA kalau batchnya
 * memang beda-beda tanggal), nominal jadi kolom rata kanan yang bisa disusuri
 * mata, dan tiap periode bisa dilipat — periode terbaru terbuka.
 *
 * Dipakai <details>, bukan useState: panel ini tetap bisa dibuka-tutup walau
 * JS-nya belum sampai/hidrasi gagal.
 */
function PayoutHistory({ data }: { data: DividendConsoleData }) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-3 border-b border-border">
        <span className="text-sm font-bold text-foreground">Riwayat payout</span>
        <span className="text-[11px] text-muted-foreground">
          {data.history.length} periode sebelum{" "}
          {MONTH_FULL_NAMES[data.month - 1]} {data.year}
        </span>
      </div>
      <div className="divide-y divide-border/60">
        {data.history.map((h, idx) => {
          // Satu batch transfer umumnya satu tanggal untuk semua penerima —
          // kalau begitu tanggalnya milik PERIODE, bukan tiap baris.
          const dates = [...new Set(h.entries.map((e) => e.paidAt ?? ""))];
          const commonDate = dates.length === 1 && dates[0] ? dates[0] : null;
          // Investor multi-cabang menerima satu transfer per kontrak, jadi
          // jumlah baris > jumlah orang. Keduanya disebut supaya sepuluh baris
          // untuk tujuh orang tidak terbaca sebagai sepuluh orang.
          const people = new Set(h.entries.map((e) => e.investorName)).size;
          const rows = [...h.entries].sort(
            (a, b) =>
              a.investorName.localeCompare(b.investorName) ||
              (a.branch ?? "").localeCompare(b.branch ?? "")
          );
          return (
            <details key={`${h.year}-${h.month}`} open={idx === 0} className="group">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-0.5 px-4 py-2.5 hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
                <ChevronRight
                  size={14}
                  className="shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
                />
                <span className="text-[13px] font-semibold text-foreground">
                  {MONTH_FULL_NAMES[h.month - 1]} {h.year}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {people} investor
                  {rows.length !== people ? ` · ${rows.length} transfer` : ""}
                  {commonDate ? ` · ditransfer ${formatDateID(commonDate)}` : ""}
                </span>
                <span className="ml-auto font-mono tabular-nums text-[13px] font-semibold text-foreground">
                  {formatRp(h.total)}
                </span>
              </summary>
              <div className="pb-2">
                {rows.map((e, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 py-1 pl-10 pr-4 text-[12px] hover:bg-muted/30"
                  >
                    <span className="min-w-0 truncate text-foreground">
                      {e.investorName}
                      {e.branch && (
                        <span className="ml-1.5 rounded border border-border bg-muted px-1 py-px align-middle text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {e.branch}
                        </span>
                      )}
                      {!commonDate && e.paidAt && (
                        <span className="ml-1.5 text-[10.5px] text-muted-foreground">
                          {formatDateID(e.paidAt)}
                        </span>
                      )}
                    </span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {formatIDR(e.amountIdr)}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
