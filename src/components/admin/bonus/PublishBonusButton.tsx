"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { periodLabel } from "@/lib/bonus/periods";
import { publishBonusRun } from "@/lib/actions/bonus.actions";

/** Menerbitkan bonus bulan yang sudah selesai: membekukan angka, mengunci parameter kuartal, memberi tahu penerima. */
export function PublishBonusButton({ branch, period }: { branch: "Pare" | "Semarang"; period: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function publish() {
    if (!window.confirm(`Terbitkan bonus ${branch} ${periodLabel(period)}?\n\nAngka dibekukan, parameter kuartal ini terkunci, dan penerima mendapat notifikasi. Tidak bisa dibatalkan.`)) return;
    setBusy(true);
    const res = await publishBonusRun({ branch, period });
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success(`Bonus ${branch} ${periodLabel(period)} diterbitkan`);
    router.refresh();
  }

  return (
    <Button type="button" onClick={publish} loading={busy} className="h-11 w-full sm:w-auto sm:px-6">
      Terbitkan bonus {periodLabel(period)}
    </Button>
  );
}
