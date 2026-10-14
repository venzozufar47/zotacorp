"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCheck, Loader2, MessageSquareWarning } from "lucide-react";
import {
  markChecklistReviewed,
  resolveItemIssue,
  type OwnedSop,
} from "@/lib/actions/cleaning-governance.actions";
import { reviewDue } from "@/lib/cleaning/governance";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

function fmtYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function SopOwnerPanel({ sops, today }: { sops: OwnedSop[]; today: string }) {
  return (
    <div className="space-y-3">
      {sops.map((s) => (
        <SopCard key={s.id} sop={s} today={today} />
      ))}
    </div>
  );
}

function SopCard({ sop, today }: { sop: OwnedSop; today: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const due = reviewDue(sop, today);
  const overdue = !!due && due.daysLeft <= 0;

  function review() {
    start(async () => {
      const res = await markChecklistReviewed({ id: sop.id, note: note || null });
      if (!res.ok) return void toast.error(res.error);
      toast.success("SOP ditandai sudah ditinjau");
      setNote("");
      router.refresh();
    });
  }

  function resolve(id: string) {
    start(async () => {
      const res = await resolveItemIssue({ id });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Kendala ditandai selesai");
      router.refresh();
    });
  }

  return (
    <section
      className={`rounded-2xl border bg-card ${
        sop.is_active ? "border-border" : "border-border/60 opacity-70"
      }`}
    >
      <div className="space-y-1 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-[15px] font-bold">{sop.name}</h2>
          <span className="text-[11px] text-muted-foreground">{sop.titik} titik</span>
          {!sop.is_active && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
              nonaktif
            </span>
          )}
          {overdue && (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">
              waktunya ditinjau
            </span>
          )}
        </div>
        <p className="text-[12px] text-muted-foreground">
          Ditinjau terakhir:{" "}
          <b className="text-foreground">
            {sop.last_reviewed_at ? fmtDate(sop.last_reviewed_at) : "belum pernah"}
          </b>
          {due && (
            <>
              {" · "}
              <span className={overdue ? "font-semibold text-destructive" : undefined}>
                tinjau berikutnya {fmtYmd(due.dueYmd)}
                {due.daysLeft < 0
                  ? ` (lewat ${-due.daysLeft} hari)`
                  : due.daysLeft === 0
                    ? " (hari ini)"
                    : ` (${due.daysLeft} hari lagi)`}
              </span>
            </>
          )}
          {!due && " · jadwal tinjau ulang belum diatur admin"}
        </p>
      </div>

      {sop.issues.length > 0 && (
        <div className="border-t border-border">
          <p className="flex items-center gap-1.5 px-4 pt-2.5 text-[11.5px] font-bold text-amber-700 dark:text-amber-400">
            <MessageSquareWarning size={13} /> {sop.issues.length} kendala dari rekan
          </p>
          <ul className="divide-y divide-border">
            {sop.issues.map((i) => (
              <li key={i.id} className="flex items-start gap-2 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-semibold">{i.item_title}</div>
                  <p className="text-[12px]">{i.reason}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {i.user_name} · {fmtYmd(i.date)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => resolve(i.id)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11.5px] font-semibold hover:bg-muted disabled:opacity-50"
                >
                  <CheckCheck size={12} /> Selesai
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2 border-t border-border bg-muted/20 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder="Catatan tinjauan (opsional)"
            className="h-9 min-w-[10rem] flex-1 rounded-lg border border-border bg-background px-3 text-sm"
          />
          <button
            type="button"
            disabled={pending}
            onClick={review}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <CheckCheck size={14} />}
            Tandai sudah ditinjau
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Mengubah titik atau standar dilakukan admin di Pengaturan SOP — sampaikan lewat
          kendala atau langsung ke admin.
        </p>
      </div>

      {sop.recent.length > 0 && (
        <details className="border-t border-border px-4 py-2.5">
          <summary className="cursor-pointer text-[11.5px] font-semibold text-muted-foreground">
            Perubahan terakhir
          </summary>
          <ul className="mt-1.5 space-y-1">
            {sop.recent.map((r) => (
              <li key={r.id} className="text-[11.5px]">
                <span className="tabular-nums text-muted-foreground">{fmtDate(r.created_at)}</span>
                {" · "}
                {r.summary}
                {r.changed_by_name && (
                  <span className="text-muted-foreground"> — {r.changed_by_name}</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
