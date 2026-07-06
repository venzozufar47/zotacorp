"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Brain,
  Check,
  Loader2,
  Send,
  Upload,
  X,
  Eye,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmployeeAvatar } from "@/components/shared/EmployeeAvatar";
import { DiscResultView } from "@/components/disc/DiscResultView";
import { DISC_PATTERNS } from "@/lib/disc/data/patterns";
import type { DiscGraphValues } from "@/lib/disc/scoring";
import {
  setDiscTestRequired,
  importDiscResult,
  type DiscOverviewRow,
  type DiscResultDTO,
} from "@/lib/actions/disc.actions";
import { cn } from "@/lib/utils";

/**
 * Manajer status DISC semua karyawan aktif. Per baris: push/batalkan tes,
 * lihat hasil terbaru, dan import hasil PDF Frexor. Push mengirim WA
 * (template `disc_test_push`) dan mengunci slip gaji karyawan sampai tes
 * selesai.
 */
export function DiscOverviewManager({ rows }: { rows: DiscOverviewRow[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      [r.fullName, r.nickname, r.businessUnit, r.jobRole]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(s))
    );
  }, [rows, q]);

  const doneCount = rows.filter((r) => r.latest).length;
  const pushedCount = rows.filter((r) => r.required).length;

  return (
    <div className="space-y-4">
      {/* Ringkasan */}
      <div className="flex flex-wrap gap-2 text-xs">
        <Stat label="Karyawan aktif" value={rows.length} />
        <Stat label="Sudah ada hasil" value={doneCount} tone="success" />
        <Stat label="Ditunggu tes" value={pushedCount} tone="warning" />
      </div>

      {/* Cari */}
      <div className="relative max-w-xs">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama / unit…"
          className="pl-9"
        />
      </div>

      <div className="rounded-2xl border-2 border-foreground bg-card shadow-hard-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-foreground bg-muted/50 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 font-semibold">Karyawan</th>
                <th className="px-4 py-2.5 font-semibold">Status DISC</th>
                <th className="px-4 py-2.5 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <DiscRow key={r.userId} row={r} />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    Tidak ada karyawan cocok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "warning";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border-2 border-foreground px-3 py-1.5 font-semibold",
        tone === "success"
          ? "bg-success/15"
          : tone === "warning"
            ? "bg-warning/25"
            : "bg-card"
      )}
    >
      <span className="text-base font-bold">{value}</span>{" "}
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

function DiscRow({ row }: { row: DiscOverviewRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmPush, setConfirmPush] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  function togglePush(required: boolean) {
    startTransition(async () => {
      const res = await setDiscTestRequired(row.userId, required);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (required) {
        toast.success(
          res.waSent
            ? `${label} diminta ambil tes — WA terkirim.`
            : `${label} diminta ambil tes (WA tidak terkirim — cek nomor).`
        );
      } else {
        toast.success(`Permintaan tes ${label} dibatalkan.`);
      }
      setConfirmPush(false);
      router.refresh();
    });
  }

  const label = row.nickname || row.fullName;

  return (
    <tr className="border-b border-border last:border-0 align-middle">
      {/* Karyawan */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <EmployeeAvatar
            size="sm"
            full_name={row.fullName}
            avatar_url={row.avatarUrl}
            avatar_seed={row.avatarSeed}
          />
          <div className="min-w-0">
            <p className="font-semibold leading-tight truncate">
              {row.fullName}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {[row.jobRole, row.businessUnit].filter(Boolean).join(" · ") ||
                "—"}
            </p>
          </div>
        </div>
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {row.required && (
            <span className="inline-flex items-center gap-1 rounded-full border-2 border-foreground bg-warning/40 px-2 py-0.5 text-[10.5px] font-bold">
              <Brain size={11} /> Ditunggu tes
            </span>
          )}
          {row.latest ? (
            <StatusPatterns latest={row.latest} />
          ) : (
            <span className="text-[11px] text-muted-foreground italic">
              Belum ada hasil
            </span>
          )}
        </div>
      </td>

      {/* Aksi */}
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1.5">
          {row.latest && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setViewOpen(true)}
            >
              <Eye size={13} /> Hasil
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => setImportOpen(true)}
          >
            <Upload size={13} /> Import
          </Button>
          {row.required ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={pending}
              onClick={() => togglePush(false)}
            >
              {pending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <X size={13} />
              )}
              Batalkan
            </Button>
          ) : (
            <Button
              type="button"
              size="xs"
              disabled={pending}
              onClick={() => setConfirmPush(true)}
            >
              <Send size={13} /> Push tes
            </Button>
          )}
        </div>
      </td>

      {/* Dialog konfirmasi push */}
      <Dialog open={confirmPush} onOpenChange={setConfirmPush}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Push Tes DISC ke {label}?</DialogTitle>
            <DialogDescription>
              {row.fullName} akan diminta mengambil Tes Kepribadian DISC di Zota
              App dan akan menerima notifikasi WhatsApp. Slip gajinya{" "}
              <strong>terkunci</strong> sampai tesnya selesai. Permintaan mati
              otomatis begitu tes disubmit.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmPush(false)}
              disabled={pending}
            >
              Batal
            </Button>
            <Button onClick={() => togglePush(true)} disabled={pending}>
              {pending ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Mengirim…
                </>
              ) : (
                <>
                  <Send size={14} /> Push & kirim WA
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog lihat hasil */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Hasil DISC — {row.fullName}</DialogTitle>
          </DialogHeader>
          {row.latest && (
            <DiscResultView result={row.latest} ownerName={row.fullName} />
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog import */}
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        row={row}
        onDone={() => router.refresh()}
      />
    </tr>
  );
}

