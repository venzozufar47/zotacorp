"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronLeft,
  Gift,
  ChevronRight,
  Loader2,
  MessageSquareWarning,
  MoreHorizontal,
  X,
} from "lucide-react";
import {
  bulkCalculatePayslips,
  bulkFinalizePayslipsForMonth,
  calculatePayslip,
  finalizePayslip,
  reopenPayslip,
} from "@/lib/actions/payslip.actions";
import { formatRp } from "@/lib/cashflow/format";
import {
  CompensationBasisSection,
  ExpandedDetail,
  ExpectedDaysSection,
  ExtraWorkSection,
  KindsByNameContext,
  OvertimePenaltySection,
  groupByBusinessUnit,
  type EmployeeRow,
  type ExtraWorkKindMeta,
} from "@/components/admin/PayslipVariablesEditor";

export type PayrollView = "slip" | "payments";

interface Props {
  rows: EmployeeRow[];
  month: number;
  year: number;
  view: PayrollView;
  bonusOpen: boolean;
  kindsByName: Record<string, ExtraWorkKindMeta>;
  /** Jumlah sanggahan + laporan kesalahan yang masih terbuka. */
  alertsCount: number;
  /** Dari alertsCount: yang masih aktif (belum ada tanggapan). */
  alertsActive: number;
  /** Panel sanggahan & laporan; dirender server, dibuka dengan chip. */
  alerts: ReactNode;
  /** Panel bonus cake; hanya dirender server saat bonusOpen. */
  bonus: ReactNode;
  /** Tampilan langkah Bayar (tabel pembayaran). */
  payments: ReactNode;
  /** Jumlah slip final yang belum dibayar, untuk lencana langkah Bayar. */
  unpaidCount: number;
}

type Stage = "none" | "draft" | "final" | "nosettings" | "pending";

function stageOf(r: EmployeeRow): Stage {
  if (!r.settings) return "nosettings";
  if (!r.settings.is_finalized) return "pending";
  if (!r.payslip) return "none";
  return r.payslip.status === "finalized" ? "final" : "draft";
}

const STAGE_LABEL: Record<Stage, string> = {
  nosettings: "Belum diatur",
  pending: "Pengaturan belum final",
  none: "Belum dihitung",
  draft: "Draft",
  final: "Final",
};

const STAGE_DOT: Record<Stage, string> = {
  nosettings: "bg-muted-foreground/40",
  pending: "bg-warning",
  none: "bg-warning",
  draft: "bg-primary",
  final: "bg-success",
};

const n = (v: unknown) => Number(v ?? 0) || 0;

