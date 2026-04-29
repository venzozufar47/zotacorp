"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  resolvePayslipDispute,
  type DisputeRow,
  type DisputeField,
} from "@/lib/actions/payslip-disputes.actions";

interface DisputeWithUser extends DisputeRow {
  userName: string;
}

function fieldLabel(f: DisputeField): string {
  switch (f) {
    case "monthly_fixed_amount":
      return "Gaji pokok";
    case "calculation_basis":
      return "Basis perhitungan";
    case "expected_days":
      return "Hari kerja";
  }
}

export function PayslipDisputesPanel({ disputes }: { disputes: DisputeWithUser[] }) {
  if (disputes.length === 0) return null;
  return (
    <Card className="border-amber-300 bg-amber-50/50">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-700" />
          <h3 className="font-display text-base font-bold">
            Laporan kesalahan dari karyawan ({disputes.length})
          </h3>
        </div>
        <ul className="space-y-2">
          {disputes.map((d) => (
            <DisputeItem key={d.id} dispute={d} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function DisputeItem({ dispute }: { dispute: DisputeWithUser }) {
  const router = useRouter();
  const [response, setResponse] = useState("");
  const [pending, startTransition] = useTransition();

  function act(status: "resolved" | "dismissed") {
    startTransition(async () => {
      const res = await resolvePayslipDispute({
        id: dispute.id,
        status,
        adminResponse: response,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        status === "resolved" ? "Laporan ditandai selesai" : "Laporan ditolak"
      );
      router.refresh();
    });
  }

  return (
    <li className="rounded-xl border-2 border-foreground/10 bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold break-words">{dispute.userName}</p>
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground break-words">
            {fieldLabel(dispute.field)}
            {dispute.currentValue ? ` — saat ini: ${dispute.currentValue}` : ""}
          </p>
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0">
          {new Date(dispute.createdAt).toLocaleDateString("id-ID", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </span>
      </div>
      <p className="text-sm italic bg-muted/40 rounded-lg p-2 break-words">
        “{dispute.message}”
      </p>
      <Textarea
        value={response}
        onChange={(e) => setResponse(e.target.value)}
        rows={2}
        placeholder="Balasan admin (opsional) — akan dilihat karyawan"
        disabled={pending}
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => act("dismissed")}
          disabled={pending}
          loading={pending}
        >
          <X size={12} /> Tolak
        </Button>
        <Button
          size="sm"
          onClick={() => act("resolved")}
          disabled={pending}
          loading={pending}
        >
          <CheckCircle2 size={12} /> Tandai selesai
        </Button>
      </div>
    </li>
  );
}
