"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createCoachingNote, setCleaningPhotoVerdict, type CleaningRedoReason } from "@/lib/actions/cleaning-review.actions";
import { resolveItemIssue } from "@/lib/actions/cleaning-governance.actions";
import { ackFinding, createSopFix, unackFinding } from "@/lib/actions/cleaning-sop.actions";
import type { PhotoHistoryRow } from "@/lib/actions/cleaning.actions";
import type { CleaningRangeReportWithNames } from "@/lib/actions/cleaning-range.actions";
import type { PointReport } from "@/lib/cleaning/range-report";
import {
  FIX_OPTIONS,
  buildFindings,
  traceOf,
  type Finding,
  type FindingIssueInput,
  type RevisionRow,
  type SopFixRow,
} from "@/lib/cleaning/sop-findings";
import { BTN, BTN_PRIMARY, fmtDay, firstName } from "./shared";

/**
 * Keadaan bersama halaman SOP: daftar temuan terbuka, perbaikan, dan tiga dialog tindakan
 * (catatan pembinaan, perbaiki SOP, minta ulang foto). Semua tindakan menulis ke database lewat
 * server action yang sudah ada; "sudah dicek" bisa diurungkan, yang lain tidak (verdict foto
 * dan catatan memang sudah terkirim ke karyawan).
 */

type Report = CleaningRangeReportWithNames;

interface SopCtx {
  report: Report;
  nameOf: (userId: string) => string;
  pointOf: (itemId: string) => PointReport | undefined;
  branchName: (key: string) => string;
  titleOf: (itemId: string) => string;
  /** Temuan terbuka (sudah dikurangi yang dicek). */
  open: Finding[];
  fixes: SopFixRow[];
  revisions: RevisionRow[];
  /** Buka drawer Pengaturan SOP (tempat checklist benar-benar diubah). */
  openSetup: () => void;
  /** Foto yang perlu dinilai + yang lain; semuanya persisten. */
  approve: (f: Finding | null, rows: PhotoHistoryRow[]) => Promise<boolean>;
  askRedo: (f: Finding | null, rows: PhotoHistoryRow[], defaultIdx?: number, onDone?: () => void) => void;
  askNote: (f: Finding) => void;
  askFix: (f: Finding) => void;
  markChecked: (f: Finding) => void;
}

const Ctx = createContext<SopCtx | null>(null);
export const useSop = (): SopCtx => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSop di luar SopProvider");
  return v;
};

type Dlg =
  | { t: "note"; f: Finding }
  | { t: "fix"; f: Finding }
  | { t: "redo"; f: Finding | null; rows: PhotoHistoryRow[]; idx: number; onDone?: () => void }
  | null;

