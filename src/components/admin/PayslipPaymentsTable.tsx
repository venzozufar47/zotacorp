"use client";

import React, { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
} from "lucide-react";
import { formatRp } from "@/lib/cashflow/format";
import {
  markPayslipPaid,
  bulkMarkPayslipsPaid,
  setPayslipPaymentNote,
} from "@/lib/actions/payslip.actions";

export interface PaymentRow {
  payslipId: string;
  userId: string;
  fullName: string;
  businessUnit: string | null;
  netTotal: number;
  employeeResponse: "pending" | "acknowledged" | "issue";
  employeeResponseMessage: string | null;
  employeeResponseAt: string | null;
  paymentStatus: "unpaid" | "paid";
  paymentAt: string | null;
  paymentNote: string | null;
}

interface Props {
  rows: PaymentRow[];
  month: number;
  year: number;
  monthLabel: string;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function groupByBU(rows: PaymentRow[]): Array<{ name: string; rows: PaymentRow[] }> {
  const map = new Map<string, PaymentRow[]>();
  for (const r of rows) {
    const k = r.businessUnit?.trim() || "(tanpa unit)";
    const arr = map.get(k) ?? [];
    arr.push(r);
    map.set(k, arr);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, rows]) => ({ name, rows }));
}

export function PayslipPaymentsTable({ rows, month, year, monthLabel }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  function setPeriod(m: number, y: number) {
    const params = new URLSearchParams(sp.toString());
    params.set("month", String(m));
    params.set("year", String(y));
    params.set("view", "payments");
    router.push(`/admin/payslips/variables?${params.toString()}`);
  }

  function shiftMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setPeriod(m, y);
  }

  const groups = useMemo(() => groupByBU(rows), [rows]);

  const totalNet = rows.reduce((s, r) => s + r.netTotal, 0);
  const paidCount = rows.filter((r) => r.paymentStatus === "paid").length;
  const issueCount = rows.filter((r) => r.employeeResponse === "issue").length;
  const ackCount = rows.filter((r) => r.employeeResponse === "acknowledged").length;
  const unpaidIds = rows
    .filter((r) => r.paymentStatus === "unpaid")
    .map((r) => r.payslipId);
  const paidNetTotal = rows
    .filter((r) => r.paymentStatus === "paid")
    .reduce((s, r) => s + r.netTotal, 0);

  function bulkPay() {
    if (unpaidIds.length === 0) return;
    if (
      !confirm(
        `Tandai ${unpaidIds.length} payslip sebagai sudah ditransfer? Aksi ini tidak otomatis kirim uang — admin tetap perlu transfer manual via bank.`
      )
    )
      return;
    startTransition(async () => {
      const res = await bulkMarkPayslipsPaid(unpaidIds);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`${res.paidCount} payslip ditandai sudah dibayar`);
      router.refresh();
    });
  }

  const monthNav = (
    <div className="rounded-2xl border border-border bg-card p-2.5 flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={() => shiftMonth(-1)}
        className="size-8 inline-flex items-center justify-center rounded-md border border-border hover:bg-muted"
        aria-label="Bulan sebelumnya"
      >
        <ChevronLeft size={14} />
      </button>
      <select
        value={month}
        onChange={(e) => setPeriod(Number(e.target.value), year)}
        className="h-8 rounded-md border border-border bg-background px-2 text-xs"
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <option key={m} value={m}>
            {new Date(year, m - 1).toLocaleDateString("id-ID", { month: "long" })}
          </option>
        ))}
      </select>
      <select
        value={year}
        onChange={(e) => setPeriod(month, Number(e.target.value))}
        className="h-8 rounded-md border border-border bg-background px-2 text-xs tabular-nums"
      >
        {Array.from({ length: 5 }, (_, i) => year - 2 + i).map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => shiftMonth(1)}
        className="size-8 inline-flex items-center justify-center rounded-md border border-border hover:bg-muted"
        aria-label="Bulan berikutnya"
      >
        <ChevronRight size={14} />
      </button>
      <span className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground">
        {monthLabel}
      </span>
    </div>
  );

  if (rows.length === 0) {
    return (
      <div className="space-y-3">
        {monthNav}
        <section className="rounded-2xl border border-border bg-card p-6 text-center">
          <Clock size={20} className="mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground mt-2">
            Belum ada payslip ter-finalize untuk{" "}
            <strong className="text-foreground">{monthLabel}</strong>.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {monthNav}
      <div className="rounded-2xl border border-border bg-card p-3 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0 flex flex-wrap gap-3 text-xs">
          <Stat label="Total" value={`${rows.length} payslip`} />
          <Stat label="Sudah dibayar" value={`${paidCount} / ${rows.length}`} tone="emerald" />
          <Stat label="Konfirmasi" value={ackCount} tone="emerald" />
          <Stat label="Ada masalah" value={issueCount} tone={issueCount > 0 ? "amber" : "default"} />
          <Stat label="Total dibayarkan" value={formatRp(paidNetTotal)} />
          <Stat label="Total bersih" value={formatRp(totalNet)} />
        </div>
        <button
          type="button"
          onClick={bulkPay}
          disabled={pending || unpaidIds.length === 0}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
        >
          Tandai semua ({unpaidIds.length}) sudah dibayar
        </button>
      </div>

      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {["", "Karyawan", "Net", "Respon karyawan", "Pembayaran", ""].map(
                  (c, i) => (
                    <th
                      key={i}
                      className={
                        "text-[10px] uppercase tracking-wider font-semibold text-muted-foreground py-1.5 px-2 " +
                        (i <= 1 ? "text-left" : i === 2 ? "text-right" : "text-left")
                      }
                    >
                      {c}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <React.Fragment key={g.name}>
                  <tr className="bg-muted/10">
                    <td colSpan={6} className="py-1.5 px-3 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                      {g.name} ({g.rows.length})
                    </td>
                  </tr>
                  {g.rows.map((r) => (
                    <PaymentRowItem key={r.payslipId} row={r} />
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function PaymentRowItem({ row: r }: { row: PaymentRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(
    r.employeeResponse === "issue" || (r.paymentNote != null && r.paymentNote !== "")
  );
  const [noteDraft, setNoteDraft] = useState(r.paymentNote ?? "");
  const noteDirty = noteDraft !== (r.paymentNote ?? "");

  const isPaid = r.paymentStatus === "paid";
  const hasIssue = r.employeeResponse === "issue";

  function togglePaid() {
    startTransition(async () => {
      const res = await markPayslipPaid(r.payslipId, !isPaid);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(isPaid ? "Tandai belum dibayar" : "Tandai sudah dibayar");
      router.refresh();
    });
  }

  function saveNote() {
    if (!noteDirty) return;
    startTransition(async () => {
      const res = await setPayslipPaymentNote(r.payslipId, noteDraft);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Catatan tersimpan");
      router.refresh();
    });
  }

  return (
    <>
      <tr
        className={
          "border-b border-border/50 " +
          (hasIssue ? "bg-amber-50/40 " : "") +
          (isPaid ? "opacity-70" : "")
        }
      >
        <td className="px-2 py-1.5 align-top">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-muted-foreground hover:text-foreground"
            aria-label={expanded ? "Tutup detail" : "Buka detail"}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </td>
        <td className="px-2 py-1.5 align-top">
          <p className="font-medium text-sm break-words">{r.fullName}</p>
        </td>
        <td className="px-2 py-1.5 align-top text-right tabular-nums font-medium">
          {formatRp(r.netTotal)}
        </td>
        <td className="px-2 py-1.5 align-top">
          <ResponseBadge row={r} />
        </td>
        <td className="px-2 py-1.5 align-top">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isPaid}
              onChange={togglePaid}
              disabled={pending}
              className="size-4 accent-primary cursor-pointer"
            />
            <span className="text-xs">
              {isPaid ? (
                <>
                  Sudah · <span className="text-muted-foreground">{formatDateTime(r.paymentAt)}</span>
                </>
              ) : (
                <span className="text-muted-foreground">Belum dibayar</span>
              )}
            </span>
          </label>
        </td>
        <td className="px-2 py-1.5 align-top text-right">
          {pending && <span className="text-[10px] text-muted-foreground">Saving…</span>}
        </td>
      </tr>
      {expanded && (
        <tr className={hasIssue ? "bg-amber-50/30" : "bg-muted/10"}>
          <td colSpan={6} className="px-4 py-2 space-y-2">
            {hasIssue && r.employeeResponseMessage && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-amber-800 flex items-center gap-1">
                  <AlertTriangle size={11} />
                  Laporan masalah dari karyawan
                  {r.employeeResponseAt && (
                    <span className="text-amber-700 font-normal">
                      · {formatDateTime(r.employeeResponseAt)}
                    </span>
                  )}
                </p>
                <p className="text-sm text-amber-900 italic break-words mt-1">
                  &quot;{r.employeeResponseMessage}&quot;
                </p>
              </div>
            )}
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  Catatan transfer (opsional)
                </label>
                <input
                  type="text"
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="Mis. ref BCA 12345 / cash 02 Mei"
                  className="w-full h-8 px-2 rounded-md border border-border bg-background text-sm"
                  disabled={pending}
                />
              </div>
              {noteDirty && (
                <button
                  type="button"
                  onClick={saveNote}
                  disabled={pending}
                  className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
                >
                  Simpan
                </button>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ResponseBadge({ row: r }: { row: PaymentRow }) {
  if (r.employeeResponse === "acknowledged") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
        <CheckCircle2 size={11} />
        Konfirmasi
      </span>
    );
  }
  if (r.employeeResponse === "issue") {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800"
        title={r.employeeResponseMessage ?? ""}
      >
        <AlertTriangle size={11} />
        Ada masalah
      </span>
    );
  }
  return (
    <span className="text-[10px] text-muted-foreground italic">
      Belum direspon
    </span>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "amber" | "emerald" | "default";
}) {
  const cls =
    tone === "amber"
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : tone === "emerald"
        ? "border-emerald-300 bg-emerald-50 text-emerald-900"
        : "border-border bg-muted/20 text-foreground";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border tabular-nums ${cls}`}
    >
      <span className="text-[10px] uppercase tracking-wider font-semibold opacity-70">
        {label}
      </span>
      <span className="font-bold">{value}</span>
    </span>
  );
}