export function PayrollFlow({
  rows,
  month,
  year,
  view,
  bonusOpen,
  kindsByName,
  alertsCount,
  alertsActive,
  alerts,
  bonus,
  payments,
  unpaidCount,
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  function setQuery(patch: Record<string, string | null>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    router.push(`/admin/payslips/variables?${params.toString()}`, {
      scroll: false,
    });
  }

  function shiftMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setQuery({
      month: String(d.getMonth() + 1),
      year: String(d.getFullYear()),
    });
  }

  const counts = useMemo(() => {
    const c = { none: 0, draft: 0, final: 0 };
    let net = 0;
    for (const r of rows) {
      const s = stageOf(r);
      if (s === "none" || s === "draft" || s === "final") c[s] += 1;
      if (r.payslip) net += n(r.payslip.net_total);
    }
    return { ...c, net };
  }, [rows]);

  const total = rows.length;
  const pct = (x: number) => (total > 0 ? (x / total) * 100 : 0);

  function bulkCalc(force: boolean) {
    setMenuOpen(false);
    startTransition(async () => {
      const res = await bulkCalculatePayslips(month, year, { force });
      const parts: string[] = [];
      if (res.calculatedCount > 0) parts.push(`${res.calculatedCount} dihitung`);
      if (res.cachedCount > 0) parts.push(`${res.cachedCount} tidak berubah`);
      if (res.skippedCount > 0) parts.push(`${res.skippedCount} dilewati (final)`);
      if (parts.length > 0) toast.success(parts.join(" · "));
      if (res.errorCount > 0) toast.error(`${res.errorCount} gagal dihitung`);
      else if (parts.length === 0) toast.info("Tidak ada slip untuk dihitung");
      router.refresh();
    });
  }

  function bulkFinalize() {
    if (counts.draft === 0) return;
    if (
      !confirm(
        `Finalisasi ${counts.draft} slip draft bulan ini? Setelah final, slip hanya bisa diubah dengan membuka kembali satu per satu.`
      )
    )
      return;
    startTransition(async () => {
      const res = await bulkFinalizePayslipsForMonth(month, year);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`${res.finalizedCount} slip difinalisasi`);
      router.refresh();
    });
  }

  // Satu tombol utama mengikuti tahap bulan ini.
  const primary =
    counts.none > 0
      ? { label: `Hitung ${counts.none} slip`, run: () => bulkCalc(false) }
      : counts.draft > 0
        ? { label: `Finalisasi ${counts.draft} draft`, run: bulkFinalize }
        : total > 0 && counts.final === total
          ? { label: "Lanjut ke bayar", run: () => setQuery({ view: "payments" }) }
          : null;

  const periodLabel = new Date(year, month - 1).toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });
  const openRow = rows.find((r) => r.userId === openId) ?? null;
  const groups = useMemo(() => groupByBusinessUnit(rows), [rows]);

  return (
    <KindsByNameContext.Provider value={kindsByName}>
      <div className="space-y-3">
        {/* Bilah atas: periode, langkah, aksi utama */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Bulan sebelumnya"
              className="size-10 sm:size-9 inline-flex items-center justify-center rounded-lg border border-border bg-card hover:bg-muted"
            >
              <ChevronLeft size={16} />
            </button>
            <input
              type="month"
              aria-label="Periode"
              value={`${year}-${String(month).padStart(2, "0")}`}
              onChange={(e) => {
                const [y, m] = e.target.value.split("-");
                if (y && m) setQuery({ year: y, month: String(Number(m)) });
              }}
              className="h-10 sm:h-9 rounded-lg border border-border bg-card px-3 text-sm font-semibold tabular-nums"
            />
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="Bulan berikutnya"
              className="size-10 sm:size-9 inline-flex items-center justify-center rounded-lg border border-border bg-card hover:bg-muted"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div
            role="tablist"
            aria-label="Langkah penggajian"
            className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5"
          >
            <StepButton
              active={view === "slip"}
              onClick={() => setQuery({ view: "variables" })}
              label="Periksa slip"
              badge={`${counts.final}/${total}`}
            />
            <StepButton
              active={view === "payments"}
              onClick={() => setQuery({ view: "payments" })}
              label="Bayar"
              badge={unpaidCount > 0 ? `${unpaidCount} belum` : undefined}
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setQuery({ bonus: "1", view: "variables" })}
              className="inline-flex items-center gap-1.5 h-10 sm:h-9 px-3 rounded-lg border border-border bg-card text-xs font-semibold hover:bg-muted"
            >
              <Gift size={14} />
              Bonus
            </button>
            {alertsCount > 0 && (
              <button
                type="button"
                onClick={() => setAlertsOpen((v) => !v)}
                aria-expanded={alertsOpen}
                className={
                  "inline-flex items-center gap-1.5 h-10 sm:h-9 px-3 rounded-lg border text-xs font-semibold text-foreground " +
                  (alertsActive > 0
                    ? "border-warning/50 bg-warning/10 hover:bg-warning/20"
                    : "border-border bg-card hover:bg-muted")
                }
              >
                <MessageSquareWarning size={14} />
                {alertsActive > 0 ? `${alertsActive} sanggahan` : "Riwayat sanggahan"}
              </button>
            )}
            {view === "slip" && (
              <>
                {primary && (
                  <button
                    type="button"
                    onClick={primary.run}
                    disabled={pending}
                    className="inline-flex items-center gap-1.5 h-10 sm:h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60"
                  >
                    {pending && <Loader2 size={14} className="animate-spin" />}
                    {primary.label}
                  </button>
                )}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMenuOpen((v) => !v)}
                    aria-label="Aksi lain"
                    aria-expanded={menuOpen}
                    className="size-10 sm:size-9 inline-flex items-center justify-center rounded-lg border border-border bg-card hover:bg-muted"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                  {menuOpen && (
                    <>
                      <button
                        type="button"
                        aria-label="Tutup menu"
                        className="fixed inset-0 z-30 cursor-default"
                        onClick={() => setMenuOpen(false)}
                      />
                      <div className="absolute right-0 top-full mt-1 z-40 w-64 rounded-xl border border-border bg-card shadow-lg p-1">
                        <MenuItem
                          onClick={() => bulkCalc(false)}
                          title="Hitung ulang semua"
                          hint="Hanya slip yang datanya berubah"
                        />
                        <MenuItem
                          onClick={() => bulkCalc(true)}
                          title="Hitung ulang paksa"
                          hint="Abaikan cache, hitung semua dari nol"
                        />
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {alertsOpen && alertsCount > 0 && <div className="space-y-3">{alerts}</div>}

        {view === "payments" ? (
          payments
        ) : (
          <>
            {/* Ringkasan satu baris + bilah progres */}
            <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground tabular-nums">
                    {total}
                  </span>{" "}
                  karyawan ·{" "}
                  <span className="tabular-nums">{counts.final}</span> final ·{" "}
                  <span className="tabular-nums">{counts.draft}</span> draft ·{" "}
                  <span className="tabular-nums">{counts.none}</span> belum
                  dihitung
                </p>
                <p className="text-sm text-muted-foreground">
                  Total bersih{" "}
                  <span className="font-bold text-foreground tabular-nums">
                    {formatRp(counts.net)}
                  </span>
                </p>
              </div>
              <div
                className="flex h-1.5 overflow-hidden rounded-full bg-muted"
                role="img"
                aria-label={`${counts.final} final, ${counts.draft} draft, ${counts.none} belum dihitung dari ${total}`}
              >
                <span className="bg-success" style={{ width: `${pct(counts.final)}%` }} />
                <span className="bg-primary" style={{ width: `${pct(counts.draft)}%` }} />
              </div>
            </div>

            {/* Daftar ringkas: ketuk baris untuk detail */}
            {total === 0 ? (
              <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                Tidak ada karyawan di penggajian.
              </p>
            ) : (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="hidden md:grid grid-cols-[1fr_7rem_7rem_8rem_1.5rem] gap-3 px-4 py-2 border-b border-border text-[11px] font-medium text-muted-foreground">
                  <span>Karyawan</span>
                  <span className="text-right">Bonus</span>
                  <span className="text-right">Potongan</span>
                  <span className="text-right">Bersih</span>
                  <span />
                </div>
                {groups.map((g) => (
                  <div key={g.name}>
                    <p className="px-4 py-1.5 bg-muted/40 text-[11px] font-semibold text-muted-foreground">
                      {g.name} · {g.rows.length}
                    </p>
                    <ul>
                      {g.rows.map((r) => (
                        <EmployeeLine
                          key={r.userId}
                          row={r}
                          onOpen={() => setOpenId(r.userId)}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

          </>
        )}
      </div>

      {bonusOpen && (
        <SideDrawer
          title="Bonus"
          subtitle={periodLabel}
          onClose={() => setQuery({ bonus: null })}
        >
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {bonus}
          </div>
        </SideDrawer>
      )}

      {openRow && (
        <EmployeeDrawer
          row={openRow}
          month={month}
          year={year}
          onClose={() => setOpenId(null)}
        />
      )}
    </KindsByNameContext.Provider>
  );
}

function StepButton({
  active,
  onClick,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        "inline-flex items-center gap-2 h-9 sm:h-8 px-3 rounded-md text-sm font-medium transition-colors motion-reduce:transition-none " +
        (active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground")
      }
    >
      {label}
      {badge && (
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {badge}
        </span>
      )}
    </button>
  );
}

function MenuItem({
  onClick,
  title,
  hint,
}: {
  onClick: () => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-lg px-3 py-2 hover:bg-muted"
    >
      <span className="block text-sm font-medium">{title}</span>
      <span className="block text-xs text-muted-foreground">{hint}</span>
    </button>
  );
}

function EmployeeLine({
  row,
  onOpen,
}: {
  row: EmployeeRow;
  onOpen: () => void;
}) {
  const s = stageOf(row);
  const p = row.payslip;
  const deductions = p
    ? n(p.late_penalty) + n(p.debt_deduction) + n(p.other_penalty)
    : 0;
  const bonus = p
    ? n(p.bonus_day_pay) + n(p.monthly_bonus) + n(p.cake_bonus)
    : 0;
  return (
    <li className="border-t border-border/60 first:border-t-0">
      <button
        type="button"
        onClick={onOpen}
        className="w-full grid grid-cols-[1fr_auto_1rem] md:grid-cols-[1fr_7rem_7rem_8rem_1.5rem] items-center gap-3 px-4 min-h-14 text-left hover:bg-muted/50"
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium truncate">{row.fullName}</span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={"size-1.5 rounded-full " + STAGE_DOT[s]} aria-hidden />
            {STAGE_LABEL[s]}
          </span>
        </span>
        <span className="hidden md:block text-right text-sm tabular-nums text-muted-foreground">
          {bonus > 0 ? formatRp(bonus) : "–"}
        </span>
        <span className="hidden md:block text-right text-sm tabular-nums text-muted-foreground">
          {deductions > 0 ? `−${formatRp(deductions)}` : "–"}
        </span>
        <span className="text-right text-sm font-semibold tabular-nums">
          {p ? formatRp(n(p.net_total)) : "–"}
        </span>
        <ChevronRight size={16} className="text-muted-foreground" aria-hidden />
      </button>
    </li>
  );
}

/** Laci samping: rincian slip dan pengaturan gaji satu karyawan. */
function EmployeeDrawer({
  row,
  month,
  year,
  onClose,
}: {
  row: EmployeeRow;
  month: number;
  year: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const s = stageOf(row);
  const payslip = row.payslip;
  const finalized = payslip?.status === "finalized";

  function recalc() {
    startTransition(async () => {
      const res = await calculatePayslip(row.userId, month, year);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(
        "cached" in res && res.cached
          ? "Slip sudah yang terbaru"
          : "Slip dihitung ulang"
      );
      router.refresh();
    });
  }

  function toggleFinalize() {
    if (!payslip) return;
    startTransition(async () => {
      if (!finalized) {
        const res = await finalizePayslip(payslip.id);
        if ("error" in res && res.error) {
          toast.error(res.error);
          return;
        }
        toast.success("Slip difinalisasi");
        router.refresh();
        return;
      }
      const first = await reopenPayslip(payslip.id);
      if ("error" in first && first.error) {
        toast.error(first.error);
        return;
      }
      if ("requiresConfirm" in first && first.requiresConfirm) {
        const ackAt = first.employeeResponseAt
          ? new Date(first.employeeResponseAt).toLocaleString("id-ID", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "tanpa waktu";
        const proceed = confirm(
          `Karyawan sudah mengonfirmasi slip ini (${ackAt}).\n\n` +
            `Membuka kembali membatalkan konfirmasi itu. Karyawan harus konfirmasi ulang setelah slip difinalisasi lagi.\n\n` +
            `Lanjut buka kembali?`
        );
        if (!proceed) return;
        const second = await reopenPayslip(payslip.id, { confirm: true });
        if ("error" in second && second.error) {
          toast.error(second.error);
          return;
        }
      }
      toast.success("Slip dibuka kembali");
      router.refresh();
    });
  }

  const one = [row];

  return (
    <SideDrawer
      onClose={onClose}
      title={row.fullName}
      subtitle={
        <>
          <span className={"size-1.5 rounded-full " + STAGE_DOT[s]} aria-hidden />
          {STAGE_LABEL[s]}
          {row.businessUnit ? ` · ${row.businessUnit}` : ""}
        </>
      }
    >
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Bersih</p>
          <p className="text-2xl font-bold tabular-nums">
            {payslip ? formatRp(n(payslip.net_total)) : "–"}
          </p>
        </div>
        <div className="flex gap-2">
          {row.settings?.is_finalized && !finalized && (
            <button
              type="button"
              onClick={recalc}
              disabled={pending}
              className="h-10 px-3 rounded-lg border border-border bg-card text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              {payslip ? "Hitung ulang" : "Hitung"}
            </button>
          )}
          {payslip && (
            <button
              type="button"
              onClick={toggleFinalize}
              disabled={pending}
              className={
                "h-10 px-3 rounded-lg text-sm font-semibold disabled:opacity-50 " +
                (finalized
                  ? "border border-border bg-card hover:bg-muted"
                  : "bg-primary text-primary-foreground")
              }
            >
              {finalized ? "Buka kembali" : "Finalisasi"}
            </button>
          )}
        </div>
      </div>

      {payslip ? (
        <ExpandedDetail row={row} payslip={payslip} />
      ) : (
        <p className="text-sm text-muted-foreground">
          {row.settings?.is_finalized
            ? "Slip bulan ini belum dihitung."
            : "Atur dan finalkan pengaturan gaji dulu sebelum menghitung slip."}
        </p>
      )}

      <Disclosure title="Pengaturan gaji" defaultOpen={!payslip}>
        {/* Satu karyawan: kolom nama dan judul unit tidak perlu. */}
        <div className="space-y-3 [&_[data-group-row]]:hidden [&_th:first-child]:hidden [&_td:first-child]:hidden [&_select]:min-w-36">
          <CompensationBasisSection rows={one} />
          <ExpectedDaysSection rows={one} month={month} year={year} />
          <OvertimePenaltySection rows={one} />
          <ExtraWorkSection rows={one} />
        </div>
      </Disclosure>
    </SideDrawer>
  );
}

/** Laci kanan generik: judul, isi bisa digulir, Esc / ketuk latar menutup. */
function SideDrawer({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const [shown, setShown] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  // onClose berubah identitas tiap render induk; simpan di ref supaya efek
  // ini jalan sekali dan tidak merebut fokus dari input yang sedang diketik.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        aria-label="Tutup"
        tabIndex={-1}
        onClick={onClose}
        className={
          "absolute inset-0 bg-black/50 transition-opacity duration-200 motion-reduce:transition-none " +
          (shown ? "opacity-100" : "opacity-0")
        }
      />
      <div
        className={
          "absolute right-0 top-0 h-dvh w-full sm:max-w-xl bg-background border-l border-border shadow-xl flex flex-col transition-transform duration-200 ease-out motion-reduce:transition-none " +
          (shown ? "translate-x-0" : "translate-x-full")
        }
      >
        <header className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold truncate">{title}</h2>
            {subtitle && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="size-10 inline-flex items-center justify-center rounded-lg hover:bg-muted"
          >
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-3">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

function Disclosure({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group rounded-xl border border-border bg-card">
      <summary className="flex items-center justify-between gap-2 px-4 min-h-12 cursor-pointer list-none text-sm font-semibold [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown
          size={16}
          className="text-muted-foreground transition-transform motion-reduce:transition-none group-open:rotate-180"
        />
      </summary>
      <div className="border-t border-border p-3">{children}</div>
    </details>
  );
}
