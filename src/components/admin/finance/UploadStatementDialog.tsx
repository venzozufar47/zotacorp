"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FileUp,
  Calendar,
  Lock,
  Eye,
  EyeOff,
  ArrowLeft,
  AlertTriangle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BankCode } from "@/lib/cashflow/types";
import type { CategoryPresets } from "@/lib/cashflow/categories";
import { formatIDR as sharedFormatIDR } from "@/lib/cashflow/format";

interface Account {
  id: string;
  accountName: string;
  bank: BankCode;
  businessUnit: string;
  /** Password tersimpan untuk PDF rekening ini. Null = belum pernah di-save. */
  pdfPassword: string | null;
}

interface Props {
  account: Account | null;
  presets: CategoryPresets;
  onOpenChange: (open: boolean) => void;
}

/** Transaction shape returned by /api/admin/cashflow/preview. */
interface PreviewTx {
  date: string;
  time?: string | null;
  sourceDestination?: string | null;
  transactionDetails?: string | null;
  notes?: string | null;
  description: string;
  debit: number;
  credit: number;
  runningBalance?: number | null;
  category?: string | null;
  branch?: string | null;
  /**
   * True kalau tx ini sudah ada di DB (dedup hit). Tetap ditampilkan
   * di tabel preview supaya verifikasi saldo match dengan apa yang
   * user lihat; saat commit, row duplicate di-skip.
   */
  duplicate?: boolean;
}

interface PreviewVerification {
  canVerify: boolean;
  match: boolean;
  computedClosing: number;
  diff: number;
  sumCredit: number;
  sumDebit: number;
}

interface PreviewResult {
  periodMonth: number;
  periodYear: number;
  openingBalance: number;
  closingBalance: number;
  parsedCount: number;
  newCount: number;
  skippedCount: number;
  transactions: PreviewTx[];
  warnings: string[];
  verification: PreviewVerification;
}

/** Kata benda file sesuai bank: Mandiri = Excel, Jago/BCA = CSV,
 *  lainnya = PDF. Dipakai di label progress bar + tombol. */
function fileNounFor(bank: BankCode | null | undefined): string {
  if (bank === "mandiri") return "Excel";
  if (bank === "jago" || bank === "bca") return "CSV";
  return "PDF";
}

/** Upload preview shows raw amounts that may carry fractional parts;
 *  other tables round to integer rupiah. */
const formatIDR = (n: number) =>
  sharedFormatIDR(n, { decimals: 2 });

/**
 * Low-level XHR upload with byte-progress callback. fetch() can't give
 * us this — the Response streaming API only tracks DOWNLOAD bytes,
 * not upload. We only resolve once the server has fully responded, and
 * we parse JSON ourselves so the caller gets the same shape
 * {status, body} no matter how things failed.
 *
 * `onUploadFinished` fires when upload bytes hit 100% but the server
 * hasn't responded yet — caller uses this to flip the UI stage from
 * "uploading" to "parsing".
 */
type PreviewResponseBody = Partial<PreviewResult> & {
  ok?: boolean;
  error?: string;
  passwordRequired?: boolean;
  wrongPassword?: boolean;
};

function uploadWithProgress(args: {
  url: string;
  formData: FormData;
  onProgress: (pct: number) => void;
  onUploadFinished: () => void;
}): Promise<{ status: number; body: PreviewResponseBody | null }> {
  const { url, formData, onProgress, onUploadFinished } = args;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "text";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.upload.onload = () => {
      onProgress(100);
      onUploadFinished();
    };
    xhr.onload = () => {
      let parsed: PreviewResponseBody | null = null;
      try {
        parsed = xhr.responseText ? (JSON.parse(xhr.responseText) as PreviewResponseBody) : null;
      } catch {
        parsed = null;
      }
      resolve({ status: xhr.status, body: parsed });
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));
    xhr.send(formData);
  });
}

