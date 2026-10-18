"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  acknowledgeSopDocument,
  type SopDocumentForEmployee,
} from "@/lib/actions/sop-documents.actions";

function SopCard({ doc, onAcked }: { doc: SopDocumentForEmployee; onAcked: () => void }) {
  const [open, setOpen] = useState(!doc.acknowledged);
  const [acking, setAcking] = useState(false);

  async function acknowledge() {
    setAcking(true);
    try {
      const res = await acknowledgeSopDocument({ documentId: doc.id, version: doc.version });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Pengakuan tercatat");
      onAcked();
    } finally {
      setAcking(false);
    }
  }

  return (
    <div className="rounded-2xl border-2 border-foreground bg-card shadow-hard-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        {doc.acknowledged ? (
          <CheckCircle2 size={18} className="text-success shrink-0" />
        ) : (
          <span className="size-5 rounded-full border-2 border-foreground shrink-0" />
        )}
        <span className="flex-1 min-w-0">
          <span className="block font-display font-bold text-sm">{doc.title}</span>
          <span className="block text-xs text-muted-foreground">{doc.category}</span>
        </span>
        {!doc.acknowledged && <Badge variant="destructive">Belum diakui</Badge>}
        <ChevronDown size={16} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t-2 border-foreground px-4 py-3 space-y-3">
          <p className="whitespace-pre-wrap text-sm text-foreground">{doc.body}</p>
          {doc.acknowledged ? (
            <p className="text-xs text-success">Kamu sudah mengakui versi ini.</p>
          ) : (
            <Button onClick={acknowledge} loading={acking} className="w-full">
              Saya sudah membaca dan memahami
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function SopAcknowledgmentClient({ documents }: { documents: SopDocumentForEmployee[] }) {
  const router = useRouter();
  const pendingCount = documents.filter((d) => !d.acknowledged).length;

  if (documents.length === 0) {
    return <p className="text-sm text-muted-foreground">Belum ada SOP terdaftar.</p>;
  }

  return (
    <div className="space-y-3">
      {pendingCount > 0 && (
        <p className="rounded-xl border-2 border-foreground bg-warning/40 px-3 py-2 text-sm font-semibold">
          {pendingCount} SOP belum kamu akui.
        </p>
      )}
      {documents.map((doc) => (
        <SopCard key={doc.id} doc={doc} onAcked={() => router.refresh()} />
      ))}
    </div>
  );
}
