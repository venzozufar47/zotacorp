"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, MessageSquare, CheckCircle2, Trash2, ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatRp } from "@/lib/cashflow/format";
import {
  submitPayslipDispute,
  deleteMyPayslipDispute,
  type DisputeField,
  type DisputeRow,
} from "@/lib/actions/payslip-disputes.actions";

interface SettingsSnapshot {
  monthlyFixedAmount: number;
  calculationBasis: string;
  attendanceWeightPct: number;
  deliverablesWeightPct: number;
  expectedDaysMode: string;
  expectedWorkDays: number;
  expectedWeekdays: number[];
}

interface Props {
  settings: SettingsSnapshot;
  disputes: DisputeRow[];
}

const WEEKDAY_LABELS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function basisLabel(basis: string, attW: number, delW: number): string {
  switch (basis) {
    case "presence":
      return "Berdasarkan kehadiran kamu";
    case "deliverables":
      return "Berdasarkan pencapaian target kerja";
    case "both":
      return `Gabungan: ${attW}% kehadiran + ${delW}% pencapaian target`;
    case "fixed":
      return "Gaji pokok tetap setiap bulan";
    default:
      return basis;
  }
}

function expectedDaysLabel(s: SettingsSnapshot): string {
  if (s.expectedDaysMode === "none") return "Sesuai jadwal yang disepakati dengan admin";
  if (s.expectedDaysMode === "weekly_pattern") {
    if (s.expectedWeekdays.length === 0) return "Belum diatur — tanya admin";
    const days = s.expectedWeekdays
      .slice()
      .sort()
      .map((d) => WEEKDAY_LABELS[d])
      .join(", ");
    return `Jadwal kerja kamu: setiap ${days}`;
  }
  return `Target ${s.expectedWorkDays} hari kerja per bulan`;
}