export function UploadStatementDialog({ account, presets, onOpenChange }: Props) {
  const router = useRouter();

  // Form step state
  const [file, setFile] = useState<File | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [useRange, setUseRange] = useState(false);
  const [pdfPassword, setPdfPassword] = useState("");
  // When an account already has a saved password, the field is hidden
  // behind "Password tersimpan ·  Ubah password". Clicking Ubah flips
  // this to true and reveals the input so admin can type a new one.
  const [editPassword, setEditPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordChallenge, setPasswordChallenge] = useState<null | "need" | "wrong">(null);

  // Network state
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  // Upload / parse progress. `stage` drives both the progress bar UI
  // and the button label. `uploadPct` is a real byte-level percentage
  // from XHR.upload.onprogress; during the parse stage there's no real
  // progress signal (Gemini API is opaque) so the bar runs in
  // indeterminate mode.
  const [stage, setStage] = useState<"idle" | "uploading" | "parsing">("idle");
  const [uploadPct, setUploadPct] = useState(0);

  // Two-step flow state
  const [preview, setPreview] = useState<PreviewResult | null>(null);

  const [batch, setBatch] = useState<BatchItem[]>([]);
  // Index file yang sedang di-preview saat loading batch (-1 = idle).
  const [batchCursor, setBatchCursor] = useState<number>(-1);
  // True setelah SEMUA file ter-preview → tampilkan view gabungan +
  // tombol Simpan semua.
  const [mergedReady, setMergedReady] = useState(false);

  const isJago = account?.bank === "jago";
  const isMandiri = account?.bank === "mandiri";
  // BCA mutasi rekening tidak punya kolom saldo per baris, jadi
  // reconciliation saldo (opening/closing) tidak bisa dilakukan.
  // Untuk bank semacam ini, commit/batch tidak boleh di-block oleh
  // gate verifikasi saldo — toh tidak ada angka untuk dicocokkan.
  const isBca = account?.bank === "bca";
  const noBalanceBank = isBca;

  useEffect(() => {
    if (!account) return;
    setUseRange(false);
    setStartDate("");
    setEndDate("");
  }, [account]);

  function reset() {
    setFile(null);
    setStartDate("");
    setEndDate("");
    setUseRange(false);
    setPdfPassword("");
    setShowPassword(false);
    setPasswordChallenge(null);
    setPreview(null);
    setParsing(false);
    setCommitting(false);
    setStage("idle");
    setUploadPct(0);
    setEditPassword(false);
    setBatch([]);
    setBatchCursor(-1);
    setMergedReady(false);
  }

  /** Core: kirim satu file ke /preview. Dipakai single & wizard batch. */
  async function requestPreviewFor(f: File) {
    const formData = new FormData();
    formData.append("bankAccountId", account!.id);
    formData.append("pdf", f);
    if (useRange && startDate && endDate) {
      formData.append("startDate", startDate);
      formData.append("endDate", endDate);
    }
    if (pdfPassword) formData.append("pdfPassword", pdfPassword);
    // fetch() doesn't expose upload progress, so we drop down to XHR.
    return uploadWithProgress({
      url: "/api/admin/cashflow/preview",
      formData,
      onProgress: (pct) => setUploadPct(pct),
      onUploadFinished: () => setStage("parsing"),
    });
  }

  function buildPreviewFromBody(body: PreviewResponseBody): PreviewResult {
    return {
      periodMonth: body.periodMonth ?? new Date().getMonth() + 1,
      periodYear: body.periodYear ?? new Date().getFullYear(),
      openingBalance: body.openingBalance ?? 0,
      closingBalance: body.closingBalance ?? 0,
      parsedCount: body.parsedCount ?? 0,
      newCount: body.newCount ?? 0,
      skippedCount: body.skippedCount ?? 0,
      transactions: body.transactions ?? [],
      warnings: body.warnings ?? [],
      verification: body.verification ?? {
        canVerify: false,
        match: false,
        computedClosing: 0,
        diff: 0,
        sumCredit: 0,
        sumDebit: 0,
      },
    };
  }

  /** Single-file preview (alur lama: 1 file → tabel preview → commit). */
  async function handlePreview() {
    if (!account) return;
    if (!file) {
      toast.error("Pilih file dulu sebelum Preview");
      return;
    }
    if (file.size === 0) {
      toast.error("File kosong — coba pilih file lain");
      return;
    }
    if (useRange) {
      if (!startDate || !endDate) {
        toast.error("Tanggal awal & akhir wajib diisi kalau pakai filter rentang");
        return;
      }
      if (startDate > endDate) {
        toast.error("Tanggal awal harus sebelum tanggal akhir");
        return;
      }
    }

    setParsing(true);
    setStage("uploading");
    setUploadPct(0);
    try {
      const { status, body } = await requestPreviewFor(file);
      if (status === 401 && body?.passwordRequired) {
        setPasswordChallenge(body.wrongPassword ? "wrong" : "need");
        toast.error(
          body.wrongPassword
            ? "Password salah. Coba lagi."
            : "File ini diproteksi password. Masukkan password lalu klik Preview lagi."
        );
        setParsing(false);
        setStage("idle");
        return;
      }
      if (status < 200 || status >= 300 || !body?.ok) {
        toast.error(body?.error ?? `Preview gagal (HTTP ${status})`);
        setParsing(false);
        setStage("idle");
        return;
      }
      setPreview(buildPreviewFromBody(body));
      setParsing(false);
      setStage("idle");
    } catch (err) {
      console.error(err);
      toast.error("Terjadi kesalahan saat preview");
      setParsing(false);
      setStage("idle");
    }
  }

  /**
   * Preview SEMUA file batch sekaligus → simpan hasil tiap file di
   * batch[i].preview, lalu tampilkan satu view gabungan (campuran semua
   * file) sebelum admin klik Simpan semua. File gagal (password/parse)
   * ditandai error tapi tidak menghentikan file lain.
   */
  async function previewAllBatch() {
    if (!account || batch.length === 0) return;
    setCommitting(false);
    for (let idx = 0; idx < batch.length; idx++) {
      const item = batch[idx];
      if (!item) continue;
      setBatchCursor(idx);
      setParsing(true);
      setStage("uploading");
      setUploadPct(0);
      setBatch((prev) =>
        prev.map((b, i) =>
          i === idx ? { ...b, status: "parsing", message: undefined } : b
        )
      );
      try {
        const { status, body } = await requestPreviewFor(item.file);
        if (status === 401 && body?.passwordRequired) {
          setBatch((prev) =>
            prev.map((b, i) =>
              i === idx
                ? { ...b, status: "error", message: body.wrongPassword ? "Password salah" : "Perlu password", preview: undefined }
                : b
            )
          );
          continue;
        }
        if (status < 200 || status >= 300 || !body?.ok) {
          setBatch((prev) =>
            prev.map((b, i) =>
              i === idx ? { ...b, status: "error", message: body?.error ?? `HTTP ${status}`, preview: undefined } : b
            )
          );
          continue;
        }
        const result = buildPreviewFromBody(body);
        setBatch((prev) =>
          prev.map((b, i) => (i === idx ? { ...b, status: "reviewing", preview: result } : b))
        );
      } catch (err) {
        setBatch((prev) =>
          prev.map((b, i) =>
            i === idx
              ? { ...b, status: "error", message: err instanceof Error ? err.message : String(err), preview: undefined }
              : b
          )
        );
      }
    }
    setBatchCursor(-1);
    setParsing(false);
    setStage("idle");
    setMergedReady(true);
  }

  /** Edit kategori/cabang satu baris di view gabungan (file fileIdx, row rowIdx). */
  function patchMergedRow(
    fileIdx: number,
    rowIdx: number,
    patch: Partial<Pick<PreviewTx, "category" | "branch">>
  ) {
    setBatch((prev) =>
      prev.map((b, i) =>
        i === fileIdx && b.preview
          ? {
              ...b,
              preview: {
                ...b.preview,
                transactions: b.preview.transactions.map((t, r) =>
                  r === rowIdx ? { ...t, ...patch } : t
                ),
              },
            }
          : b
      )
    );
  }

  /** Commit semua file yang sudah ter-preview & lolos gate (per file). */
  async function commitAllBatch() {
    if (!account) return;
    setCommitting(true);
    let totalAdded = 0;
    let totalSkipped = 0;
    let anyError = false;
    for (let idx = 0; idx < batch.length; idx++) {
      const item = batch[idx];
      if (!item?.preview) continue; // file error saat preview → skip
      const p = item.preview;
      // Gate verifikasi per file (Mandiri); BCA (noBalanceBank) lewat.
      if (!noBalanceBank && (!p.verification.canVerify || !p.verification.match)) {
        setBatch((prev) =>
          prev.map((b, i) =>
            i === idx ? { ...b, status: "error", message: "Saldo tidak cocok — tidak disimpan" } : b
          )
        );
        anyError = true;
        continue;
      }
      setBatch((prev) =>
        prev.map((b, i) => (i === idx ? { ...b, status: "committing" } : b))
      );
      try {
        const res = await fetch("/api/admin/cashflow/commit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bankAccountId: account.id,
            periodMonth: p.periodMonth,
            periodYear: p.periodYear,
            openingBalance: p.openingBalance,
            closingBalance: p.closingBalance,
            transactions: p.transactions,
          }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          addedCount?: number;
          skippedCount?: number;
          error?: string;
        };
        if (!res.ok || !body.ok) {
          setBatch((prev) =>
            prev.map((b, i) =>
              i === idx ? { ...b, status: "error", message: body.error ?? `HTTP ${res.status}` } : b
            )
          );
          anyError = true;
          continue;
        }
        const added = body.addedCount ?? 0;
        const skipped = body.skippedCount ?? 0;
        totalAdded += added;
        totalSkipped += skipped;
        setBatch((prev) =>
          prev.map((b, i) =>
            i === idx ? { ...b, status: "done", addedCount: added, skippedCount: skipped } : b
          )
        );
      } catch (err) {
        setBatch((prev) =>
          prev.map((b, i) =>
            i === idx ? { ...b, status: "error", message: err instanceof Error ? err.message : String(err) } : b
          )
        );
        anyError = true;
      }
    }
    setCommitting(false);
    setMergedReady(false);
    router.refresh();
    if (anyError) {
      toast.warning(
        `${totalAdded} transaksi disimpan${totalSkipped ? `, ${totalSkipped} dup` : ""}. Sebagian file gagal — cek daftar.`
      );
    } else {
      toast.success(
        `${totalAdded} transaksi disimpan${totalSkipped ? `, ${totalSkipped} duplikat dilewati` : ""}.`
      );
    }
  }

  /** Batalkan view gabungan, kembali ke daftar pilih file. */
  function cancelMerged() {
    setMergedReady(false);
    setBatch((prev) =>
      prev.map((b) =>
        b.status === "reviewing" ? { ...b, status: "pending", preview: undefined } : b
      )
    );
  }

  async function handleCommit() {
    if (!account || !preview) return;
    setCommitting(true);
    try {
      const res = await fetch("/api/admin/cashflow/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankAccountId: account.id,
          periodMonth: preview.periodMonth,
          periodYear: preview.periodYear,
          openingBalance: preview.openingBalance,
          closingBalance: preview.closingBalance,
          // Kirim SEMUA tx (termasuk yang flagged duplicate) supaya
          // verifikasi saldo server-side dapat ALL rows — kalau hanya
          // yang non-dup, net-effect dupes hilang dari reconciliation
          // dan checksum gagal. Server-side dedupe yang sudah ada
          // tetap filter dupes sebelum insert.
          transactions: preview.transactions,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        addedCount?: number;
        skippedCount?: number;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        toast.error(body.error ?? `Simpan gagal (HTTP ${res.status})`);
        setCommitting(false);
        return;
      }
      const added = body.addedCount ?? 0;
      const skipped = body.skippedCount ?? 0;
      if (skipped > 0) {
        toast.success(`${added} transaksi disimpan. ${skipped} duplikat dilewati.`);
      } else {
        toast.success(`${added} transaksi disimpan.`);
      }
      reset();
      onOpenChange(false);
      router.push(`/admin/finance/rekening/${account.id}`);
    } catch (err) {
      console.error(err);
      toast.error("Terjadi kesalahan saat simpan");
      setCommitting(false);
    }
  }

  const inPreview = preview !== null;
  const commitDisabled = !preview
    ? true
    : committing ||
      preview.newCount === 0 ||
      (!noBalanceBank &&
        (!preview.verification.canVerify || !preview.verification.match));

  // Agregat untuk view gabungan batch.
  const mergedPreviews = batch
    .map((b, i) => ({ idx: i, item: b }))
    .filter((x) => x.item.preview);
  const mergedTotals = mergedPreviews.reduce(
    (acc, { item }) => {
      const p = item.preview!;
      acc.parsed += p.parsedCount;
      acc.new += p.newCount;
      acc.skipped += p.skippedCount;
      return acc;
    },
    { parsed: 0, new: 0, skipped: 0 }
  );
  const mergedHasUnverified =
    !noBalanceBank &&
    mergedPreviews.some(
      ({ item }) =>
        !item.preview!.verification.canVerify || !item.preview!.verification.match
    );
  const mergedCommitDisabled =
    committing || mergedTotals.new === 0 || mergedHasUnverified;

  return (
    <Dialog
      open={Boolean(account)}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent
        className={
          inPreview || mergedReady
            ? // Wide + tall-responsive: dialog can scroll internally
              // when content exceeds viewport so the top/bottom don't
              // get clipped at 100% zoom or tall transaction lists.
              "max-w-[min(96vw,1400px)] sm:max-w-[min(96vw,1400px)] w-[min(96vw,1400px)] max-h-[92vh] overflow-y-auto"
            : "max-w-md max-h-[92vh] overflow-y-auto"
        }
      >
        <DialogHeader>
          <DialogTitle>
            {inPreview
              ? "Review sebelum simpan"
              : mergedReady
              ? "Review gabungan sebelum simpan"
              : "Upload rekening koran"}
          </DialogTitle>
          <DialogDescription>
            Rekening: <strong>{account?.accountName}</strong>
            {mergedReady && (
              <>
                {" "}· Gabungan <strong>{mergedPreviews.length}</strong> file.
                Tidak ada data yang disimpan sampai kamu klik{" "}
                <strong>Simpan semua</strong>.
              </>
            )}
            {inPreview && (
              <>
                {" "}
                · Tidak ada data yang disimpan sampai kamu klik{" "}
                <strong>Konfirmasi & simpan</strong>.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {mergedReady ? (
          <MergedPreview
            batch={batch}
            presets={presets}
            noBalanceBank={noBalanceBank}
            onPatchRow={patchMergedRow}
          />
        ) : !inPreview ? (
          <>
            {batchCursor < 0 && (
            <FormStep
              file={file}
              setFile={setFile}
              onMultiFiles={(files) => {
                setBatch(
                  files.map((f) => ({ file: f, status: "pending" as const }))
                );
              }}
              pdfPassword={pdfPassword}
              setPdfPassword={setPdfPassword}
              showPassword={showPassword}
              setShowPassword={setShowPassword}
              passwordChallenge={passwordChallenge}
              setPasswordChallenge={setPasswordChallenge}
              useRange={useRange}
              setUseRange={setUseRange}
              startDate={startDate}
              setStartDate={setStartDate}
              endDate={endDate}
              setEndDate={setEndDate}
              isJago={isJago}
              isMandiri={isMandiri}
              isBca={isBca}
              savedPassword={Boolean(account?.pdfPassword)}
              editPassword={editPassword || passwordChallenge === "wrong"}
              setEditPassword={setEditPassword}
            />
            )}
            {batch.length > 0 && (
              <BatchUploadList
                batch={batch}
                currentIdx={batchCursor}
                onRemove={(idx) =>
                  setBatch((prev) => prev.filter((_, i) => i !== idx))
                }
              />
            )}
            {stage !== "idle" && (
              <UploadProgress
                stage={stage}
                uploadPct={uploadPct}
                bank={account?.bank ?? null}
              />
            )}
          </>
        ) : (
          <PreviewStep
            preview={preview}
            presets={presets}
            noBalanceBank={noBalanceBank}
            onPatchRow={(idx, patch) => {
              setPreview((prev) =>
                prev
                  ? {
                      ...prev,
                      transactions: prev.transactions.map((t, i) =>
                        i === idx ? { ...t, ...patch } : t
                      ),
                    }
                  : prev
              );
            }}
          />
        )}

        <div className="flex justify-end gap-2 pt-2">
          {mergedReady ? (
            // ── View gabungan: satu tombol Simpan semua ──
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={cancelMerged}
                disabled={committing}
                className="gap-1.5"
              >
                <ArrowLeft size={14} />
                Kembali
              </Button>
              <Button
                type="button"
                onClick={commitAllBatch}
                disabled={mergedCommitDisabled}
              >
                {committing
                  ? "Menyimpan…"
                  : mergedHasUnverified
                  ? "Ada saldo tidak cocok"
                  : mergedTotals.new === 0
                  ? "Tidak ada data baru"
                  : `Simpan semua (${mergedTotals.new})`}
              </Button>
            </>
          ) : inPreview && preview ? (
            // ── Single file preview ──
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPreview(null)}
                disabled={committing}
                className="gap-1.5"
              >
                <ArrowLeft size={14} />
                Kembali
              </Button>
              <Button type="button" onClick={handleCommit} disabled={commitDisabled}>
                {committing
                  ? "Menyimpan…"
                  : !noBalanceBank && !preview.verification.canVerify
                  ? "Saldo awal/akhir tidak terbaca"
                  : !noBalanceBank && !preview.verification.match
                  ? "Saldo tidak cocok"
                  : preview.newCount === 0
                  ? "Tidak ada data baru"
                  : `Konfirmasi & simpan (${preview.newCount})`}
              </Button>
            </>
          ) : batchCursor >= 0 ? (
            // Sedang memuat preview semua file
            <Button type="button" variant="ghost" disabled>
              Memuat preview {batchCursor + 1}/{batch.length}…
            </Button>
          ) : batch.length > 0 ? (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={parsing || committing}
              >
                Tutup
              </Button>
              {batch.every(
                (b) =>
                  b.status === "done" ||
                  b.status === "error" ||
                  b.status === "skipped"
              ) ? (
                <Button type="button" onClick={() => reset()}>
                  Upload lagi
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={previewAllBatch}
                  disabled={parsing || committing || batch.length === 0}
                >
                  Preview semua ({batch.length} file)
                </Button>
              )}
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={parsing}
              >
                Batal
              </Button>
              <Button
                type="button"
                onClick={handlePreview}
                disabled={!file || parsing}
              >
                {stage === "uploading"
                  ? `Mengupload ${fileNounFor(account?.bank)}… ${uploadPct}%`
                  : stage === "parsing"
                  ? `Memparse ${fileNounFor(account?.bank)}…`
                  : !file
                  ? `Pilih ${fileNounFor(account?.bank)} dulu`
                  : "Preview"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────────────────────────────────────────────────────
//  Step components — kept inside this file so the 2-step state stays
//  co-located with the dialog that owns it.
// ───────────────────────────────────────────────────────────────────────

/**
 * Batch upload Mandiri: multi-file flow. Setiap file e-Statement
 * Mandiri = 1 bulan, self-contained balance. Admin pilih banyak
 * sekaligus, password-nya sama, commit sequential.
 */
export interface BatchItem {
  file: File;
  status:
    | "pending"
    | "uploading"
    | "parsing"
    | "reviewing"
    | "committing"
    | "done"
    | "skipped"
    | "error";
  message?: string;
  addedCount?: number;
  skippedCount?: number;
  /** Hasil preview file ini (diisi saat previewAllBatch). */
  preview?: PreviewResult;
}

function BatchUploadList({
  batch,
  currentIdx,
  onRemove,
}: {
  batch: BatchItem[];
  currentIdx: number;
  onRemove: (idx: number) => void;
}) {
  const statusMeta = (s: BatchItem["status"]) => {
    switch (s) {
      case "pending":
        return { label: "Menunggu", cls: "text-muted-foreground" };
      case "uploading":
        return { label: "Mengupload…", cls: "text-primary" };
      case "parsing":
        return { label: "Parsing…", cls: "text-primary" };
      case "reviewing":
        return { label: "Ditinjau…", cls: "text-primary" };
      case "committing":
        return { label: "Menyimpan…", cls: "text-primary" };
      case "done":
        return { label: "Sukses", cls: "text-success" };
      case "skipped":
        return { label: "Dilewati", cls: "text-muted-foreground" };
      case "error":
        return { label: "Gagal", cls: "text-destructive" };
    }
  };
  return (
    <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between text-xs">
        <span className="font-semibold text-foreground">
          Batch upload — {batch.length} file
        </span>
        <span className="text-muted-foreground">
          Sukses{" "}
          <strong className="text-success">
            {batch.filter((b) => b.status === "done").length}
          </strong>{" "}
          · Gagal{" "}
          <strong className="text-destructive">
            {batch.filter((b) => b.status === "error").length}
          </strong>
        </span>
      </div>
      <ul className="divide-y divide-border/60 max-h-[min(50vh,420px)] overflow-y-auto">
        {batch.map((item, idx) => {
          const meta = statusMeta(item.status);
          const active = idx === currentIdx;
          const removable =
            item.status === "pending" ||
            item.status === "error" ||
            item.status === "skipped";
          return (
            <li
              key={`${item.file.name}-${idx}`}
              className={
                "flex items-center gap-3 px-3 py-2 text-xs " +
                (active ? "bg-primary/10" : "")
              }
            >
              <span
                className="flex-1 min-w-0 text-foreground truncate"
                title={item.file.name}
              >
                {item.file.name}{" "}
                <span className="text-muted-foreground">
                  · {(item.file.size / 1024).toFixed(0)} KB
                </span>
              </span>
              <span className={"font-semibold whitespace-nowrap " + meta.cls}>
                {meta.label}
              </span>
              {item.status === "done" && (
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  +{item.addedCount ?? 0}
                  {item.skippedCount
                    ? ` (${item.skippedCount} dup)`
                    : ""}
                </span>
              )}
              {item.status === "error" && item.message && (
                <span
                  className="text-[10px] text-destructive max-w-[240px] truncate"
                  title={item.message}
                >
                  {item.message}
                </span>
              )}
              {removable && (
                <button
                  type="button"
                  onClick={() => onRemove(idx)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Hapus dari batch"
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface FormStepProps {
  file: File | null;
  setFile: (f: File | null) => void;
  /**
   * Dipanggil khusus saat admin pilih >1 file (enabled untuk bank
   * yang file-nya self-contained per periode: Mandiri & BCA). Parent
   * akan mem-populate `batch` state dan render BatchUploadProgress view.
   */
  onMultiFiles?: (files: File[]) => void;
  pdfPassword: string;
  setPdfPassword: (v: string) => void;
  showPassword: boolean;
  setShowPassword: (fn: (prev: boolean) => boolean) => void;
  passwordChallenge: null | "need" | "wrong";
  setPasswordChallenge: (v: null | "need" | "wrong") => void;
  useRange: boolean;
  setUseRange: (v: boolean) => void;
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  isJago: boolean;
  isMandiri: boolean;
  isBca: boolean;
  savedPassword: boolean;
  editPassword: boolean;
  setEditPassword: (v: boolean) => void;
}

function FormStep(props: FormStepProps) {
  const {
    file, setFile, onMultiFiles,
    pdfPassword, setPdfPassword,
    showPassword, setShowPassword,
    passwordChallenge, setPasswordChallenge,
    useRange, setUseRange,
    startDate, setStartDate,
    endDate, setEndDate,
    isJago, isMandiri, isBca,
    savedPassword, editPassword, setEditPassword,
  } = props;
  // Batch multi-file: Mandiri (1 file = 1 bulan) & BCA (1 file = 1
  // minggu) sama-sama self-contained per file, jadi boleh diunggah
  // banyak sekaligus. Jago = 1 CSV berisi seluruh history → single.
  const allowMulti = isMandiri || isBca;
  // Per-bank format + password behaviour:
  //   Mandiri → e-Statement Excel, selalu password-protected.
  //   Jago    → CSV export dari app (plain, tidak perlu password).
  //   BCA     → CSV hasil parse manual (PDF BCA adalah image, tidak
  //              bisa dibaca mesin). Tidak perlu password.
  //   Lainnya → PDF rekening koran.
  const fileLabel = isMandiri
    ? "File Excel (.xlsx)"
    : isJago || isBca
    ? "File CSV (.csv)"
    : "File PDF";
  const fileAccept = isMandiri
    ? ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
    : isJago || isBca
    ? ".csv,text/csv,text/plain"
    : "application/pdf";
  const showPasswordField = !isJago && !isBca;
  const passwordLabel = isMandiri ? "Password Excel" : "Password PDF";
  const passwordHint = isMandiri
    ? "E-Statement Mandiri selalu password-protected. Ketik passwordnya di sini — akan tersimpan otomatis setelah parse sukses."
    : "Password disimpan per rekening setelah parse sukses — tidak perlu diketik ulang di upload berikutnya.";

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="pdf-file" className="flex items-center gap-1.5">
          {fileLabel}
          <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive">
            Wajib
          </span>
        </Label>
        <div
          className={`rounded-2xl border-2 border-dashed p-4 transition ${
            file
              ? "border-primary/40 bg-accent/30"
              : "border-border bg-muted/40"
          }`}
        >
          <Input
            id="pdf-file"
            type="file"
            accept={fileAccept}
            required
            multiple={allowMulti}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 1 && onMultiFiles) {
                onMultiFiles(files);
                setFile(null);
              } else {
                setFile(files[0] ?? null);
              }
            }}
            className="cursor-pointer"
          />
          {file && (
            <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5">
              <FileUp size={12} />
              {file.name} · {(file.size / 1024).toFixed(0)} KB
            </p>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {isMandiri
            ? "Maksimal 10MB/file. Bisa pilih banyak file sekaligus (Ctrl/Shift+klik) untuk batch upload per bulan."
            : isBca
            ? "Maksimal 10MB/file. Bisa pilih banyak file sekaligus (Ctrl/Shift+klik) untuk batch upload per bulan. Format CSV: Tanggal,Keterangan,Mutasi,Tipe"
            : "Maksimal 10MB. File tidak disimpan — hanya dipakai sekali untuk mengekstrak transaksi."}
        </p>
      </div>

      {showPasswordField && (
      <div className="space-y-1.5">
        <Label htmlFor="pdf-password" className="flex items-center gap-1.5">
          <Lock size={12} />
          {passwordLabel}
          {passwordChallenge === "need" && (
            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
              Wajib
            </span>
          )}
          {passwordChallenge === "wrong" && (
            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive">
              Salah
            </span>
          )}
        </Label>

        {/* Three UI states:
            1. No saved password → input always visible (initial onboarding)
            2. Saved password + not editing → show "🔒 Tersimpan · Ubah" pill
            3. Saved password + editing (or wrong-password challenge) → input visible,
               pre-filled empty so admin can type the new value */}
        {savedPassword && !editPassword ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
              <Lock size={12} className="text-success" />
              Password tersimpan — dipakai otomatis saat upload
            </span>
            <button
              type="button"
              onClick={() => setEditPassword(true)}
              className="text-[11px] font-semibold text-primary hover:underline"
            >
              Ubah password
            </button>
          </div>
        ) : (
          <>
            <div className="relative">
              <Input
                id="pdf-password"
                type={showPassword ? "text" : "password"}
                value={pdfPassword}
                onChange={(e) => {
                  setPdfPassword(e.target.value);
                  if (passwordChallenge) setPasswordChallenge(null);
                }}
                placeholder={
                  savedPassword
                    ? "Ketik password baru"
                    : "Kosongkan kalau file tidak diproteksi"
                }
                autoComplete="off"
                className={
                  passwordChallenge === "wrong"
                    ? "border-destructive focus-visible:ring-destructive/30 pr-9"
                    : "pr-9"
                }
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {savedPassword && (
              <button
                type="button"
                onClick={() => {
                  setEditPassword(false);
                  setPdfPassword("");
                }}
                className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Batal ubah, pakai password tersimpan
              </button>
            )}
          </>
        )}
        <p className="text-[11px] text-muted-foreground leading-snug">
          {passwordHint}
        </p>
      </div>
      )}

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={useRange}
            onChange={(e) => setUseRange(e.target.checked)}
            className="rounded border-border"
          />
          Batasi rentang tanggal
        </label>
        {isJago && (
          <p className="text-[11px] text-muted-foreground leading-snug pl-6">
            File CSV export dari app Jago berisi seluruh history sejak
            rekening dibuka. Centang ini untuk ambil periode tertentu saja.
          </p>
        )}
        {useRange && (
          <div className="grid grid-cols-2 gap-2 pl-6">
            <div className="space-y-1">
              <Label htmlFor="startDate" className="text-[11px]">
                <Calendar size={10} className="inline mr-1" />
                Dari
              </Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="endDate" className="text-[11px]">
                <Calendar size={10} className="inline mr-1" />
                Sampai
              </Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewStep({
  preview,
  presets,
  noBalanceBank,
  onPatchRow,
}: {
  preview: PreviewResult;
  presets: CategoryPresets;
  noBalanceBank: boolean;
  onPatchRow: (
    idx: number,
    patch: Partial<Pick<PreviewTx, "category" | "branch">>
  ) => void;
}) {
  // Adaptive columns — hide source/details/time/notes when no data,
  // but always show Saldo (computed from running total) and Catatan.
  const txs = preview.transactions;
  const hasSrcDest = txs.some((t) => t.sourceDestination);
  const hasTxDetails = txs.some((t) => t.transactionDetails);
  const hasNotes = txs.some((t) => t.notes);
  const hasTime = txs.some((t) => t.time);
  // "Keterangan" column: show description directly when source +
  // details are both empty (BCA CSV style).
  const showDescCol = !hasSrcDest && !hasTxDetails;

  // Compute running balance for display. For banks with stored saldo
  // the stored value is used; for banks without (BCA CSV), we
  // accumulate from 0 using the ordered transaction list.
  const computedRunningBalances: number[] = [];
  {
    let cum = 0;
    for (const t of txs) {
      // If stored running balance exists, use it as anchor for this row
      cum = t.runningBalance != null ? t.runningBalance : cum + t.credit - t.debit;
      computedRunningBalances.push(cum);
    }
  }
  return (
    <div className="space-y-3">
      {/* Compact summary row — inline stats instead of fat cards */}
      <div className="flex items-center gap-4 flex-wrap rounded-xl border border-border bg-muted/30 px-4 py-2.5">
        <Stat label="Ter-parse" value={preview.parsedCount} tone="neutral" />
        <span className="text-border">·</span>
        <Stat label="Akan ditambah" value={preview.newCount} tone="success" />
        <span className="text-border">·</span>
        <Stat label="Duplikat" value={preview.skippedCount} tone="muted" />
      </div>

      {/* Balance reconciliation — gating panel for the Konfirmasi button */}
      <ReconciliationPanel preview={preview} noBalanceBank={noBalanceBank} />

      {/* Warnings */}
      {preview.warnings.length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 space-y-1">
          {preview.warnings.map((w, idx) => (
            <p
              key={idx}
              className="text-[11px] text-foreground flex items-start gap-2"
            >
              <AlertTriangle size={11} className="text-warning shrink-0 mt-0.5" />
              <span className="leading-snug">{w}</span>
            </p>
          ))}
        </div>
      )}

      {/* Transactions preview */}
      {preview.transactions.length === 0 ? (
        <p className="text-sm text-muted-foreground italic py-4 text-center">
          Tidak ada transaksi baru untuk ditambahkan.
        </p>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-auto max-h-[min(65vh,640px)]">
            <table className="w-full text-xs border-separate border-spacing-0">
              {/* Columns mirror the rekening koran PDF layout so admin
                  recognises the data 1:1. Sticky bg is applied on each
                  <th> — header floats over scrolling rows. */}
              <thead className="text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="sticky top-0 z-20 bg-muted text-left font-semibold px-3 py-2.5 w-28 border-b border-border">
                    Tanggal{hasTime ? " & Jam" : ""}
                  </th>
                  {showDescCol && (
                    <th className="sticky top-0 z-20 bg-muted text-left font-semibold px-3 py-2.5 w-80 border-b border-border">
                      Keterangan
                    </th>
                  )}
                  {hasSrcDest && (
                    <th className="sticky top-0 z-20 bg-muted text-left font-semibold px-3 py-2.5 w-56 border-b border-border">
                      Sumber / Tujuan
                    </th>
                  )}
                  {hasTxDetails && (
                    <th className="sticky top-0 z-20 bg-muted text-left font-semibold px-3 py-2.5 w-56 border-b border-border">
                      Detail Transaksi
                    </th>
                  )}
                  {hasNotes && (
                    <th className="sticky top-0 z-20 bg-muted text-left font-semibold px-3 py-2.5 w-56 border-b border-border">
                      Catatan
                    </th>
                  )}
                  <th className="sticky top-0 z-20 bg-muted text-right font-semibold px-3 py-2.5 w-28 border-b border-border">
                    Debit
                  </th>
                  <th className="sticky top-0 z-20 bg-muted text-right font-semibold px-3 py-2.5 w-28 border-b border-border">
                    Kredit
                  </th>
                  <th className="sticky top-0 z-20 bg-muted text-right font-semibold px-3 py-2.5 w-32 border-b border-border">
                    Saldo
                  </th>
                  <th className="sticky top-0 z-20 bg-muted text-left font-semibold px-3 py-2.5 w-40 border-b border-border">
                    Kategori
                  </th>
                  {presets.branches.length > 0 && (
                    <th className="sticky top-0 z-20 bg-muted text-left font-semibold px-3 py-2.5 w-28 border-b border-border">
                      Cabang
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {preview.transactions.map((t, idx) => (
                  <tr
                    key={idx}
                    className={
                      "align-top " +
                      (t.duplicate ? "bg-muted/40 opacity-70" : "")
                    }
                    title={
                      t.duplicate
                        ? "Duplikat — sudah ada di DB, tidak akan ditambah lagi saat commit"
                        : undefined
                    }
                  >
                    <td className="px-3 py-2 text-foreground whitespace-nowrap font-mono tabular-nums border-t border-border/60">
                      <div className="flex items-baseline gap-1.5">
                        <span>{t.date}</span>
                        {t.duplicate && (
                          <span className="text-[9px] font-sans font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-muted text-muted-foreground">
                            Dup
                          </span>
                        )}
                      </div>
                      {hasTime && t.time && (
                        <div className="text-muted-foreground text-[10px]">
                          {t.time}
                        </div>
                      )}
                    </td>
                    {showDescCol && (
                      <td className="px-3 py-2 text-foreground border-t border-border/60">
                        <span className="block line-clamp-2 leading-snug break-words" title={t.description}>
                          {t.description || "—"}
                        </span>
                      </td>
                    )}
                    {hasSrcDest && (
                      <td className="px-3 py-2 text-foreground border-t border-border/60">
                        <span className="block line-clamp-2 leading-snug break-words" title={t.sourceDestination ?? ""}>
                          {t.sourceDestination || "—"}
                        </span>
                      </td>
                    )}
                    {hasTxDetails && (
                      <td className="px-3 py-2 text-foreground border-t border-border/60">
                        <span className="block line-clamp-2 leading-snug break-words" title={t.transactionDetails ?? ""}>
                          {t.transactionDetails || "—"}
                        </span>
                      </td>
                    )}
                    {/* Catatan — read-only di preview; bisa diedit
                        setelah data masuk ke ledger. Hanya muncul kalau
                        ada minimal satu baris yang punya notes (CSV Jago
                        kolom Notes), supaya bank tanpa notes tidak nampak
                        kolom kosong. */}
                    {hasNotes && (
                      <td className="px-3 py-2 text-foreground border-t border-border/60">
                        <span
                          className="block line-clamp-2 leading-snug break-words text-muted-foreground"
                          title={t.notes ?? ""}
                        >
                          {t.notes || "—"}
                        </span>
                      </td>
                    )}
                    <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap border-t border-border/60">
                      {t.debit > 0 ? (
                        <span className="text-destructive">
                          {formatIDR(t.debit)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap border-t border-border/60">
                      {t.credit > 0 ? (
                        <span className="text-success">{formatIDR(t.credit)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground whitespace-nowrap border-t border-border/60">
                      {formatIDR(computedRunningBalances[idx] ?? 0)}
                    </td>
                    <td className="px-3 py-2 border-t border-border/60">
                      {t.duplicate ? (
                        <span className="text-[10px] text-muted-foreground italic">
                          (sudah di DB)
                        </span>
                      ) : (
                        <CategoryCell
                          tx={t}
                          presets={presets}
                          onChange={(v) => onPatchRow(idx, { category: v })}
                        />
                      )}
                    </td>
                    {presets.branches.length > 0 && (
                      <td className="px-3 py-2 border-t border-border/60">
                        {t.duplicate ? (
                          <span className="text-[10px] text-muted-foreground italic">
                            —
                          </span>
                        ) : (
                          <BranchCell
                            value={t.branch ?? null}
                            branches={presets.branches}
                            onChange={(v) => onPatchRow(idx, { branch: v })}
                          />
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const MONTHS_ID = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];
function periodLabel(p: PreviewResult): string {
  return `${MONTHS_ID[(p.periodMonth - 1 + 12) % 12]} ${p.periodYear}`;
}

/**
 * View gabungan multi-file: hasil preview SEMUA file dicampur jadi satu
 * tabel + ringkasan per file, lalu admin klik "Simpan semua" sekali.
 * Tiap baris tetap tahu file & index asalnya untuk edit kategori/cabang
 * dan untuk commit per-statement (periode/saldo masing-masing).
 */
function MergedPreview({
  batch,
  presets,
  noBalanceBank,
  onPatchRow,
}: {
  batch: BatchItem[];
  presets: CategoryPresets;
  noBalanceBank: boolean;
  onPatchRow: (
    fileIdx: number,
    rowIdx: number,
    patch: Partial<Pick<PreviewTx, "category" | "branch">>
  ) => void;
}) {
  const files = batch
    .map((item, idx) => ({ idx, item }))
    .filter((x) => x.item.preview);

  let parsed = 0;
  let added = 0;
  let dup = 0;
  for (const { item } of files) {
    const p = item.preview!;
    parsed += p.parsedCount;
    added += p.newCount;
    dup += p.skippedCount;
  }

  // Flatten semua transaksi, simpan asal (fileIdx, rowIdx), urut by tanggal.
  const rows: Array<{
    fileIdx: number;
    rowIdx: number;
    period: string;
    tx: PreviewTx;
  }> = [];
  for (const { idx, item } of files) {
    const p = item.preview!;
    p.transactions.forEach((tx, r) =>
      rows.push({ fileIdx: idx, rowIdx: r, period: periodLabel(p), tx })
    );
  }
  rows.sort((a, b) => a.tx.date.localeCompare(b.tx.date));

  const showBranch = presets.branches.length > 0;
  const anyUnverified =
    !noBalanceBank &&
    files.some(
      ({ item }) =>
        !item.preview!.verification.canVerify ||
        !item.preview!.verification.match
    );

  return (
    <div className="space-y-3">
      {/* Ringkasan gabungan */}
      <div className="flex items-center gap-4 flex-wrap rounded-xl border border-border bg-muted/30 px-4 py-2.5">
        <Stat label="File" value={files.length} tone="neutral" />
        <span className="text-border">·</span>
        <Stat label="Ter-parse" value={parsed} tone="neutral" />
        <span className="text-border">·</span>
        <Stat label="Akan ditambah" value={added} tone="success" />
        <span className="text-border">·</span>
        <Stat label="Duplikat" value={dup} tone="muted" />
      </div>

      {/* Ringkasan + rekonsiliasi per file */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="px-3 py-2 border-b border-border text-xs font-semibold text-foreground bg-muted/30">
          Ringkasan per file
        </div>
        <ul className="divide-y divide-border/60">
          {batch.map((b, idx) => {
            if (!b.preview && b.status !== "error") return null;
            const p = b.preview;
            const ok = p
              ? noBalanceBank || (p.verification.canVerify && p.verification.match)
              : false;
            return (
              <li key={idx} className="flex items-center gap-3 px-3 py-2 text-xs">
                <span
                  className="flex-1 min-w-0 truncate text-foreground"
                  title={b.file.name}
                >
                  {b.file.name}
                  {p && (
                    <span className="text-muted-foreground"> · {periodLabel(p)}</span>
                  )}
                </span>
                {p ? (
                  <>
                    <span
                      className={
                        "font-semibold whitespace-nowrap " +
                        (ok ? "text-success" : "text-destructive")
                      }
                    >
                      {noBalanceBank
                        ? "Tanpa verifikasi saldo"
                        : ok
                        ? "Saldo cocok"
                        : "Saldo tidak cocok"}
                    </span>
                    <span className="text-muted-foreground whitespace-nowrap">
                      +{p.newCount}
                      {p.skippedCount ? ` (${p.skippedCount} dup)` : ""}
                    </span>
                  </>
                ) : (
                  <span
                    className="font-semibold text-destructive whitespace-nowrap max-w-[260px] truncate"
                    title={b.message}
                  >
                    Gagal: {b.message ?? "error"}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {anyUnverified && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive leading-snug">
          Sebagian file saldonya tidak cocok / tidak terbaca. Tombol{" "}
          <strong>Simpan semua</strong> nonaktif sampai semua file lolos —
          upload ulang file yang bermasalah dengan rentang lebih presisi.
        </div>
      )}

      {/* Tabel transaksi gabungan */}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground italic py-4 text-center">
          Tidak ada transaksi baru untuk ditambahkan.
        </p>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-auto max-h-[min(60vh,560px)]">
            <table className="w-full text-xs border-separate border-spacing-0">
              <thead className="text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="sticky top-0 z-20 bg-muted text-left font-semibold px-3 py-2.5 w-24 border-b border-border">
                    Periode
                  </th>
                  <th className="sticky top-0 z-20 bg-muted text-left font-semibold px-3 py-2.5 w-24 border-b border-border">
                    Tanggal
                  </th>
                  <th className="sticky top-0 z-20 bg-muted text-left font-semibold px-3 py-2.5 border-b border-border">
                    Keterangan
                  </th>
                  <th className="sticky top-0 z-20 bg-muted text-right font-semibold px-3 py-2.5 w-28 border-b border-border">
                    Debit
                  </th>
                  <th className="sticky top-0 z-20 bg-muted text-right font-semibold px-3 py-2.5 w-28 border-b border-border">
                    Kredit
                  </th>
                  <th className="sticky top-0 z-20 bg-muted text-left font-semibold px-3 py-2.5 w-40 border-b border-border">
                    Kategori
                  </th>
                  {showBranch && (
                    <th className="sticky top-0 z-20 bg-muted text-left font-semibold px-3 py-2.5 w-28 border-b border-border">
                      Cabang
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ fileIdx, rowIdx, period, tx }, i) => (
                  <tr
                    key={`${fileIdx}-${rowIdx}-${i}`}
                    className={"align-top " + (tx.duplicate ? "bg-muted/40 opacity-70" : "")}
                  >
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap border-t border-border/60">
                      {period}
                    </td>
                    <td className="px-3 py-2 text-foreground whitespace-nowrap font-mono tabular-nums border-t border-border/60">
                      {tx.date}
                      {tx.duplicate && (
                        <span className="ml-1 text-[9px] font-sans font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-muted text-muted-foreground">
                          Dup
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-foreground border-t border-border/60">
                      <span
                        className="block line-clamp-2 leading-snug break-words"
                        title={tx.description}
                      >
                        {tx.description || tx.sourceDestination || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap border-t border-border/60">
                      {tx.debit > 0 ? (
                        <span className="text-destructive">{formatIDR(tx.debit)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap border-t border-border/60">
                      {tx.credit > 0 ? (
                        <span className="text-success">{formatIDR(tx.credit)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 border-t border-border/60">
                      {tx.duplicate ? (
                        <span className="text-[10px] text-muted-foreground italic">
                          (sudah di DB)
                        </span>
                      ) : (
                        <CategoryCell
                          tx={tx}
                          presets={presets}
                          onChange={(v) => onPatchRow(fileIdx, rowIdx, { category: v })}
                        />
                      )}
                    </td>
                    {showBranch && (
                      <td className="px-3 py-2 border-t border-border/60">
                        {tx.duplicate ? (
                          <span className="text-[10px] text-muted-foreground italic">
                            —
                          </span>
                        ) : (
                          <BranchCell
                            value={tx.branch ?? null}
                            branches={presets.branches}
                            onChange={(v) => onPatchRow(fileIdx, rowIdx, { branch: v })}
                          />
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Balance reconciliation panel. Computes what the closing saldo
 * *should* be based on the PDF-read opening balance plus the sum of
 * parsed credits/debits, and compares against the closing saldo the
 * PDF actually shows. Three outcomes:
 *
 *   - canVerify=false  → PDF header/footer didn't expose opening or
 *     closing saldo, so there's nothing to match against. Block commit
 *     with a clear reason.
 *   - match=true       → everything reconciles down to the rupiah.
 *     Safe to commit; panel renders in green.
 *   - match=false      → the PDF was read incompletely (missing rows,
 *     duplicated rows, or a misread digit). Panel renders in red with
 *     the full arithmetic so the admin can see exactly where it
 *     breaks, and the Konfirmasi button stays disabled.
 */
function ReconciliationPanel({
  preview,
  noBalanceBank,
}: {
  preview: PreviewResult;
  noBalanceBank: boolean;
}) {
  const v = preview.verification;
  if (!v.canVerify) {
    // Bank tanpa kolom saldo (BCA): bukan error — memang formatnya
    // tidak menyertakan saldo. Tampilkan catatan informatif, commit
    // tetap diizinkan.
    if (noBalanceBank) {
      return (
        <div className="rounded-xl border-2 border-warning/40 bg-warning/5 p-4 space-y-1.5">
          <p className="text-sm font-semibold text-warning flex items-center gap-2">
            <AlertTriangle size={14} />
            Verifikasi saldo dilewati
          </p>
          <p className="text-xs text-foreground leading-snug">
            Mutasi rekening bank ini tidak menyertakan kolom saldo per
            baris, jadi sistem tidak bisa merekonsiliasi saldo awal/akhir
            otomatis. Transaksi tetap bisa disimpan — pastikan kamu sudah
            memeriksa daftar di bawah sebelum konfirmasi.
          </p>
        </div>
      );
    }
    return (
      <div className="rounded-xl border-2 border-destructive/40 bg-destructive/5 p-4 space-y-1.5">
        <p className="text-sm font-semibold text-destructive flex items-center gap-2">
          <AlertTriangle size={14} />
          Tidak bisa verifikasi saldo
        </p>
        <p className="text-xs text-foreground leading-snug">
          Saldo awal dan/atau saldo akhir tidak terbaca dari file. Tanpa
          dua angka ini, sistem tidak bisa memastikan semua transaksi
          tercatat dengan benar. Konfirmasi & simpan di-nonaktifkan
          sampai nilainya bisa terbaca atau kamu pakai Input manual.
        </p>
      </div>
    );
  }
  const matchCls = v.match
    ? "border-success/40 bg-success/5"
    : "border-destructive/40 bg-destructive/5";
  return (
    <div className={`rounded-xl border-2 p-4 space-y-2 ${matchCls}`}>
      <div className="flex items-center gap-2">
        {v.match ? (
          <>
            <span className="inline-flex items-center justify-center size-5 rounded-full bg-success text-primary-foreground">
              ✓
            </span>
            <p className="text-sm font-semibold text-success">
              Saldo cocok — verifikasi lolos
            </p>
          </>
        ) : (
          <>
            <AlertTriangle size={14} className="text-destructive" />
            <p className="text-sm font-semibold text-destructive">
              Saldo tidak cocok — ada transaksi yang kurang, berlebih,
              atau nominalnya salah
            </p>
          </>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-xs pt-1">
        <BalRow label="Saldo awal" value={preview.openingBalance} tone="neutral" />
        <BalRow label="+ Total kredit" value={v.sumCredit} tone="success" sign="+" />
        <BalRow label="− Total debit" value={v.sumDebit} tone="destructive" sign="−" />
        <BalRow
          label="= Hitung saldo akhir"
          value={v.computedClosing}
          tone={v.match ? "success" : "destructive"}
          strong
        />
        <BalRow
          label="Saldo akhir file"
          value={preview.closingBalance}
          tone={v.match ? "success" : "destructive"}
          strong
        />
      </div>
      {!v.match && (
        <p className="text-xs text-destructive pt-1">
          Selisih: <strong>Rp {v.diff.toLocaleString("id-ID")}</strong>.
          Batalkan lalu upload ulang dengan rentang tanggal yang lebih
          presisi, atau pakai <strong>Input manual</strong> untuk isi
          sendiri.
        </p>
      )}
    </div>
  );
}

function BalRow({
  label,
  value,
  tone,
  sign,
  strong,
}: {
  label: string;
  value: number;
  tone: "neutral" | "success" | "destructive";
  sign?: "+" | "−";
  strong?: boolean;
}) {
  const valueCls =
    tone === "success"
      ? "text-success"
      : tone === "destructive"
      ? "text-destructive"
      : "text-foreground";
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={`font-mono tabular-nums ${
          strong ? "text-sm font-bold" : "text-xs"
        } ${valueCls}`}
      >
        {sign ?? ""} Rp {value.toLocaleString("id-ID")}
      </p>
    </div>
  );
}

/**
 * Inline dropdown for the Kategori column in the preview table.
 * Uses the credit or debit preset based on the tx sign — same logic
 * the lifetime CashflowTable uses.
 */
function CategoryCell({
  tx,
  presets,
  onChange,
}: {
  tx: PreviewTx;
  presets: CategoryPresets;
  onChange: (v: string | null) => void;
}) {
  const isCredit = tx.credit > 0;
  const isDebit = tx.debit > 0;
  const list = isCredit ? presets.credit : isDebit ? presets.debit : [];
  const value = tx.category ?? "";
  if (list.length === 0) {
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs transition-all focus:text-sm focus:h-10 focus:relative focus:z-10 focus:shadow-lg focus:ring-2 focus:ring-primary/30 focus:outline-none"
        placeholder="—"
      />
    );
  }
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs transition-all focus:text-sm focus:h-10 focus:relative focus:z-10 focus:shadow-lg focus:ring-2 focus:ring-primary/30 focus:outline-none"
    >
      <option value="">—</option>
      {list.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
      {value && !list.includes(value) && (
        <option value={value}>{value} (custom)</option>
      )}
    </select>
  );
}

function BranchCell({
  value,
  branches,
  onChange,
}: {
  value: string | null;
  branches: readonly string[];
  onChange: (v: string | null) => void;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs transition-all focus:text-sm focus:h-10 focus:relative focus:z-10 focus:shadow-lg focus:ring-2 focus:ring-primary/30 focus:outline-none"
    >
      <option value="">—</option>
      {branches.map((b) => (
        <option key={b} value={b}>
          {b}
        </option>
      ))}
      {value && !branches.includes(value) && (
        <option value={value}>{value} (custom)</option>
      )}
    </select>
  );
}

/**
 * Two-stage progress UI during preview:
 *   1. "uploading" — real byte progress from XHR.upload.onprogress
 *   2. "parsing"   — indeterminate animated bar (server parse is fast,
 *      tidak ada progress signal — UX theater yang jujur).
 * Shown only while `stage` is not idle.
 */
function UploadProgress({
  stage,
  uploadPct,
  bank,
}: {
  stage: "uploading" | "parsing";
  uploadPct: number;
  bank: BankCode | null;
}) {
  const isUploading = stage === "uploading";
  const fileNoun = fileNounFor(bank);
  const label = isUploading
    ? `Mengupload ${fileNoun}… ${uploadPct}%`
    : `Memparse ${fileNoun}…`;
  const sublabel = isUploading
    ? "Jangan tutup dialog. File sedang dikirim ke server."
    : "Server sedang mengekstrak transaksi dari file.";
  return (
    <div className="rounded-xl border border-border bg-accent/30 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-foreground">{label}</p>
        {isUploading && (
          <span className="font-mono tabular-nums text-[11px] text-muted-foreground">
            {uploadPct}%
          </span>
        )}
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        {isUploading ? (
          <div
            className="h-full bg-primary transition-[width] duration-200 ease-out"
            style={{ width: `${uploadPct}%` }}
          />
        ) : (
          // Indeterminate animated stripe — no true progress signal
          // from the server for the AI call, so this is UX theater
          // that honestly signals "we're working on it".
          <div className="h-full w-1/3 bg-primary animate-[slide_1.5s_ease-in-out_infinite]" />
        )}
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug">
        {sublabel}
      </p>
      <style jsx>{`
        @keyframes slide {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(400%);
          }
        }
      `}</style>
    </div>
  );
}

/**
 * Inline stat — label + value on one line. Cheaper than a boxed card
 * and keeps the summary strip compact at the top of the preview.
 */
function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "success" | "muted";
}) {
  const valueCls =
    tone === "success"
      ? "text-success"
      : tone === "muted"
      ? "text-muted-foreground"
      : "text-foreground";
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className={`font-mono tabular-nums text-base font-semibold ${valueCls}`}>
        {value}
      </span>
    </div>
  );
}