export function SopProvider({
  report,
  issues,
  acks,
  fixes,
  revisions,
  onOpenSetup,
  children,
}: {
  report: Report;
  issues: FindingIssueInput[];
  /** `${itemId}|${ackKey}` dari server. */
  acks: string[];
  fixes: SopFixRow[];
  revisions: RevisionRow[];
  onOpenSetup: () => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [localAck, setLocalAck] = useState<Set<string>>(() => new Set());
  const [localUnack, setLocalUnack] = useState<Set<string>>(() => new Set());
  const [dlg, setDlg] = useState<Dlg>(null);

  const points = useMemo(() => new Map(report.points.map((p) => [p.itemId, p])), [report.points]);
  const branchNames = useMemo(() => new Map(report.branches.map((b) => [b.key, b.name])), [report.branches]);
  const nameOf = useCallback((id: string) => report.names[id] ?? "—", [report.names]);

  const ackedSet = useMemo(() => {
    const s = new Set(acks);
    localAck.forEach((k) => s.add(k));
    localUnack.forEach((k) => s.delete(k));
    return s;
  }, [acks, localAck, localUnack]);

  const open = useMemo(() => buildFindings(report, issues, ackedSet), [report, issues, ackedSet]);

  const hideLocal = useCallback((f: Finding) => {
    const k = `${f.itemId}|${f.ackKey}`;
    setLocalAck((s) => new Set(s).add(k));
    setLocalUnack((s) => {
      const n = new Set(s);
      n.delete(k);
      return n;
    });
  }, []);

  /** Tandai selesai di database (ack) supaya temuan yang sudah ditindak tidak muncul lagi. */
  const persistAck = useCallback(
    async (f: Finding) => {
      hideLocal(f);
      const res = await ackFinding({ itemId: f.itemId, ackKey: f.ackKey });
      if (!res.ok) toast.error(`Tindakan tersimpan, tapi penanda temuan gagal: ${res.error}`);
    },
    [hideLocal]
  );

  const markChecked = useCallback(
    (f: Finding) => {
      void (async () => {
        if (f.kind === "issue" && f.issueId) {
          // Kendala karyawan punya status sendiri; "dicek" berarti ditutup.
          const res = await resolveItemIssue({ id: f.issueId });
          if (!res.ok) return void toast.error(res.error);
          hideLocal(f);
          toast.success("Kendala ditutup");
          router.refresh();
          return;
        }
        hideLocal(f);
        const res = await ackFinding({ itemId: f.itemId, ackKey: f.ackKey });
        if (!res.ok) {
          setLocalAck((s) => {
            const n = new Set(s);
            n.delete(`${f.itemId}|${f.ackKey}`);
            return n;
          });
          return void toast.error(res.error);
        }
        toast("Ditandai sudah dicek", {
          action: {
            label: "Urungkan",
            onClick: () => {
              const k = `${f.itemId}|${f.ackKey}`;
              setLocalUnack((s) => new Set(s).add(k));
              void unackFinding({ itemId: f.itemId, ackKey: f.ackKey }).then(() => router.refresh());
            },
          },
        });
        router.refresh();
      })();
    },
    [hideLocal, router]
  );

  const approve = useCallback(
    async (f: Finding | null, rows: PhotoHistoryRow[]) => {
      const todo = rows.filter((r) => r.review_status !== "ok");
      const results = await Promise.all(
        todo.map((r) => setCleaningPhotoVerdict({ completionId: r.completion_id, verdict: "ok" }))
      );
      const bad = results.find((r) => !r.ok);
      if (bad && !bad.ok) {
        toast.error(bad.error);
        return false;
      }
      if (f) await persistAck(f);
      toast.success(todo.length ? `${todo.length} foto diterima` : "Sudah diterima");
      router.refresh();
      return true;
    },
    [persistAck, router]
  );

  const value: SopCtx = {
    report,
    nameOf,
    pointOf: (id) => points.get(id),
    branchName: (k) => branchNames.get(k) ?? "—",
    titleOf: (id) => points.get(id)?.title ?? "—",
    open,
    fixes,
    revisions,
    openSetup: onOpenSetup,
    approve,
    askRedo: (f, rows, idx = 0, onDone) => setDlg({ t: "redo", f, rows, idx, onDone }),
    askNote: (f) => setDlg({ t: "note", f }),
    askFix: (f) => setDlg({ t: "fix", f }),
    markChecked,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      {dlg?.t === "note" && (
        <NoteDialog
          f={dlg.f}
          onClose={() => setDlg(null)}
          onSent={() => {
            const f = dlg.f;
            setDlg(null);
            void persistAck(f);
            router.refresh();
          }}
        />
      )}
      {dlg?.t === "fix" && (
        <FixDialog
          f={dlg.f}
          onClose={() => setDlg(null)}
          onSaved={() => {
            const f = dlg.f;
            setDlg(null);
            void persistAck(f);
            router.refresh();
          }}
        />
      )}
      {dlg?.t === "redo" && (
        <RedoDialog
          rows={dlg.rows}
          startIdx={dlg.idx}
          onClose={() => setDlg(null)}
          onSent={() => {
            const { f, onDone } = dlg;
            setDlg(null);
            if (f) void persistAck(f);
            onDone?.();
            router.refresh();
          }}
        />
      )}
    </Ctx.Provider>
  );
}

/* ── dialog ──────────────────────────────────────────────────────────────── */

function Veil({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  if (!mounted) return null;
  // Portal ke <body>: induknya beranimasi (transform), yang membuat `fixed` relatif ke induk.
  return createPortal(
    <div data-sop-dialog className="fixed inset-0 z-[80] grid h-screen w-screen place-items-center bg-[rgba(12,18,20,0.5)] p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[92vh] w-full max-w-[460px] flex-col gap-[11px] text-[13.5px] leading-[normal] overflow-auto rounded-2xl border border-border bg-card p-[18px] shadow-[0_30px_80px_rgba(0,20,24,0.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

function periodOf(report: Report): { from: string; to: string } {
  const start = Math.max(0, report.days.length - report.scoreDays);
  return { from: report.days[start]?.ymd ?? report.from, to: report.to };
}

function NoteDialog({ f, onClose, onSent }: { f: Finding; onClose: () => void; onSent: () => void }) {
  const { report, nameOf, titleOf, branchName } = useSop();
  const uid = f.userId ?? (f.assigneeIds.length === 1 ? f.assigneeIds[0] : null);
  const [target, setTarget] = useState<string | null>(uid ?? f.assigneeIds[0] ?? null);
  const title = titleOf(f.itemId);
  const draft =
    f.kind === "miss"
      ? `${title} belum dikerjakan ${f.miss} hari kerja. Mohon dikerjakan hari ini dan kabari jika ada kendala.`
      : f.kind === "redo"
        ? `Foto ${title}${f.ymd ? ` tanggal ${fmtDay(f.ymd)}` : ""} belum memenuhi standar. Mohon diulang.`
        : f.kind === "rushed" && f.rushed
          ? `Foto ${title} masuk sangat cepat (${f.rushed.secPerPhoto} dtk/foto). Pastikan tiap slot benar-benar dikerjakan sebelum difoto.`
          : f.kind === "stale"
            ? `${title} belum tercatat dikerjakan. Mohon dikerjakan dan difoto sesuai SOP.`
            : `Terkait ${title}: `;
  const [body, setBody] = useState(draft);
  const [pending, start] = useTransition();
  const who = target ? nameOf(target) : null;
  const candidates = [...new Set([...(f.userId ? [f.userId] : []), ...f.assigneeIds])];

  function submit() {
    if (!target || !body.trim()) return;
    start(async () => {
      const p = periodOf(report);
      const res = await createCoachingNote({ userId: target, body: body.trim(), context: "cleaning", periodFrom: p.from, periodTo: p.to });
      if (!res.ok) return void toast.error(res.error ?? "Gagal mengirim");
      toast.success(`Catatan terkirim ke ${firstName(who)}`);
      onSent();
    });
  }
  return (
    <Veil onClose={onClose}>
      <div>
        <h3 className="font-display text-base font-bold">Catatan pembinaan{who ? ` — ${who}` : ""}</h3>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
          Tampil di dashboard {firstName(who)} saat ia masuk. Tidak dikirim sebagai notifikasi. Terkait {title}, {branchName(f.branchKey)}. Draf terisi otomatis, silakan ubah.
        </p>
      </div>
      {candidates.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {candidates.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTarget(id)}
              className={`rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${
                target === id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {firstName(nameOf(id))}
            </button>
          ))}
        </div>
      )}
      {!target ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-[12px] text-muted-foreground">
          Petugas titik ini ditentukan dari kehadiran cabang, jadi belum ada orang yang bisa dituju. Gunakan tab Kerajinan karyawan untuk memilih orangnya.
        </p>
      ) : (
        <textarea
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          autoFocus
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={pending} className={BTN}>
          Batal
        </button>
        <button type="button" onClick={submit} disabled={pending || !target || !body.trim()} className={BTN_PRIMARY}>
          {pending && <Loader2 size={14} className="animate-spin" />} Kirim catatan
        </button>
      </div>
    </Veil>
  );
}

function FixDialog({ f, onClose, onSaved }: { f: Finding; onClose: () => void; onSaved: () => void }) {
  const { pointOf, nameOf, titleOf, branchName, openSetup } = useSop();
  const point = pointOf(f.itemId);
  const tr = useMemo(() => (point ? traceOf(point, nameOf) : null), [point, nameOf]);
  const [i, setI] = useState(() => (tr?.cause.kind === "sop" ? 0 : 3));
  const [note, setNote] = useState(f.kind === "issue" ? f.reason ?? "" : "");
  const [pending, start] = useTransition();
  const base = tr?.pct ?? 0;

  function submit() {
    start(async () => {
      const res = await createSopFix({ itemId: f.itemId, branchKey: f.branchKey, action: FIX_OPTIONS[i][0], note, basePct: base });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Perbaikan SOP dicatat. Ubah checklist-nya di Pengaturan SOP — pemantauan 7 hari mulai saat itu.", {
        duration: 9000,
        action: { label: "Buka Pengaturan SOP", onClick: openSetup },
      });
      onSaved();
    });
  }
  return (
    <Veil onClose={onClose}>
      <div>
        <h3 className="font-display text-base font-bold">Perbaiki SOP — {titleOf(f.itemId)}</h3>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
          {branchName(f.branchKey)} · kepatuhan titik 14 hari terakhir {base}%. Ini mencatat keputusannya; perubahan isi SOP-nya dilakukan di Pengaturan SOP. Pemantauan 7 hari kerja baru dimulai saat checklist-nya benar-benar diubah.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        {FIX_OPTIONS.map(([a, b], n) => (
          <button
            key={a}
            type="button"
            onClick={() => setI(n)}
            className={`flex items-start gap-2.5 rounded-xl border px-3 py-2 text-left text-[12.5px] ${
              n === i ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
            }`}
          >
            <i
              className={`mt-0.5 size-3.5 shrink-0 rounded-full border-2 ${
                n === i ? "border-primary bg-[radial-gradient(var(--color-primary)_45%,transparent_50%)]" : "border-muted-foreground/40"
              }`}
            />
            <span>
              <b className="font-display">{a}</b>
              <br />
              <span className="text-[11.5px] text-muted-foreground">{b}</span>
            </span>
          </button>
        ))}
      </div>
      <textarea
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        placeholder="Apa yang diubah, dan hasil yang diharapkan?"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={pending} className={BTN}>
          Batal
        </button>
        <button type="button" onClick={submit} disabled={pending} className={BTN_PRIMARY}>
          {pending && <Loader2 size={14} className="animate-spin" />} Simpan &amp; mulai pantau
        </button>
      </div>
    </Veil>
  );
}

const REDO_TEXT: Record<CleaningRedoReason, string> = {
  angle: "Angle foto kurang tepat. Mohon ambil ulang dari sudut yang sama dengan foto contoh.",
  not_clean: "Area belum bersih. Mohon dibersihkan ulang lalu difoto lagi.",
};

function RedoDialog({
  rows,
  startIdx,
  onClose,
  onSent,
}: {
  rows: PhotoHistoryRow[];
  startIdx: number;
  onClose: () => void;
  onSent: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(rows[startIdx] ? [rows[startIdx].completion_id] : []));
  const [reason, setReason] = useState<CleaningRedoReason>("not_clean");
  const [note, setNote] = useState(REDO_TEXT.not_clean);
  const [pending, start] = useTransition();
  const [touched, setTouched] = useState(false);

  function pickReason(r: CleaningRedoReason) {
    setReason(r);
    // Jangan menimpa tulisan admin sendiri.
    if (!touched) setNote(REDO_TEXT[r]);
  }
  function submit() {
    const ids = rows.filter((r) => picked.has(r.completion_id)).map((r) => r.completion_id);
    if (ids.length === 0 || !note.trim()) return;
    start(async () => {
      const results = await Promise.all(
        ids.map((completionId) => setCleaningPhotoVerdict({ completionId, verdict: "redo", redoReason: reason, note: note.trim() }))
      );
      const bad = results.find((r) => !r.ok);
      if (bad && !bad.ok) return void toast.error(bad.error);
      toast.success(`${ids.length} foto diminta ulang`);
      onSent();
    });
  }
  return (
    <Veil onClose={onClose}>
      <div>
        <h3 className="font-display text-base font-bold">Minta ulang foto</h3>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
          Alasan ini dibaca karyawan di dashboard-nya, jadi tulis cukup jelas untuk ditindak tanpa bertanya balik.
        </p>
      </div>
      {rows.length > 1 && (
        <div className="space-y-1">
          <div className="text-[11px] font-semibold text-muted-foreground">Foto yang diulang</div>
          {rows.map((r, n) => (
            <label key={r.completion_id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-[12px]">
              <input
                type="checkbox"
                checked={picked.has(r.completion_id)}
                onChange={(e) =>
                  setPicked((s) => {
                    const nx = new Set(s);
                    if (e.target.checked) nx.add(r.completion_id);
                    else nx.delete(r.completion_id);
                    return nx;
                  })
                }
              />
              <span className="truncate">{r.label ?? `Foto ${n + 1}`}</span>
            </label>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {(["not_clean", "angle"] as CleaningRedoReason[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => pickReason(r)}
            className={`rounded-lg border px-2.5 py-2 text-[12.5px] font-semibold ${
              reason === r ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted"
            }`}
          >
            {r === "not_clean" ? "Tempat tidak bersih" : "Angle kurang tepat"}
          </button>
        ))}
      </div>
      <textarea
        rows={3}
        value={note}
        maxLength={500}
        onChange={(e) => {
          setTouched(true);
          setNote(e.target.value);
        }}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={pending} className={BTN}>
          Batal
        </button>
        <button type="button" onClick={submit} disabled={pending || picked.size === 0 || !note.trim()} className={BTN_PRIMARY}>
          {pending && <Loader2 size={14} className="animate-spin" />} Minta ulang
        </button>
      </div>
    </Veil>
  );
}

