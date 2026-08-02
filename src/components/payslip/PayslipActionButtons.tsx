"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check,
  Flag,
  Download,
  CheckCircle2,
  AlertTriangle,
  Pencil,
} from "lucide-react";
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
import {
  submitPayslipResponse,
  type EmployeeResponseKind,
} from "@/lib/actions/payslip.actions";
import { downloadPayslipPdf } from "@/lib/payslip/downloadPdf";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type {
  Payslip,
  PayslipDeliverable,
  PayslipSettings,
  Profile,
} from "@/lib/supabase/types";

interface Props {
  payslip: Payslip;
  deliverables: PayslipDeliverable[];
  settings: PayslipSettings | null;
  profile: Profile | null;
  /** Tanggal "YYYY-MM-DD" pada periode slip ini yang check-out-nya kosong.
   *  Hari seperti itu tidak dihitung sebagai hari kerja sama sekali, jadi
   *  karyawan harus melihatnya SEBELUM menekan Konfirmasi. */
  incompleteAttendance?: string[];
}

/** "2026-07-20" → "Sen, 20 Jul". Tanggal-saja, jadi diurai manual —
 *  `new Date("2026-07-20")` ditafsirkan UTC dan bisa mundur sehari di WIB. */
function formatDayLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/**
 * Peringatan absen menggantung. Sengaja TIDAK memblokir konfirmasi —
 * karyawan mungkin memang tidak bekerja hari itu, dan mengunci tombolnya
 * akan menyandera slip yang sebenarnya sudah benar. Tugasnya membuat
 * kerugian yang senyap jadi terlihat sebelum keputusan diambil.
 */
function IncompleteAttendanceNotice({ dates }: { dates: string[] }) {
  const { t } = useTranslation();
  const d = t.payslipDetail;
  return (
    <div
      className="space-y-1.5 rounded-xl p-3"
      style={{ background: "#fff7e6", border: "1px solid #f0cd8a" }}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle size={16} style={{ color: "#8a5a00", marginTop: 2 }} />
        <div className="flex-1 min-w-0">
          <p className="text-[12.5px] font-semibold" style={{ color: "#8a5a00" }}>
            {d.incompleteTitle.replace("{count}", String(dates.length))}
          </p>
          <p
            className="text-[11.5px] leading-relaxed mt-0.5"
            style={{ color: "#8a5a00" }}
          >
            {d.incompleteBody}
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {dates.map((ymd) => (
              <li
                key={ymd}
                className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
                style={{ background: "#f7e4bd", color: "#7a4f00" }}
              >
                {formatDayLabel(ymd)}
              </li>
            ))}
          </ul>
          <p className="text-[11px] mt-1.5" style={{ color: "#8a5a00" }}>
            {d.incompleteAction}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Primary action cluster shown at the bottom of the main column. Owns:
 *  - Konfirmasi / Sanggah (delegates to submitPayslipResponse)
 *  - Edit / Cancel when already responded
 *  - Unduh PDF (dynamic-imported @react-pdf/renderer)
 *
 * Mirrors the design's mobile button grid. On desktop the right-rail
 * "Tanggapan kamu" card echoes the response state read-only so karyawan
 * can see their last submission in context — actual mutations always
 * route through these buttons to avoid double-trigger confusion.
 */
export function PayslipActionButtons({
  payslip: p,
  deliverables,
  settings,
  profile,
  incompleteAttendance = [],
}: Props) {
  const { t } = useTranslation();
  const d = t.payslipDetail;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueDraft, setIssueDraft] = useState(p.employee_response_message ?? "");
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const response = (p.employee_response ?? "pending") as EmployeeResponseKind;

  function setKind(kind: EmployeeResponseKind, message?: string) {
    startTransition(async () => {
      const res = await submitPayslipResponse(p.id, kind, message);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        kind === "acknowledged"
          ? d.toastAcknowledged
          : kind === "issue"
            ? d.toastIssue
            : d.toastReset
      );
      setIssueOpen(false);
      router.refresh();
    });
  }

  async function downloadPdf() {
    setDownloadingPdf(true);
    try {
      await downloadPayslipPdf({ payslip: p, deliverables, settings, profile });
    } catch (err) {
      console.error("PDF generation failed", err);
      toast.error(d.toastPdfFailed);
    } finally {
      setDownloadingPdf(false);
    }
  }

  return (
    <div className="space-y-2">
      {/* Absen menggantung — DI ATAS tombol, karena gunanya menginformasikan
          keputusan konfirmasi. Tetap ditampilkan setelah karyawan menjawab:
          kalau mereka terlanjur konfirmasi, ini yang membuat mereka sadar
          masih bisa membatalkan dan menyanggah. */}
      {incompleteAttendance.length > 0 && (
        <IncompleteAttendanceNotice dates={incompleteAttendance} />
      )}

      {/* Response state — pending shows primary actions; otherwise shows
          the current status with edit/cancel affordances. */}
      {response === "pending" && (
        <div className="grid grid-cols-2 gap-3">
          <Button
            type="button"
            onClick={() => setKind("acknowledged")}
            disabled={pending}
            loading={pending}
            className="h-11 gap-2 text-white"
            style={{ background: "var(--primary, #117a8c)" }}
          >
            <Check size={15} /> {d.actionConfirm}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setIssueDraft("");
              setIssueOpen(true);
            }}
            disabled={pending}
            className="h-11 gap-2"
            style={{ color: "#a8261d", borderColor: "#f6c5bf" }}
          >
            <Flag size={15} /> {d.actionDispute}
          </Button>
        </div>
      )}

      {response === "acknowledged" && (
        <AcknowledgedBanner
          responseAt={p.employee_response_at}
          onReset={() => setKind("pending")}
          pending={pending}
        />
      )}

      {response === "issue" && (
        <IssueBanner
          responseMessage={p.employee_response_message}
          responseAt={p.employee_response_at}
          onEdit={() => {
            setIssueDraft(p.employee_response_message ?? "");
            setIssueOpen(true);
          }}
          onReset={() => setKind("pending")}
          pending={pending}
        />
      )}

      {/* Secondary: PDF download (always visible) */}
      <div className="grid grid-cols-1 gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={downloadPdf}
          disabled={downloadingPdf}
          loading={downloadingPdf}
          className="h-10 gap-2"
        >
          <Download size={14} /> {d.actionDownloadPdf}
        </Button>
      </div>

      <IssueDialog
        open={issueOpen}
        onOpenChange={setIssueOpen}
        draft={issueDraft}
        setDraft={setIssueDraft}
        pending={pending}
        onSubmit={() => setKind("issue", issueDraft)}
      />
    </div>
  );
}

