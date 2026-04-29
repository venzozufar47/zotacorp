"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  MessageSquare,
  Pencil,
  Wallet,
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

interface Props {
  payslipId: string;
  response: EmployeeResponseKind;
  responseMessage: string | null;
  responseAt: string | null;
  paymentStatus: "unpaid" | "paid";
  paymentAt: string | null;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  const dt = new Date(iso);
  return dt.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PayslipResponseWidget({
  payslipId,
  response,
  responseMessage,
  responseAt,
  paymentStatus,
  paymentAt,
}: Props) {
  return (
    <div className="space-y-2 pt-2 border-t border-border/60">
      {paymentStatus === "paid" && (
        <div className="flex items-center gap-2 rounded-lg border-2 border-foreground bg-quaternary/20 p-2">
          <Wallet size={14} className="text-foreground" />
          <p className="text-xs font-semibold">
            Sudah ditransfer{paymentAt ? ` · ${formatDateTime(paymentAt)}` : ""}
          </p>
        </div>
      )}
      <ResponseControls
        payslipId={payslipId}
        response={response}
        responseMessage={responseMessage}
        responseAt={responseAt}
      />
    </div>
  );
}

function ResponseControls({
  payslipId,
  response,
  responseMessage,
  responseAt,
}: {
  payslipId: string;
  response: EmployeeResponseKind;
  responseMessage: string | null;
  responseAt: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueDraft, setIssueDraft] = useState(responseMessage ?? "");

  function setKind(kind: EmployeeResponseKind, message?: string) {
    startTransition(async () => {
      const res = await submitPayslipResponse(payslipId, kind, message);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        kind === "acknowledged"
          ? "Konfirmasi terkirim"
          : kind === "issue"
            ? "Laporan terkirim ke admin"
            : "Respon dibatalkan"
      );
      setIssueOpen(false);
      router.refresh();
    });
  }

  if (response === "acknowledged") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-2">
        <CheckCircle2 size={14} className="text-emerald-700" />
        <p className="text-xs font-semibold text-emerald-900 flex-1">
          Sudah dikonfirmasi
          {responseAt ? ` · ${formatDateTime(responseAt)}` : ""}
        </p>
        <button
          type="button"
          onClick={() => setKind("pending")}
          disabled={pending}
          className="text-[10px] underline text-emerald-700 hover:text-emerald-900 disabled:opacity-50"
        >
          Batalkan
        </button>
      </div>
    );
  }

  if (response === "issue") {
    return (
      <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-2">
        <div className="flex items-start gap-2">
          <AlertTriangle size={14} className="text-amber-700 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-amber-900">
              Lapor masalah{responseAt ? ` · ${formatDateTime(responseAt)}` : ""}
            </p>
            <p className="text-xs text-amber-900 italic break-words mt-0.5">
              &quot;{responseMessage}&quot;
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => {
              setIssueDraft(responseMessage ?? "");
              setIssueOpen(true);
            }}
            disabled={pending}
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-900 underline disabled:opacity-50"
          >
            <Pencil size={10} /> Edit
          </button>
          <button
            type="button"
            onClick={() => setKind("pending")}
            disabled={pending}
            className="text-[10px] text-amber-700 underline hover:text-amber-900 disabled:opacity-50"
          >
            Tarik laporan
          </button>
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

  // pending
  return (
    <>
      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setKind("acknowledged")}
          disabled={pending}
          loading={pending}
          className="flex-1 gap-1"
        >
          <CheckCircle2 size={12} /> Konfirmasi terima
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setIssueDraft("");
            setIssueOpen(true);
          }}
          disabled={pending}
          className="flex-1 gap-1 border-amber-300 text-amber-900 hover:bg-amber-50"
        >
          <MessageSquare size={12} /> Lapor masalah
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
    </>
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lapor masalah pada slip gaji</DialogTitle>
          <DialogDescription>
            Tulis apa yang nggak sesuai (mis. nilai salah, denda telat tidak
            seharusnya, lembur belum dihitung). Admin akan review dan kontak kamu.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          placeholder="Contoh: Lembur tanggal 15 April belum dihitung, padahal saya kerja sampai jam 21:30."
          disabled={pending}
        />
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Batal
          </Button>
          <Button
            onClick={onSubmit}
            disabled={pending || !draft.trim()}
            loading={pending}
          >
            Kirim ke admin
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
