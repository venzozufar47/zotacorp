"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Check, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { markOffboardingItemDone, type OffboardingChecklistView } from "@/lib/actions/offboarding.actions";

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function AutoFact({ label, at }: { label: string; at: string | null }) {
  return (
    <p className="flex items-center gap-1.5 text-xs">
      {at ? <Check size={12} className="text-success" /> : <ShieldOff size={12} className="text-muted-foreground" />}
      {label} {at ? `— ${dateLabel(at)}` : "— tidak berlaku"}
    </p>
  );
}

function ManualItem({ item, onDone }: { item: OffboardingChecklistView["items"][number]; onDone: () => void }) {
  const [busy, setBusy] = useState(false);

  async function markDone() {
    setBusy(true);
    try {
      const res = await markOffboardingItemDone({ itemId: item.id });
      if (!res.ok) toast.error(res.error);
      else onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-2 text-sm">
      <span className={item.done ? "line-through text-muted-foreground" : ""}>{item.label}</span>
      {item.done ? (
        <span className="text-xs text-success">{item.doneByName}</span>
      ) : (
        <Button size="xs" loading={busy} onClick={markDone}>
          Tandai selesai
        </Button>
      )}
    </div>
  );
}

export function OffboardingClient({ checklists }: { checklists: OffboardingChecklistView[] }) {
  const router = useRouter();

  if (checklists.length === 0) {
    return <p className="text-sm text-muted-foreground">Belum ada karyawan yang resign.</p>;
  }

  return (
    <div className="space-y-4">
      {checklists.map((c) => (
        <Card key={c.id}>
          <CardHeader>
            <CardTitle>
              {c.userName} — {dateLabel(c.effectiveAt)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">Diproses oleh {c.triggeredByName ?? "—"}</p>
            <div className="space-y-1">
              <AutoFact label="PIN POS dicabut" at={c.posPinRevokedAt} />
              <AutoFact label="Keanggotaan tim dihapus" at={c.teamMembershipsRemovedAt} />
              <AutoFact label="Peran tester dicabut" at={c.testerRolesRevokedAt} />
              <AutoFact label="Dihapus dari pihak tepercaya" at={c.trustedContactRemovedAt} />
            </div>
            <div className="space-y-2 border-t border-border pt-2">
              <p className="text-xs font-semibold text-muted-foreground">Item fisik (manual)</p>
              {c.items.map((item) => (
                <ManualItem key={item.id} item={item} onDone={() => router.refresh()} />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