function StatusPatterns({ latest }: { latest: DiscResultDTO }) {
  const chip = (label: string, name: string | null, num: number | null) =>
    name ? (
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10.5px] font-medium">
        <span className="text-muted-foreground">{label}</span> {name}
        {num != null && <span className="text-muted-foreground">#{num}</span>}
      </span>
    ) : null;
  return (
    <>
      {chip("G1", latest.pattern1Name, latest.pattern1Num)}
      {chip("G2", latest.pattern2Name, latest.pattern2Num)}
      <span className="text-[10.5px] text-muted-foreground">
        {latest.source === "import" ? "impor" : "app"} · {latest.takenAt}
      </span>
    </>
  );
}

// ─── Import dialog ──────────────────────────────────────────────────────────

interface ImportForm {
  takenAt: string;
  positionLabel: string;
  pattern1Num: string;
  pattern2Num: string;
  graph1: DiscGraphValues;
  graph2: DiscGraphValues;
  path: string | null;
  hasGraphs: boolean;
}

const EMPTY_GRAPH: DiscGraphValues = { d: 50, i: 50, s: 50, c: 50 };

function ImportDialog({
  open,
  onOpenChange,
  row,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  row: DiscOverviewRow;
  onDone: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [saving, startSaving] = useTransition();
  const [form, setForm] = useState<ImportForm | null>(null);

  const patternOptions = useMemo(
    () =>
      [...DISC_PATTERNS]
        .sort((a, b) => a.num - b.num)
        .map((p) => ({ num: p.num, label: `${p.name} #${p.num} (${p.high})` })),
    []
  );

  function reset() {
    setForm(null);
    setUploading(false);
  }

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/disc/import-upload", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Gagal upload PDF.");
        setUploading(false);
        return;
      }
      const p = json.parsed as
        | {
            posisi: string | null;
            tanggal: string | null;
            pattern1: { num: number } | null;
            pattern2: { num: number } | null;
            graph1: DiscGraphValues | null;
            graph2: DiscGraphValues | null;
          }
        | null;
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
      }).format(new Date());
      setForm({
        takenAt: p?.tanggal ?? today,
        positionLabel: p?.posisi ?? row.jobRole ?? "",
        pattern1Num: p?.pattern1 ? String(p.pattern1.num) : "",
        pattern2Num: p?.pattern2 ? String(p.pattern2.num) : "",
        graph1: p?.graph1 ?? { ...EMPTY_GRAPH },
        graph2: p?.graph2 ?? { ...EMPTY_GRAPH },
        hasGraphs: Boolean(p?.graph1 && p?.graph2),
        path: json.path,
      });
      if (p?.pattern1 && p?.pattern2) {
        toast.success("PDF terbaca — cek & lengkapi datanya.");
      } else {
        toast.info("Sebagian data tidak terbaca — isi manual di bawah.");
      }
    } catch {
      toast.error("Gagal memproses PDF.");
    } finally {
      setUploading(false);
    }
  }

  function save() {
    if (!form) return;
    const p1 = Number(form.pattern1Num);
    const p2 = Number(form.pattern2Num);
    if (!p1 || !p2) {
      toast.error("Pilih pattern Grafik 1 dan Grafik 2.");
      return;
    }
    startSaving(async () => {
      const res = await importDiscResult({
        userId: row.userId,
        takenAt: form.takenAt,
        positionLabel: form.positionLabel.trim() || null,
        pattern1Num: p1,
        pattern2Num: p2,
        graph1: form.hasGraphs ? form.graph1 : null,
        graph2: form.hasGraphs ? form.graph2 : null,
        importedPdfPath: form.path,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Hasil DISC ${row.fullName} tersimpan.`);
      reset();
      onOpenChange(false);
      onDone();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import hasil DISC — {row.fullName}</DialogTitle>
          <DialogDescription>
            Upload PDF hasil Frexor. Data akan dibaca otomatis; kamu tinggal
            memeriksa dan menyimpan.
          </DialogDescription>
        </DialogHeader>

        {!form ? (
          <div className="py-2">
            <label
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-foreground/40 bg-muted/40 px-4 py-8 text-center cursor-pointer hover:bg-muted transition",
                uploading && "opacity-60 pointer-events-none"
              )}
            >
              {uploading ? (
                <Loader2 size={22} className="animate-spin" />
              ) : (
                <Upload size={22} />
              )}
              <span className="text-sm font-semibold">
                {uploading ? "Memproses…" : "Pilih PDF hasil Frexor"}
              </span>
              <span className="text-[11px] text-muted-foreground">
                Format PDF · maks 5 MB
              </span>
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </label>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tanggal tes">
                <Input
                  type="date"
                  value={form.takenAt}
                  onChange={(e) =>
                    setForm({ ...form, takenAt: e.target.value })
                  }
                />
              </Field>
              <Field label="Posisi / jabatan">
                <Input
                  value={form.positionLabel}
                  onChange={(e) =>
                    setForm({ ...form, positionLabel: e.target.value })
                  }
                  placeholder="mis. Admin Yeobo"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Pattern Grafik 1 (Adaptasi)">
                <PatternSelect
                  value={form.pattern1Num}
                  options={patternOptions}
                  onChange={(v) => setForm({ ...form, pattern1Num: v })}
                />
              </Field>
              <Field label="Pattern Grafik 2 (Alami)">
                <PatternSelect
                  value={form.pattern2Num}
                  options={patternOptions}
                  onChange={(v) => setForm({ ...form, pattern2Num: v })}
                />
              </Field>
            </div>

            <label className="flex items-center gap-2 text-[12.5px] font-medium">
              <input
                type="checkbox"
                checked={form.hasGraphs}
                onChange={(e) =>
                  setForm({ ...form, hasGraphs: e.target.checked })
                }
                className="size-4 accent-primary"
              />
              Isi nilai grafik 0–100 (kalau tidak, dipakai bentuk referensi
              pattern)
            </label>

            {form.hasGraphs && (
              <div className="grid grid-cols-2 gap-3">
                <GraphInputs
                  title="Grafik 1"
                  values={form.graph1}
                  onChange={(g) => setForm({ ...form, graph1: g })}
                />
                <GraphInputs
                  title="Grafik 2"
                  values={form.graph2}
                  onChange={(g) => setForm({ ...form, graph2: g })}
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
            disabled={saving}
          >
            Batal
          </Button>
          {form && (
            <Button onClick={save} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Menyimpan…
                </>
              ) : (
                <>
                  <Check size={14} /> Simpan hasil
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

function PatternSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ num: number; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-10 rounded-xl border-2 border-foreground bg-background px-3 text-sm"
    >
      <option value="">Pilih pattern…</option>
      {options.map((o) => (
        <option key={o.num} value={o.num}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function GraphInputs({
  title,
  values,
  onChange,
}: {
  title: string;
  values: DiscGraphValues;
  onChange: (v: DiscGraphValues) => void;
}) {
  const set = (k: keyof DiscGraphValues, raw: string) => {
    const n = Math.max(0, Math.min(100, Number(raw) || 0));
    onChange({ ...values, [k]: n });
  };
  return (
    <div className="rounded-xl border border-border p-2.5 space-y-1.5">
      <p className="text-[11px] font-bold">{title}</p>
      {(["d", "i", "s", "c"] as const).map((k) => (
        <div key={k} className="flex items-center gap-2">
          <span className="w-4 text-xs font-bold uppercase">{k}</span>
          <Input
            type="number"
            min={0}
            max={100}
            value={values[k]}
            onChange={(e) => set(k, e.target.value)}
            className="h-8"
          />
        </div>
      ))}
    </div>
  );
}