function AcknowledgedBanner({
  responseAt,
  onReset,
  pending,
}: {
  responseAt: string | null;
  onReset: () => void;
  pending: boolean;
}) {
  const { t } = useTranslation();
  const d = t.payslipDetail;
  return (
    <div
      className="flex items-center gap-2 rounded-xl p-3"
      style={{ background: "#e8f7ee", border: "1px solid #bfe6cd" }}
    >
      <CheckCircle2 size={16} style={{ color: "#1b7a3a" }} />
      <p className="text-[12.5px] font-semibold flex-1" style={{ color: "#1b7a3a" }}>
        {d.bannerAcknowledged}
        {responseAt ? ` · ${formatDateTime(responseAt)}` : ""}
      </p>
      <button
        type="button"
        onClick={onReset}
        disabled={pending}
        className="text-[10px] underline disabled:opacity-50"
        style={{ color: "#1b7a3a" }}
      >
        {d.actionUndo}
      </button>
    </div>
  );
}

function IssueBanner({
  responseMessage,
  responseAt,
  onEdit,
  onReset,
  pending,
}: {
  responseMessage: string | null;
  responseAt: string | null;
  onEdit: () => void;
  onReset: () => void;
  pending: boolean;
}) {
  const { t } = useTranslation();
  const d = t.payslipDetail;
  return (
    <div
      className="space-y-2 rounded-xl p-3"
      style={{ background: "#fdecea", border: "1px solid #f6c5bf" }}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle size={16} style={{ color: "#a8261d", marginTop: 2 }} />
        <div className="flex-1 min-w-0">
          <p className="text-[12.5px] font-semibold" style={{ color: "#a8261d" }}>
            {d.bannerIssue}
            {responseAt ? ` · ${formatDateTime(responseAt)}` : ""}
          </p>
          {responseMessage && (
            <p
              className="text-[11.5px] italic break-words mt-0.5"
              style={{ color: "#a8261d" }}
            >
              “{responseMessage}”
            </p>
          )}
        </div>
      </div>
      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={onEdit}
          disabled={pending}
          className="inline-flex items-center gap-1 text-[10px] font-semibold underline disabled:opacity-50"
          style={{ color: "#a8261d" }}
        >
          <Pencil size={10} /> {d.actionEdit}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={pending}
          className="text-[10px] underline disabled:opacity-50"
          style={{ color: "#a8261d" }}
        >
          {d.actionUndo}
        </button>
      </div>
    </div>
  );
}

function IssueDialog({
  open,
  onOpenChange,
  draft,
  setDraft,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  draft: string;
  setDraft: (s: string) => void;
  pending: boolean;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  const d = t.payslipDetail;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{d.disputeDialogTitle}</DialogTitle>
          <DialogDescription>{d.disputeDialogDescription}</DialogDescription>
        </DialogHeader>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          placeholder={d.disputeDialogPlaceholder}
          disabled={pending}
        />
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {d.actionCancel}
          </Button>
          <Button
            onClick={onSubmit}
            disabled={pending || !draft.trim()}
            loading={pending}
          >
            {d.actionSendToAdmin}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatDateTime(iso: string): string {
  const dt = new Date(iso);
  return dt.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
