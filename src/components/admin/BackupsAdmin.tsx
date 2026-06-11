"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  Database,
  Download,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  Play,
  Loader2,
  Check,
  X,
  FileJson,
} from "lucide-react";
import { toast } from "sonner";
import {
  deleteBackupRun,
  getBackupSignedUrl,
  restoreFromBundle,
  runBackupNow,
  updateBackupSettings,
} from "@/lib/actions/backup.actions";
import {
  BACKUP_CATEGORIES,
  BACKUP_CATEGORY_LABELS,
  type BackupCadence,
  type BackupCategory,
  type BackupRunRow,
  type BackupSettings,
  type FullBackupBundle,
} from "@/lib/backups/categories";

interface Props {
  settings: BackupSettings | null;
  runs: BackupRunRow[];
}

const CADENCE_OPTIONS: Array<{ id: BackupCadence; label: string }> = [
  { id: "daily", label: "Harian (24 jam)" },
  { id: "every_2_days", label: "Setiap 2 hari" },
  { id: "weekly", label: "Mingguan (7 hari)" },
];

export function BackupsAdmin({ settings, runs }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(settings?.enabled ?? true);
  const [cadence, setCadence] = useState<BackupCadence>(
    settings?.cadence ?? "daily"
  );
  const [retention, setRetention] = useState(
    String(settings?.retention_days ?? 30)
  );
  const [restoreFile, setRestoreFile] = useState<{
    name: string;
    bundle: FullBackupBundle;
    rawJson: string;
  } | null>(null);

  const settingsDirty =
    settings == null ||
    enabled !== settings.enabled ||
    cadence !== settings.cadence ||
    String(settings.retention_days) !== retention;

  const onSaveSettings = () => {
    startTransition(async () => {
      const res = await updateBackupSettings({
        enabled,
        cadence,
        retentionDays: parseInt(retention, 10) || 30,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Pengaturan disimpan");
      router.refresh();
    });
  };

  const onBackupNow = () => {
    startTransition(async () => {
      const res = await runBackupNow();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      // Trigger browser download. Isi blob = JSON mentah (bukan gzip yang
      // disimpan di bucket) → buang suffix .gz dari nama file unduhan.
      const blob = new Blob([res.data!.bundleJson], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.data!.fileName.replace(/\.gz$/, "");
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(
        `Backup berhasil · ${formatBytes(res.data!.sizeBytes)} · file diunduh`
      );
      router.refresh();
    });
  };

  const onDeleteRun = (run: BackupRunRow) => {
    if (
      !window.confirm(
        `Hapus backup ${format(new Date(run.created_at), "d MMM HH:mm")}? File ikut dihapus dari server.`
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteBackupRun(run.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Backup dihapus");
      router.refresh();
    });
  };

  const onReDownload = (run: BackupRunRow) => {
    startTransition(async () => {
      const res = await getBackupSignedUrl(run.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      window.open(res.data!.url, "_blank");
    });
  };

  const onPickRestoreFile = async (file: File) => {
    try {
      // Backup di storage kini ter-gzip (.json.gz) — decompress di browser.
      // File .json lama tetap didukung.
      let text: string;
      if (file.name.endsWith(".gz")) {
        const ds = new DecompressionStream("gzip");
        const stream = file.stream().pipeThrough(ds);
        text = await new Response(stream).text();
      } else {
        text = await file.text();
      }
      const parsed = JSON.parse(text) as FullBackupBundle;
      if (parsed.version !== 1 || !parsed.categories) {
        toast.error("Format file backup tidak dikenali");
        return;
      }
      setRestoreFile({ name: file.name, bundle: parsed, rawJson: text });
    } catch (e) {
      toast.error(
        e instanceof Error ? `File tidak valid: ${e.message}` : "File tidak valid"
      );
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border-2 border-foreground bg-card p-4 space-y-3">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <Database size={16} strokeWidth={2.5} />
          Auto-backup
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="size-4"
            />
            <span className="text-sm text-foreground">Aktif</span>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              Frekuensi
            </span>
            <select
              value={cadence}
              onChange={(e) => setCadence(e.target.value as BackupCadence)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              {CADENCE_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              Retensi (hari)
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={retention}
              onChange={(e) =>
                setRetention(e.target.value.replace(/[^\d]/g, ""))
              }
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSaveSettings}
            disabled={pending || !settingsDirty}
            className="flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-primary text-primary-foreground px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            <Save size={14} strokeWidth={2.5} />
            Simpan
          </button>
          <button
            type="button"
            onClick={onBackupNow}
            disabled={pending}
            className="flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-card px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50"
          >
            <Play size={14} strokeWidth={2.5} />
            Backup &amp; unduh sekarang
          </button>
          {pending && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 size={12} className="animate-spin" />
              Memproses…
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Cron berjalan tiap hari 00:00 WIB; file backup tersimpan di server
          dan bisa diunduh dari riwayat di bawah. Backup melebihi retensi
          dihapus otomatis.
        </p>
      </section>

      <section className="rounded-2xl border-2 border-foreground bg-card overflow-hidden">
        <div className="px-4 py-3 border-b-2 border-foreground bg-muted/30">
          <h2 className="font-semibold text-foreground">Riwayat backup</h2>
          <p className="text-xs text-muted-foreground">
            50 backup terbaru. Tombol Unduh mengambil file dari server
            (untuk backup cron yang belum pernah diunduh).
          </p>
        </div>
        {runs.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            Belum ada backup.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {runs.map((r) => (
              <RunRow
                key={r.id}
                run={r}
                disabled={pending}
                onDownload={() => onReDownload(r)}
                onDelete={() => onDeleteRun(r)}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border-2 border-dashed border-border bg-muted/20 p-4 space-y-3">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <Upload size={16} strokeWidth={2.5} />
          Restore dari file
        </h2>
        <p className="text-xs text-muted-foreground">
          Upload file backup <code>.json</code> yang sebelumnya diunduh.
          Setelah upload, pilih kategori yang ingin di-restore — yang tidak
          dicentang tetap utuh.
        </p>
        <label className="flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-card px-3 py-2 text-sm font-semibold cursor-pointer hover:bg-muted w-fit">
          <Upload size={14} strokeWidth={2.5} />
          Pilih file backup…
          <input
            type="file"
            accept="application/json,.json,.gz,application/gzip"
            disabled={pending}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPickRestoreFile(f);
              e.currentTarget.value = "";
            }}
            className="hidden"
          />
        </label>
      </section>

      {restoreFile && (
        <RestoreDialog
          file={restoreFile}
          onClose={() => setRestoreFile(null)}
        />
      )}
    </div>
  );
}

function RunRow({
  run,
  disabled,
  onDownload,
  onDelete,
}: {
  run: BackupRunRow;
  disabled: boolean;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const date = new Date(run.created_at);
  const totalRows = run.manifest
    ? Object.values(run.manifest.categories).reduce(
        (sum, c) =>
          sum +
          (c ? Object.values(c.tables).reduce((s, n) => s + n, 0) : 0),
        0
      )
    : 0;
  return (
    <li className="p-3 sm:p-4 flex items-center gap-3 flex-wrap">
      <FileJson size={20} className="text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-[12rem]">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-foreground">
            {format(date, "d MMM yyyy · HH:mm", { locale: idLocale })}
          </span>
          <span className="text-[11px] uppercase tracking-wide rounded-full border border-border bg-muted px-2 py-0.5 text-muted-foreground">
            {run.trigger}
          </span>
          <StatusBadge status={run.status} />
        </div>
        {run.status === "success" && (
          <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
            {totalRows.toLocaleString("id-ID")} baris
            {run.duration_ms != null && ` · ${(run.duration_ms / 1000).toFixed(1)}s`}
          </p>
        )}
        {run.error && (
          <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1 mt-1">
            {run.error}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onDownload}
          disabled={disabled || run.status !== "success"}
          className="flex items-center gap-1 rounded-lg border-2 border-foreground bg-card px-2.5 py-1 text-xs font-semibold hover:bg-muted disabled:opacity-50"
        >
          <Download size={12} strokeWidth={2.5} />
          Unduh
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          className="flex items-center gap-1 rounded-lg border-2 border-foreground bg-destructive text-destructive-foreground px-2.5 py-1 text-xs font-semibold disabled:opacity-50"
        >
          <Trash2 size={12} strokeWidth={2.5} />
          Hapus
        </button>
      </div>
    </li>
  );
}

function StatusBadge({ status }: { status: BackupRunRow["status"] }) {
  if (status === "success")
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-pop-emerald/30 border border-foreground px-2 py-0 text-[10px] font-semibold">
        <Check size={10} strokeWidth={3} />
        Sukses
      </span>
    );
  if (status === "failed")
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-destructive/20 border border-destructive px-2 py-0 text-[10px] font-semibold text-destructive">
        <X size={10} strokeWidth={3} />
        Gagal
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-pop-amber/30 border border-foreground px-2 py-0 text-[10px] font-semibold">
      <Loader2 size={10} className="animate-spin" />
      Berjalan
    </span>
  );
}

function RestoreDialog({
  file,
  onClose,
}: {
  file: { name: string; bundle: FullBackupBundle; rawJson: string };
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const cats = BACKUP_CATEGORIES.filter(
    (c) => !!file.bundle.categories[c]
  );
  const [selected, setSelected] = useState<Set<BackupCategory>>(
    () => new Set(cats)
  );
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [confirmText, setConfirmText] = useState("");
  const canSubmit =
    selected.size > 0 &&
    (mode === "merge" || confirmText.trim().toUpperCase() === "RESTORE");

  const toggle = (c: BackupCategory) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  const onSubmit = () => {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await restoreFromBundle({
        bundleJson: file.rawJson,
        categories: Array.from(selected),
        mode,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const reports = res.data!.reports;
      const totalInserted = reports.reduce(
        (s, r) => s + r.perTable.reduce((s2, t) => s2 + t.inserted, 0),
        0
      );
      const errs = reports.flatMap((r) => r.perTable.filter((t) => t.error));
      if (errs.length > 0) {
        toast.error(
          `Restore selesai dengan ${errs.length} error — cek console`
        );
        console.error("Restore errors", errs);
      } else {
        toast.success(`Restore sukses · ${totalInserted} baris`);
      }
      onClose();
      router.refresh();
    });
  };

  const bundleDate = file.bundle.createdAt
    ? new Date(file.bundle.createdAt)
    : null;

  return (
    <div
      className="fixed inset-0 z-50 bg-background/80 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border-2 border-foreground bg-card p-4 sm:p-5 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-foreground">Restore backup</h3>
            <p className="text-xs text-muted-foreground break-all">
              {file.name}
              {bundleDate &&
                ` · dibuat ${format(bundleDate, "d MMM yyyy HH:mm", { locale: idLocale })}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground hover:bg-muted"
            aria-label="Tutup"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              Kategori yang di-restore ({selected.size}/{cats.length}):
            </p>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setSelected(new Set(cats))}
                className="text-[11px] underline text-muted-foreground hover:text-foreground"
              >
                Semua
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-[11px] underline text-muted-foreground hover:text-foreground"
              >
                Kosong
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {cats.map((c) => {
              const m = file.bundle.manifest?.categories[c];
              const rows = m
                ? Object.values(m.tables).reduce((s, n) => s + n, 0)
                : Object.values(file.bundle.categories[c]?.tables ?? {}).reduce(
                    (s, t) => s + (Array.isArray(t) ? t.length : 0),
                    0
                  );
              return (
                <label
                  key={c}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2 py-1.5"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(c)}
                    onChange={() => toggle(c)}
                    className="size-3.5"
                  />
                  <span className="text-xs text-foreground flex-1 min-w-0 truncate">
                    {BACKUP_CATEGORY_LABELS[c]}
                  </span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {rows}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium text-muted-foreground">
            Mode
          </legend>
          <label className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-2 py-2">
            <input
              type="radio"
              name="mode"
              checked={mode === "merge"}
              onChange={() => setMode("merge")}
              className="mt-0.5"
            />
            <div>
              <p className="text-sm font-medium text-foreground">
                Merge (upsert)
              </p>
              <p className="text-[11px] text-muted-foreground">
                Baris di backup di-insert; baris dengan PK yang sama
                di-update. Aman — data tambahan setelah backup tidak hilang.
              </p>
            </div>
          </label>
          <label className="flex items-start gap-2 rounded-lg border border-border bg-destructive/5 px-2 py-2">
            <input
              type="radio"
              name="mode"
              checked={mode === "replace"}
              onChange={() => setMode("replace")}
              className="mt-0.5"
            />
            <div>
              <p className="text-sm font-medium text-destructive">
                Replace (truncate dulu)
              </p>
              <p className="text-[11px] text-muted-foreground">
                Hapus SEMUA baris di tabel kategori yang dipilih, baru insert
                backup. Data lebih baru dari backup ikut hilang.
              </p>
            </div>
          </label>
        </fieldset>

        {mode === "replace" && (
          <label className="block">
            <span className="text-xs font-medium text-destructive">
              Ketik &quot;RESTORE&quot; untuk konfirmasi
            </span>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="mt-1 w-full rounded-lg border-2 border-destructive bg-background px-3 py-2 text-sm font-mono uppercase tracking-wide"
              autoComplete="off"
            />
          </label>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="flex-1 rounded-xl border-2 border-foreground bg-card px-3 py-2 text-sm font-semibold"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit || pending}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border-2 border-foreground bg-primary text-primary-foreground px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            <RotateCcw size={14} strokeWidth={2.5} />
            {pending ? "Memulihkan…" : "Restore"}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