export function PayslipSettingsReview({ settings, disputes }: Props) {
  const [expanded, setExpanded] = useState(false);

  const openDisputes = disputes.filter((d) => d.status === "open");
  const openByField = new Map<DisputeField, DisputeRow>();
  for (const d of openDisputes) openByField.set(d.field, d);

  const items: Array<{
    field: DisputeField;
    label: string;
    value: string;
  }> = [
    {
      field: "monthly_fixed_amount",
      label: "Gaji pokok bulanan",
      value: formatRp(settings.monthlyFixedAmount),
    },
    {
      field: "calculation_basis",
      label: "Cara hitung gaji kamu",
      value: basisLabel(
        settings.calculationBasis,
        settings.attendanceWeightPct,
        settings.deliverablesWeightPct
      ),
    },
    {
      field: "expected_days",
      label: "Hari kerja kamu",
      value: expectedDaysLabel(settings),
    },
  ];

  const resolvedRecent = disputes
    .filter((d) => d.status !== "open")
    .slice(0, 3);
  const hasOpenDispute = openDisputes.length > 0;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-start gap-2 text-left"
          aria-expanded={expanded}
        >
          <div className="flex-1 min-w-0 space-y-1.5">
            <h3 className="font-display text-base font-bold flex items-center gap-2 flex-wrap">
              Cara gaji kamu dihitung
              {hasOpenDispute && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 inline-flex items-center gap-1">
                  <AlertTriangle size={11} />
                  {openDisputes.length} dilaporkan
                </span>
              )}
            </h3>
            {expanded ? (
              <p className="text-xs text-muted-foreground">
                Cek info di bawah. Kalau ada yang nggak sesuai (mis. gaji pokok salah,
                jadwal kerja beda), klik &quot;Lapor&quot; — admin akan kontak kamu.
              </p>
            ) : (
              <dl className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-3 sm:gap-x-3">
                {items.map((it) => (
                  <div key={it.field} className="min-w-0">
                    <dt className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                      {it.label}
                    </dt>
                    <dd className="text-foreground font-medium break-words">
                      {it.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
          <ChevronDown
            size={18}
            className={`shrink-0 mt-0.5 text-muted-foreground transition-transform ${
              expanded ? "" : "-rotate-90"
            }`}
          />
        </button>

        {expanded && (
          <>
            <ul className="divide-y divide-border/60 rounded-xl border-2 border-foreground/10 bg-muted/20 overflow-hidden">
              {items.map((it) => {
                const open = openByField.get(it.field);
                return (
                  <li
                    key={it.field}
                    className="px-3 py-2.5 flex flex-col gap-2 sm:flex-row sm:items-center"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                        {it.label}
                      </p>
                      <p className="text-sm font-medium text-foreground tabular-nums break-words">
                        {it.value}
                      </p>
                    </div>
                    {open ? (
                      <span
                        className="self-start sm:self-auto text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 inline-flex items-center gap-1"
                        title={`Laporan: ${open.message}`}
                      >
                        <AlertTriangle size={11} />
                        Dilaporkan
                      </span>
                    ) : (
                      <ReportButton
                        field={it.field}
                        label={it.label}
                        currentValue={it.value}
                      />
                    )}
                  </li>
                );
              })}
            </ul>

            {resolvedRecent.length > 0 && (
              <details className="rounded-xl border border-border bg-card">
                <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground">
                  Riwayat laporan kamu ({resolvedRecent.length})
                </summary>
                <ul className="divide-y divide-border/60 px-3 pb-3">
                  {resolvedRecent.map((d) => (
                    <li key={d.id} className="py-2 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                          {d.status === "resolved" ? (
                            <span className="inline-flex items-center gap-1">
                              <CheckCircle2 size={11} />
                              Selesai
                            </span>
                          ) : (
                            "Ditolak"
                          )}
                        </span>
                        <span className="text-[10px] text-muted-foreground flex-1 min-w-0">
                          {fieldName(d.field)}
                        </span>
                        <DeleteDisputeButton id={d.id} />
                      </div>
                      <p className="text-xs text-muted-foreground italic break-words">
                        Laporan: {d.message}
                      </p>
                      {d.adminResponse && (
                        <p className="text-xs text-foreground break-words">
                          Balasan admin: {d.adminResponse}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DeleteDisputeButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function onClick() {
    if (!confirm("Hapus laporan ini dari riwayat?")) return;
    startTransition(async () => {
      const res = await deleteMyPayslipDispute(id);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Laporan dihapus");
      router.refresh();
    });
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      title="Hapus dari riwayat"
      className="text-muted-foreground hover:text-destructive transition disabled:opacity-50"
    >
      <Trash2 size={12} />
    </button>
  );
}

function fieldName(f: DisputeField): string {
  switch (f) {
    case "monthly_fixed_amount":
      return "Gaji pokok bulanan";
    case "calculation_basis":
      return "Cara hitung gaji kamu";
    case "expected_days":
      return "Hari kerja kamu";
  }
}

function ReportButton({
  field,
  label,
  currentValue,
}: {
  field: DisputeField;
  label: string;
  currentValue: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    const trimmed = message.trim();
    if (!trimmed) {
      toast.error("Tulis detail kesalahannya dulu");
      return;
    }
    startTransition(async () => {
      const res = await submitPayslipDispute({
        field,
        currentValue,
        message: trimmed,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Laporan terkirim ke admin");
      setOpen(false);
      setMessage("");
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="xs"
        onClick={() => setOpen(true)}
        className="gap-1"
      >
        <MessageSquare size={11} />
        Lapor
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lapor: {label} salah</DialogTitle>
            <DialogDescription>
              Sekarang tertulis: <strong>{currentValue}</strong>. Ceritakan apa
              yang salah dan seharusnya berapa — admin akan cek dan balas kamu.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder="Contoh: Gaji pokok saya seharusnya Rp 4.500.000, sesuai surat kerja bulan Maret."
            disabled={pending}
          />
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
              loading={pending}
            >
              Batal
            </Button>
            <Button
              onClick={submit}
              disabled={pending || !message.trim()}
              loading={pending}
            >
              Kirim ke admin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
