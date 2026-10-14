"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCheck, ChevronDown, ChevronRight, History, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  setChecklistGovernance,
  markChecklistReviewed,
  listChecklistRevisions,
  type ChecklistRevisionRow,
} from "@/lib/actions/cleaning-governance.actions";
import { REVIEW_INTERVAL_OPTIONS, reviewDue } from "@/lib/cleaning/governance";
import { jakartaDateString } from "@/lib/utils/jakarta";
import type { CleaningChecklist } from "@/lib/actions/cleaning.actions";
import type { CleaningEmployee } from "./types";

const selectCls =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm";

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
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Pemilik, jadwal tinjau ulang, dan riwayat perubahan satu SOP. SOP yang ditulis
 * sekali lalu dibiarkan cepat usang — pemilik + tanggal tinjau membuat usangnya
 * terlihat (dan muncul di Inbox beranda saat jatuh tempo).
 */
export function ChecklistGovernance({
  checklist: cl,
  employees,
}: {
  checklist: CleaningChecklist;
  employees: CleaningEmployee[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [owner, setOwner] = useState(cl.owner_id ?? "");
  const [every, setEvery] = useState(cl.review_every_days ? String(cl.review_every_days) : "");
  const [reviewNote, setReviewNote] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<ChecklistRevisionRow[] | null>(null);

  const dirty =
    owner !== (cl.owner_id ?? "") || every !== (cl.review_every_days ? String(cl.review_every_days) : "");

  const due = reviewDue(cl, jakartaDateString(new Date()));
  const options: number[] = [...REVIEW_INTERVAL_OPTIONS];
  // Nilai di luar daftar (mis. diisi lewat SQL) tetap terlihat, bukan hilang.
  if (cl.review_every_days && !options.includes(cl.review_every_days)) {
    options.push(cl.review_every_days);
    options.sort((a, b) => a - b);
  }

  // Muat riwayat saat dibuka, dan muat ulang setelah halaman direfresh
  // (cl.revised_at berubah tiap ada perubahan baru).
  useEffect(() => {
    if (!showHistory) return;
    let alive = true;
    void listChecklistRevisions({ checklist_id: cl.id }).then((rows) => {
      if (alive) setHistory(rows);
    });
    return () => {
      alive = false;
    };
  }, [showHistory, cl.id, cl.revised_at, cl.last_reviewed_at]);

  function save() {
    start(async () => {
      const res = await setChecklistGovernance({
        id: cl.id,
        owner_id: owner || null,
        review_every_days: every ? Number(every) : null,
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Pemilik & jadwal tinjau disimpan");
      router.refresh();
    });
  }

  function markReviewed() {
    start(async () => {
      const res = await markChecklistReviewed({ id: cl.id, note: reviewNote || null });
      if (!res.ok) return void toast.error(res.error);
      toast.success("SOP ditandai sudah ditinjau");
      setReviewNote("");
      router.refresh();
    });
  }

  return (
    <div className="mx-4 mt-3 space-y-2.5 rounded-xl border border-border bg-muted/30 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs font-medium">
          Pemilik SOP
          <select className={`${selectCls} mt-1`} value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">— tanpa pemilik —</option>
            {/* Pemilik yang sudah tidak aktif tetap tampil agar tidak terhapus diam-diam. */}
            {cl.owner_id && !employees.some((e) => e.id === cl.owner_id) && (
              <option value={cl.owner_id}>{cl.owner_name ?? "Pemilik lama"}</option>
            )}
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
                {e.business_unit ? ` · ${e.business_unit}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium">
          Tinjau ulang
          <select className={`${selectCls} mt-1`} value={every} onChange={(e) => setEvery(e.target.value)}>
            <option value="">Tidak dijadwalkan</option>
            {options.map((d) => (
              <option key={d} value={d}>
                tiap {d} hari
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Pemilik menerima pengingat tinjau ulang & kendala/masukan dari rekan lewat notifikasi, dan punya halaman
        <b> SOP saya</b> untuk menandai sudah ditinjau serta menutup kendala/masukan. Tanpa pemilik, semuanya masuk ke admin.
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
        <span>
          Ditinjau terakhir:{" "}
          <b className="text-foreground">
            {cl.last_reviewed_at ? fmtDate(cl.last_reviewed_at) : "belum pernah"}
          </b>
        </span>
        <span>
          Diubah terakhir:{" "}
          <b className="text-foreground">{cl.revised_at ? fmtDate(cl.revised_at) : "—"}</b>
        </span>
        {due && (
          <span className={due.daysLeft <= 0 ? "font-semibold text-destructive" : undefined}>
            Tinjau berikutnya: {fmtYmd(due.dueYmd)}
            {due.daysLeft < 0
              ? ` (lewat ${-due.daysLeft} hari)`
              : due.daysLeft === 0
                ? " (hari ini)"
                : ` (${due.daysLeft} hari lagi)`}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={save} disabled={pending || !dirty} className="gap-1.5">
          {pending && <Loader2 size={13} className="animate-spin" />}
          Simpan
        </Button>
        <Input
          value={reviewNote}
          onChange={(e) => setReviewNote(e.target.value)}
          placeholder="Catatan tinjauan (opsional)"
          className="h-8 min-w-[10rem] flex-1 text-xs"
          maxLength={200}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={markReviewed}
          disabled={pending}
          className="gap-1.5"
        >
          <CheckCheck size={13} /> Tandai sudah ditinjau
        </Button>
      </div>

      <button
        type="button"
        onClick={() => setShowHistory((v) => !v)}
        className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-muted-foreground hover:text-foreground"
      >
        {showHistory ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <History size={12} /> Riwayat perubahan
      </button>
      {showHistory &&
        (history === null ? (
          <p className="text-[11.5px] text-muted-foreground">Memuat…</p>
        ) : history.length === 0 ? (
          <p className="text-[11.5px] text-muted-foreground">
            Belum ada perubahan tercatat. Perubahan dicatat sejak fitur ini aktif.
          </p>
        ) : (
          <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
            {history.map((r) => (
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
        ))}
    </div>
  );
}
