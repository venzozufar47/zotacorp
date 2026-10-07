"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Loader2,
  ImageOff,
  X,
  Search,
  CalendarDays,
  RotateCcw,
  Check,
  Paperclip,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { formatDateID } from "@/lib/utils/date-formats";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { compressImageStrict, MAX_EDGE_DOCUMENT } from "@/lib/images/compress-image";
import {
  getCleaningPhotoHistory,
  type PhotoHistoryRow,
  type CleaningChecklist,
} from "@/lib/actions/cleaning.actions";
import {
  setCleaningPhotoVerdict,
  setPhotoAsReference,
  undoReferencePhoto,
  type CleaningRedoReason,
} from "@/lib/actions/cleaning-review.actions";
import type { CleaningEmployee } from "./types";

const ATTACHMENT_BUCKET = "cleaning-photos";
const MAX_ATTACHMENTS = 5;

/**
 * Foto lampiran (contoh/anotasi) yang owner pilih untuk menyertai verdict
 * redo. Diunggah ke storage SEGERA saat dipilih (bukan ditunda sampai submit)
 * supaya progress/kegagalan per file terlihat sebelum owner menekan "Kirim" —
 * gagal setelah verdict sudah tersimpan hanya akan membingungkan.
 */
function AttachmentUploader({
  completionId,
  paths,
  onPathsChange,
}: {
  completionId: string;
  paths: string[];
  onPathsChange: (paths: string[]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Lazy initializer: satu instance dibuat sekali, dipakai handleFiles maupun
  // remove — bukan ref (react-hooks/refs melarang baca/tulis ref saat render).
  const [supabase] = useState(() => createSupabaseClient());

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = MAX_ATTACHMENTS - paths.length;
    if (room <= 0) {
      toast.error(`Maksimal ${MAX_ATTACHMENTS} foto lampiran`);
      return;
    }
    const selected = Array.from(files).slice(0, room);
    setUploading(true);
    // Tiap file independen (path unik per file) — kompres+unggah paralel,
    // bukan satu per satu.
    const results = await Promise.all(
      selected.map(async (file) => {
        let compressed: File;
        try {
          // Tegas: bucket membatasi tipe & ukuran (migrasi 174).
          compressed = await compressImageStrict(file, { maxDim: MAX_EDGE_DOCUMENT });
        } catch (e) {
          toast.error(e instanceof Error ? e.message : `Gagal memproses ${file.name}`);
          return null;
        }
        const ext = compressed.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `review-attachments/${completionId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage
          .from(ATTACHMENT_BUCKET)
          .upload(path, compressed, { contentType: compressed.type, upsert: false });
        if (error) {
          toast.error(`Gagal unggah ${file.name}`);
          return null;
        }
        return path;
      })
    );
    const uploaded = results.filter((p): p is string => !!p);
    if (uploaded.length) onPathsChange([...paths, ...uploaded]);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function remove(path: string) {
    void supabase.storage.from(ATTACHMENT_BUCKET).remove([path]);
    onPathsChange(paths.filter((p) => p !== path));
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {paths.map((p) => (
          <span
            key={p}
            className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-[10.5px] text-white/80"
          >
            <Paperclip size={11} />
            {p.split("/").pop()?.slice(0, 10)}…
            <button
              type="button"
              onClick={() => remove(p)}
              className="text-white/50 hover:text-white"
              aria-label="Hapus lampiran"
            >
              <X size={11} />
            </button>
          </span>
        ))}
        {paths.length < MAX_ATTACHMENTS && (
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-[10.5px] font-semibold text-white/80 hover:bg-white/20 disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Paperclip size={11} />
            )}
            Lampirkan foto
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => void handleFiles(e.target.files)}
      />
    </div>
  );
}

const PAGE = 60;

const REDO_REASONS: Array<{ value: CleaningRedoReason; label: string }> = [
  { value: "angle", label: "Angle kurang tepat" },
  { value: "not_clean", label: "Tempat tidak bersih" },
];

/**
 * Verdict admin atas satu foto: Acc / Angle kurang tepat / Tempat tidak
 * bersih.
 *
 * Dua yang terakhir sama-sama `verdict: "redo"` (karyawan diminta ulang,
 * checkout/check-in terkunci sampai diperbaiki) — bedanya cuma kategori
 * (`redoReason`) yang dibaca dashboard karyawan sebagai badge ringkas.
 * Catatan bebas TETAP wajib untuk keduanya: kategori memberi tahu APA yang
 * salah, catatan memberi tahu BAGAIMANA memperbaikinya — karyawan membaca
 * teks ini di dashboard-nya, jadi ia harus ditulis dengan tenang dan
 * terlihat sebelum dikirim.
 */
function VerdictBar({
  row,
  onDone,
}: {
  row: PhotoHistoryRow;
  onDone: (
    next: Pick<PhotoHistoryRow, "review_status" | "review_note">
  ) => void;
}) {
  const [redoOpen, setRedoOpen] = useState(false);
  const [redoReason, setRedoReason] = useState<CleaningRedoReason>("angle");
  const [note, setNote] = useState(row.review_note ?? "");
  const [attachmentPaths, setAttachmentPaths] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  function send(verdict: "ok" | "redo" | "unreviewed") {
    if (verdict === "redo" && !note.trim()) {
      toast.error("Tulis alasannya dulu");
      return;
    }
    startTransition(async () => {
      const res = await setCleaningPhotoVerdict({
        completionId: row.completion_id,
        verdict,
        redoReason: verdict === "redo" ? redoReason : null,
        note: verdict === "redo" ? note.trim() : null,
        attachmentPaths: verdict === "redo" ? attachmentPaths : undefined,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Gagal menyimpan");
        return;
      }
      toast.success(
        verdict === "redo"
          ? "Ditandai perlu ulang"
          : verdict === "ok"
            ? "Ditandai Acc"
            : "Verdict dibatalkan"
      );
      setRedoOpen(false);
      setAttachmentPaths([]);
      onDone({
        review_status: verdict,
        review_note: verdict === "redo" ? note.trim() : null,
      });
    });
  }

  return (
    <div className="rounded-xl bg-white/10 p-2.5 text-white space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11.5px] text-white/70">
          {row.review_status === "redo"
            ? "Ditandai perlu ulang"
            : row.review_status === "ok"
              ? "Sudah di-Acc"
              : "Belum ditinjau"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {row.review_status !== "unreviewed" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => send("unreviewed")}
              className="rounded-lg px-2 py-1 text-[11.5px] font-semibold text-white/70 hover:text-white disabled:opacity-50"
            >
              Batalkan
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => setRedoOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2.5 py-1 text-[11.5px] font-semibold hover:bg-white/25 disabled:opacity-50"
          >
            <RotateCcw size={12} /> Minta ulang
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => send("ok")}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1 text-[11.5px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {pending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            Acc
          </button>
        </div>
      </div>
      {row.review_status === "redo" && row.review_note && !redoOpen && (
        <p className="text-[11.5px] text-white/80">
          Alasan: {row.review_note}
        </p>
      )}
      {redoOpen && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {REDO_REASONS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRedoReason(r.value)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold transition",
                  redoReason === r.value
                    ? "bg-orange-500 text-white"
                    : "bg-white/10 text-white/70 hover:bg-white/20"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Apa yang harus diulang? Karyawan membaca ini."
            className="w-full rounded-lg bg-black/40 px-2.5 py-2 text-[12.5px] text-white placeholder:text-white/40"
          />
          <AttachmentUploader
            completionId={row.completion_id}
            paths={attachmentPaths}
            onPathsChange={setAttachmentPaths}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRedoOpen(false)}
              className="px-2 py-1 text-[11.5px] text-white/70 hover:text-white"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={pending || !note.trim()}
              onClick={() => send("redo")}
              className="inline-flex items-center gap-1 rounded-lg bg-orange-500 px-2.5 py-1 text-[11.5px] font-semibold hover:bg-orange-600 disabled:opacity-50"
            >
              {pending && <Loader2 size={12} className="animate-spin" />}
              Kirim permintaan ulang
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Jadikan foto ini referensi baru untuk titiknya + batalkan (undo 1 langkah).
 *
 * Dipisah dari VerdictBar karena tidak terkait verdict — foto yang di-Acc
 * MAUPUN yang perlu diulang bisa saja punya alasan dijadikan contoh (yang
 * terakhir jarang, tapi tidak dilarang; admin yang menilai). Nonaktif kalau
 * `photo_req_id` null (checkbox/item tanpa slot foto — tidak ada baris
 * `cleaning_item_photos` untuk ditunjuk).
 */
function ReferenceButton({ row }: { row: PhotoHistoryRow }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  if (!row.photo_req_id) {
    return (
      <span
        className="text-[11px] text-white/40"
        title="Item ini tidak punya slot foto referensi"
      >
        Tidak bisa dijadikan referensi
      </span>
    );
  }

  function setAsRef() {
    startTransition(async () => {
      const res = await setPhotoAsReference({ completionId: row.completion_id });
      if (!res.ok) {
        toast.error(res.error ?? "Gagal menjadikan referensi");
        return;
      }
      toast.success("Dijadikan foto referensi");
      setDone(true);
    });
  }

  function undo() {
    startTransition(async () => {
      const res = await undoReferencePhoto({ photoReqId: row.photo_req_id! });
      if (!res.ok) {
        toast.error(res.error ?? "Gagal membatalkan");
        return;
      }
      toast.success("Dibatalkan");
      setDone(false);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={setAsRef}
        className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2.5 py-1 text-[11.5px] font-semibold text-white hover:bg-white/25 disabled:opacity-50"
      >
        {pending ? <Loader2 size={12} className="animate-spin" /> : null}
        Jadikan referensi
      </button>
      {done && (
        <button
          type="button"
          disabled={pending}
          onClick={undo}
          className="text-[11px] text-white/60 hover:text-white underline disabled:opacity-50"
        >
          Undo jadikan referensi
        </button>
      )}
    </div>
  );
}

function daysAgo(n: number): string {
  return jakartaDateString(new Date(Date.now() - n * 24 * 3600 * 1000));
}

/**
 * Browse past cleaning evidence.
 *
 * The Monitoring tab answers "is today done?"; this answers "show me what the
 * photos actually looked like" across a date range — the view you need when a
 * guest complains about a room that was reported clean all week.
 *
 * Rows arrive with their signed URL already attached (one batch call server
 * side), so scrolling the grid costs nothing extra.
 */
export function PhotoReviewGallery({
  checklists,
  employees,
  items = [],
  initialItemId,
}: {
  checklists: CleaningChecklist[];
  employees: CleaningEmployee[];
  /** Titik yang bisa disaring. Satu checklist bisa punya 10+ titik, jadi
   *  "buka foto Toilet" tanpa ini berarti menyisir seluruh checklist. */
  items?: Array<{ id: string; title: string; checklistId: string }>;
  /** Dibuka langsung tersaring ke satu titik (dari kartu titik / antrean). */
  initialItemId?: string;
}) {
  // Dibuka dari satu titik → rentangnya dilebarkan ke 30 hari. Titik yang
  // ditinjau justru yang lama tak tersentuh; 7 hari sering kosong sama sekali.
  const [from, setFrom] = useState(() => daysAgo(initialItemId ? 30 : 7));
  const [to, setTo] = useState(() => jakartaDateString(new Date()));
  const [checklistId, setChecklistId] = useState(
    () => items.find((i) => i.id === initialItemId)?.checklistId ?? ""
  );
  const [itemId, setItemId] = useState(initialItemId ?? "");
  const [userId, setUserId] = useState("");

  // Default = antrean "Perlu diputuskan" (unreviewed, tanpa batas tanggal —
  // lihat getCleaningPhotoHistory). Dibuka dari satu titik spesifik lewat
  // `initialItemId` justru minta riwayat titik ITU, jadi langsung mode
  // telusur dengan filter terbuka.
  const [mode, setMode] = useState<"queue" | "browse">(
    initialItemId ? "browse" : "queue"
  );
  const [filtersOpen, setFiltersOpen] = useState(!!initialItemId);

  const [rows, setRows] = useState<PhotoHistoryRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [lightbox, setLightbox] = useState<PhotoHistoryRow | null>(null);
  // Offset SERVER, bukan rows.length: di mode antrean, baris yang sudah
  // diputuskan langsung dibuang dari `rows` (lihat onDone di VerdictBar),
  // jadi rows.length menyusut sambil admin bekerja. `nextCursorRef` menyimpan
  // completed_at baris terakhir yang diambil — dipakai "Muat lebih banyak" di
  // mode antrean supaya tidak melewati baris yang belum pernah tampil begitu
  // ada yang sudah diputuskan (lihat catatan di getCleaningPhotoHistory).
  // Mode telusur tetap pakai offset numerik (rows.length aman di sana:
  // barisnya tidak dibuang, cuma statusnya diperbarui di tempat).
  const nextCursorRef = useRef<string | null>(null);

  // `mode` selalu eksplisit dari pemanggil (bukan dibaca dari state) — tak
  // ada jalur yang bisa lupa mengoper mode dan diam-diam jatuh ke `mode`
  // state yang mungkin sudah basi.
  const load = useCallback(
    (mode: "queue" | "browse", opts: { offset?: number; cursor?: string | null }) => {
      const offset = opts.offset ?? 0;
      startTransition(async () => {
        const res = await getCleaningPhotoHistory({
          from: mode === "browse" ? from : null,
          to: mode === "browse" ? to : null,
          review_status: mode === "queue" ? "unreviewed" : null,
          checklist_id: checklistId || null,
          item_id: itemId || null,
          user_id: userId || null,
          limit: PAGE,
          offset,
          after_completed_at: opts.cursor ?? null,
        });
        if ("error" in res) {
          toast.error(res.error);
          return;
        }
        setRows((prev) => (offset === 0 && !opts.cursor ? res.rows : [...prev, ...res.rows]));
        setHasMore(res.hasMore);
        setLoaded(true);
        nextCursorRef.current = res.rows.at(-1)?.completed_at ?? nextCursorRef.current;
      });
    },
    [from, to, checklistId, itemId, userId]
  );

  function showQueue() {
    setMode("queue");
    setFiltersOpen(false);
    nextCursorRef.current = null;
    load("queue", {});
  }

  function showBrowse() {
    setMode("browse");
    load("browse", {});
  }

  function loadMore() {
    if (mode === "queue") {
      load("queue", { cursor: nextCursorRef.current });
    } else {
      load("browse", { offset: rows.length });
    }
  }

  // First paint only; afterwards the user drives it with "Tampilkan"/antrean.
  useEffect(() => {
    load(initialItemId ? "browse" : "queue", {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kelompokkan per CABANG dulu (yang paling sering ditanya: "coba lihat
  // Tembalang hari ini"), lalu per tanggal di dalamnya supaya tetap terbaca
  // sebagai linimasa, bukan tumpukan foto tak berurutan.
  const byBranch = rows.reduce<Record<string, PhotoHistoryRow[]>>((acc, r) => {
    (acc[r.branch_name] ??= []).push(r);
    return acc;
  }, {});
  const branches = Object.keys(byBranch).sort((a, b) => a.localeCompare(b));

  // Urutan linear yang SAMA PERSIS dengan urutan tampil di grid (cabang asc,
  // tanggal desc, lalu urutan asli dalam tanggal — sort stabil menjaga itu
  // tanpa perlu membangun ulang nested groupnya). Dipakai VerdictBar.onDone
  // untuk tahu "foto berikutnya" begitu verdict dikirim, supaya admin bisa
  // menilai berturut-turut tanpa keluar-masuk lightbox tiap foto.
  const flatOrder = [...rows].sort((a, b) => {
    const branchCmp = a.branch_name.localeCompare(b.branch_name);
    if (branchCmp !== 0) return branchCmp;
    return b.date.localeCompare(a.date);
  });

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display font-bold text-[15px]">
              {mode === "queue" ? "Perlu diputuskan" : "Review Foto"}
            </h3>
            <p className="text-[12.5px] text-muted-foreground mt-0.5">
              {mode === "queue"
                ? "Foto TERBARU per titik yang belum di-Acc atau diminta ulang. Kalau titik yang sama sudah difoto lagi tanpa sempat ditinjau, foto lama otomatis dianggap Acc."
                : "Telusuri bukti foto yang sudah dikirim karyawan. Foto disimpan 90 hari, setelah itu terhapus otomatis — catatan pengerjaannya tetap ada."}
            </p>
          </div>
          {mode === "browse" && (
            <button
              type="button"
              onClick={showQueue}
              className="shrink-0 rounded-full border border-border px-2.5 py-1 text-[11.5px] font-semibold hover:bg-muted"
            >
              ← Antrean
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          className="flex items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground"
        >
          <span
            className={cn(
              "inline-block transition-transform",
              filtersOpen ? "rotate-90" : ""
            )}
            aria-hidden
          >
            ▸
          </span>
          Filter &amp; tanggal
        </button>

        {filtersOpen && (
          <>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
              Dari
            </span>
            <Input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1"
            />
          </label>
          <label className="block">
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
              Sampai
            </span>
            <Input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1"
            />
          </label>
          <label className="block">
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
              Checklist
            </span>
            <select
              value={checklistId}
              onChange={(e) => {
                setChecklistId(e.target.value);
                // Titik terikat checklist-nya; menyisakan pilihan titik dari
                // checklist lain akan menghasilkan filter yang tak mungkin cocok.
                setItemId("");
              }}
              className="mt-1 w-full h-10 rounded-xl border border-border bg-card px-3 text-[13px]"
            >
              <option value="">Semua checklist</option>
              {checklists.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {items.length > 0 && (
            <label className="block">
              <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
                Titik
              </span>
              <select
                value={itemId}
                onChange={(e) => setItemId(e.target.value)}
                className="mt-1 w-full h-10 rounded-xl border border-border bg-card px-3 text-[13px]"
              >
                <option value="">Semua titik</option>
                {items
                  .filter((i) => !checklistId || i.checklistId === checklistId)
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.title}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
              Karyawan
            </span>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="mt-1 w-full h-10 rounded-xl border border-border bg-card px-3 text-[13px]"
            >
              <option value="">Semua karyawan</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={showBrowse} disabled={pending}>
            {pending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Search size={14} />
            )}
            Tampilkan
          </Button>
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setFrom(daysAgo(d));
                setTo(jakartaDateString(new Date()));
              }}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-[12px] hover:bg-muted"
            >
              <CalendarDays size={12} /> {d} hari
            </button>
          ))}
        </div>
          </>
        )}

        {loaded && (
          <span className="block text-[12px] text-muted-foreground">
            {rows.length} foto{hasMore ? "+" : ""}
          </span>
        )}
      </div>

      {loaded && rows.length === 0 && (
        <p className="text-[13px] text-muted-foreground px-1">
          {mode === "queue"
            ? "Tidak ada yang perlu diputuskan. Semua titik sudah Acc atau menunggu foto berikutnya."
            : "Tidak ada foto pada rentang ini."}
        </p>
      )}

      {branches.map((branch) => {
        const branchRows = byBranch[branch];
        const byDate = branchRows.reduce<Record<string, PhotoHistoryRow[]>>(
          (acc, r) => {
            (acc[r.date] ??= []).push(r);
            return acc;
          },
          {}
        );
        const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
        return (
          <div key={branch} className="space-y-3">
            <div className="flex items-baseline gap-2 border-b border-border pb-1.5">
              <h4 className="font-display font-bold text-[15px]">{branch}</h4>
              <span className="text-[11.5px] text-muted-foreground">
                {branchRows.length} foto
              </span>
            </div>
            {dates.map((d) => (
              <div key={d} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-display font-semibold text-[13px] text-foreground/80">
                    {formatDateID(d)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {byDate[d].length} foto
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                  {byDate[d].map((r) => (
                    <button
                      key={r.completion_id}
                      type="button"
                      onClick={() => r.url && setLightbox(r)}
                      disabled={!r.url}
                      className={cn(
                        "group text-left rounded-xl border border-border bg-card overflow-hidden transition",
                        r.url ? "hover:-translate-y-0.5 hover:shadow-md" : "opacity-70"
                      )}
                    >
                      <div className="relative aspect-square bg-muted">
                        {r.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={r.url}
                            alt={r.label ?? r.item_title}
                            loading="lazy"
                            decoding="async"
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        ) : (
                          <div className="absolute inset-0 grid place-items-center text-muted-foreground gap-1 px-2 text-center">
                            <ImageOff size={18} />
                            <span className="text-[10.5px] leading-tight">
                              {r.purged ? "Terhapus (retensi 90 hari)" : "Foto hilang"}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="p-2 space-y-0.5">
                        <div className="text-[11.5px] font-medium leading-tight line-clamp-2">
                          {r.label ?? r.item_title}
                        </div>
                        <div className="text-[10.5px] text-muted-foreground truncate">
                          {r.item_title}
                        </div>
                        <div className="text-[10.5px] text-muted-foreground truncate">
                          {r.user_name}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {hasMore && (
        <div className="flex justify-center">
          <Button
            size="sm"
            variant="outline"
            onClick={loadMore}
            disabled={pending}
          >
            {pending && <Loader2 size={14} className="animate-spin" />}
            Muat lebih banyak
          </Button>
        </div>
      )}

      {lightbox?.url && (
        <div
          // w-screen/h-screen: lihat catatan di Drawer (CleaningOverview.tsx)
          // — inset-0 saja tidak selalu ter-resolve ke viewport visual yang
          // benar di mobile. overflow-y-auto + [place-items:safe_center]
          // WAJIB: konten (foto + verdict + lampiran) bisa lebih tinggi dari
          // viewport, dan plain place-items-center pada elemen fixed membuat
          // bagian yang meluber ke ATAS sama sekali tak terjangkau scroll
          // (browser tidak membuat area scroll negatif) — "safe" membuatnya
          // jatuh ke rata-atas begitu overflow, bukan tetap dipaksa center.
          className="fixed inset-0 z-50 grid w-screen h-screen [place-items:safe_center] overflow-y-auto bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          <div
            className="max-w-3xl w-full space-y-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 text-white">
              <div className="min-w-0">
                <div className="font-display font-bold text-[14px]">
                  {lightbox.label ?? lightbox.item_title}
                </div>
                <div className="text-[12px] text-white/70">
                  {lightbox.checklist_name} · {lightbox.item_title}
                </div>
                <div className="text-[12px] text-white/70">
                  {lightbox.user_name} · {formatDateID(lightbox.date)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLightbox(null)}
                className="shrink-0 rounded-full bg-white/10 p-2 hover:bg-white/20 text-white"
                aria-label="Tutup"
              >
                <X size={16} />
              </button>
            </div>
            {lightbox.reference_url ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="block text-[10.5px] font-semibold uppercase tracking-wider text-white/60">
                    Foto karyawan
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={lightbox.url}
                    alt={lightbox.label ?? lightbox.item_title}
                    className="w-full max-h-[50vh] sm:max-h-[60vh] object-contain rounded-xl bg-black"
                  />
                </div>
                <div className="space-y-1">
                  <span className="block text-[10.5px] font-semibold uppercase tracking-wider text-white/60">
                    Foto referensi (contoh)
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={lightbox.reference_url}
                    alt={`Referensi ${lightbox.label ?? lightbox.item_title}`}
                    className="w-full max-h-[50vh] sm:max-h-[60vh] object-contain rounded-xl bg-black"
                  />
                </div>
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={lightbox.url}
                alt={lightbox.label ?? lightbox.item_title}
                className="w-full max-h-[65vh] object-contain rounded-xl bg-black"
              />
            )}
            <VerdictBar
              row={lightbox}
              onDone={(next) => {
                // Lompat ke foto berikutnya di urutan grid begitu verdict
                // terkirim — admin menilai antrean berturut-turut tanpa harus
                // keluar & pilih lagi satu per satu. null kalau ini yang
                // terakhir (queue: tutup lightbox; browse: tetap di foto ini).
                const idx = flatOrder.findIndex(
                  (r) => r.completion_id === lightbox.completion_id
                );
                const nextRow = idx >= 0 ? (flatOrder[idx + 1] ?? null) : null;

                if (mode === "queue" && next.review_status !== "unreviewed") {
                  // Sudah diputuskan → keluar dari antrean.
                  setRows((rs) =>
                    rs.filter((r) => r.completion_id !== lightbox.completion_id)
                  );
                  setLightbox(nextRow);
                  return;
                }
                // Mode telusur: perbarui di tempat TANPA menutup lightbox —
                // admin biasanya menilai beberapa foto berturut-turut, dan
                // menutup paksa tiap kali membuat ia kehilangan tempatnya.
                setRows((rs) =>
                  rs.map((r) =>
                    r.completion_id === lightbox.completion_id
                      ? { ...r, ...next }
                      : r
                  )
                );
                setLightbox(nextRow ?? ((l) => (l ? { ...l, ...next } : l)));
              }}
            />
            <ReferenceButton row={lightbox} />
          </div>
        </div>
      )}
    </div>
  );
}
