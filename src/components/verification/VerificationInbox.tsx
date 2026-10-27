"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck, Check, X, Loader2, ClipboardList, Ticket as TicketIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { decideVerification, type PendingVerification } from "@/lib/actions/verifications.actions";

/**
 * Kartu beranda "Menunggu verifikasimu": poin checklist tugas / tiket yang menunjuk saya sebagai salah satu
 * verifikator. Semua verifikator wajib menandai; satu penolakan mengembalikan pekerjaan ke pekerja.
 */
export function VerificationInbox({ items }: { items: PendingVerification[] }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">
          <ShieldCheck size={16} />
        </span>
        <h2 className="font-display font-bold text-base">Menunggu verifikasimu</h2>
        <span className="text-xs font-semibold text-muted-foreground rounded-full bg-muted px-2 py-0.5">{items.length}</span>
      </div>
      <div className="space-y-3">
        {items.map((it) => (
          <VerificationCard key={it.id} item={it} />
        ))}
      </div>
    </section>
  );
}

function VerificationCard({ item }: { item: PendingVerification }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");

  function decide(decision: "verify" | "reject") {
    if (decision === "reject" && note.trim().length < 3) {
      toast.error("Alasan penolakan wajib diisi");
      return;
    }
    start(async () => {
      const r = await decideVerification(item.id, decision, note.trim() || undefined);
      if (!r.ok) {
        toast.error(r.error);
        router.refresh();
        return;
      }
      toast.success(decision === "verify" ? "Terverifikasi ✅" : "Dikembalikan ke pekerja");
      setRejecting(false);
      setNote("");
      router.refresh();
    });
  }

  const Icon = item.kind === "task" ? ClipboardList : TicketIcon;
  return (
    <article className="rounded-2xl border-2 border-foreground bg-card p-3.5 shadow-hard-sm space-y-2.5">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-muted-foreground">
          <Icon size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {item.kind === "task" ? "Poin tugas" : "Tiket selesai"} · {item.context}
          </p>
          <h3 className="font-display text-[15px] font-bold leading-snug">{item.itemTitle ?? item.title}</h3>
          {item.itemTitle && <p className="text-[12.5px] text-muted-foreground">{item.title}</p>}
        </div>
      </div>

      {item.note && <p className="rounded-xl bg-muted/50 px-3 py-2 text-[13px]">{item.note}</p>}

      {item.photoUrls.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {item.photoUrls.map((u) => (
            <a key={u} href={u} target="_blank" rel="noreferrer" className="block size-24 overflow-hidden rounded-lg border-2 border-foreground bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="Bukti pekerjaan" className="size-full object-cover" />
            </a>
          ))}
        </div>
      )}

      {item.others.length > 0 && (
        <p className="text-[11.5px] text-muted-foreground">
          Verifikator lain:{" "}
          {item.others
            .map((o) => `${o.name} ${o.status === "verified" ? "✓" : o.status === "rejected" ? "✗" : "(menunggu)"}`)
            .join(", ")}
        </p>
      )}

      {rejecting ? (
        <div className="space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Alasan penolakan (wajib) — akan dibaca pekerja…"
            className="w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm resize-y"
          />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setRejecting(false)} disabled={pending}>
              Batal
            </Button>
            <Button size="sm" onClick={() => decide("reject")} disabled={pending}>
              {pending ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />} Tolak & kembalikan
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button variant="emerald" size="sm" onClick={() => decide("verify")} disabled={pending}>
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Terverifikasi
          </Button>
          <Button variant="outline" size="sm" onClick={() => setRejecting(true)} disabled={pending}>
            <X size={14} /> Tolak
          </Button>
        </div>
      )}
    </article>
  );
}
