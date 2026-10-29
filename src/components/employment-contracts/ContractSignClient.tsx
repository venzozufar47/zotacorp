"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Lock, CheckCircle2 } from "lucide-react";
import {
  signEmploymentContract,
  getContractRenderData,
} from "@/lib/actions/employment-contracts.actions";
import { downloadContractPdf } from "@/lib/employment-contracts/downloadContractPdf";
import {
  fillAndParse,
  type ContractBlock,
  type InlineSpan,
} from "@/lib/employment-contracts/markdown";
import {
  contractSignState,
  shouldRenderLampiran,
  type EmploymentContract,
  type ContractSignerIdentity,
} from "@/lib/employment-contracts/types";
import { SignaturePad } from "./SignaturePad";
import { BirthDatePicker, BirthPlacePicker } from "./BirthFields";
import {
  formatTanggalLahir,
  parseTanggalLahir,
} from "@/lib/employment-contracts/birth";

function normalizeBirthDate(text: string | null | undefined): string {
  const b = parseTanggalLahir(text ?? "");
  return b ? formatTanggalLahir(b) : "";
}

/**
 * Perkecil foto KTP dari kamera HP (sering 4-8 MB) ke sisi terpanjang 1600px
 * JPEG sebelum diunggah: tetap terbaca, jauh lebih ringan. Gagal decode
 * (format tak dikenal) → kirim file asli; server yang menolak bila tak valid.
 */
async function shrinkImage(file: File, maxSide = 1600): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85)
    );
    return blob ? new File([blob], "ktp.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

const IDENTITY_FIELDS: Array<{
  key: keyof ContractSignerIdentity;
  label: string;
  full?: boolean;
}> = [
  { key: "nama", label: "Nama lengkap" },
  { key: "nik", label: "NIK (sesuai KTP)" },
  { key: "tempat_lahir", label: "Tempat lahir" },
  { key: "tgl_lahir", label: "Tanggal lahir" },
  { key: "alamat", label: "Alamat (sesuai domisili)", full: true },
];

export function ContractSignClient({
  contract,
  signerPrefill,
}: {
  contract: EmploymentContract;
  signerPrefill: ContractSignerIdentity;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sigBlob, setSigBlob] = useState<Blob | null>(null);
  // Identitas pribadi — prefill dari profil (kalau ada), karyawan lengkapi.
  const [idf, setIdf] = useState<ContractSignerIdentity>(() => ({
    nama: contract.fields?.nama || signerPrefill.nama,
    nik: contract.fields?.nik || signerPrefill.nik,
    tempat_lahir: contract.fields?.tempat_lahir || signerPrefill.tempat_lahir,
    // Hanya format baku yang dipakai ("20 September 1999"); tanggal dari
    // profil/isian lama yang formatnya lain dikosongkan agar dipilih ulang.
    tgl_lahir: normalizeBirthDate(contract.fields?.tgl_lahir || signerPrefill.tgl_lahir),
    alamat: contract.fields?.alamat || signerPrefill.alamat,
  }));
  const [consent, setConsent] = useState(false);
  const [downloading, setDownloading] = useState(false);
  // Foto KTP: wajib saat pertama kali tanda tangan. Pada tanda tangan ulang,
  // foto yang sudah tersimpan dipakai kembali (boleh diganti).
  const [ktpFile, setKtpFile] = useState<File | null>(null);
  const [ktpPreview, setKtpPreview] = useState<string | null>(null);
  const hasSavedKtp = !!contract.ktp_photo_path;

  const pickKtp = (file: File | null) => {
    if (ktpPreview) URL.revokeObjectURL(ktpPreview);
    setKtpFile(file);
    setKtpPreview(file ? URL.createObjectURL(file) : null);
  };

  // Preview ikut ter-update saat karyawan mengisi identitas.
  const blocks = useMemo(
    () =>
      fillAndParse(contract.body_markdown, {
        ...(contract.fields ?? {}),
        ...idf,
      }),
    [contract.body_markdown, contract.fields, idf]
  );
  const lampiran = contract.lampiran;
  const signState = contractSignState(contract);
  const signed = signState === "signed_current";
  const updateRequired = signState === "update_required";

  const submit = () => {
    const missing = IDENTITY_FIELDS.find((f) => !idf[f.key].trim());
    if (missing) return void toast.error(`${missing.label} wajib diisi`);
    if (!hasSavedKtp && !ktpFile)
      return void toast.error("Foto KTP wajib diunggah");
    if (!sigBlob) return void toast.error("Bubuhkan tanda tangan dulu");
    if (!consent) return void toast.error("Centang persetujuan");
    startTransition(async () => {
      let ktpPath: string | null = null;
      if (ktpFile) {
        const small = await shrinkImage(ktpFile);
        const kfd = new FormData();
        kfd.append("file", small, small.name);
        kfd.append("kind", "ktp");
        kfd.append("id", contract.id);
        const kup = await fetch("/api/employment-contracts/upload", {
          method: "POST",
          body: kfd,
        });
        const kj = await kup.json();
        if (!kup.ok) return void toast.error(kj.error ?? "Gagal upload foto KTP");
        ktpPath = kj.path;
      }
      const fd = new FormData();
      fd.append("file", sigBlob, "ttd.png");
      fd.append("kind", "employee");
      fd.append("id", contract.id);
      const up = await fetch("/api/employment-contracts/upload", {
        method: "POST",
        body: fd,
      });
      const j = await up.json();
      if (!up.ok) return void toast.error(j.error ?? "Gagal upload tanda tangan");
      const res = await signEmploymentContract({
        contractId: contract.id,
        signaturePath: j.path,
        ktpPath,
        identity: {
          nama: idf.nama.trim(),
          nik: idf.nik.trim(),
          tempat_lahir: idf.tempat_lahir.trim(),
          tgl_lahir: idf.tgl_lahir.trim(),
          alamat: idf.alamat.trim(),
        },
        consent,
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Kontrak berhasil ditandatangani");
      router.refresh();
    });
  };

  const download = async () => {
    // Render fresh dari data — tanda tangan Pemberi Kerja + format terbaru
    // selalu ikut, tidak tergantung PDF beku lama.
    setDownloading(true);
    const res = await getContractRenderData(contract.id);
    setDownloading(false);
    if (!res.ok || !res.data) return void toast.error(res.ok ? "Gagal" : res.error);
    await downloadContractPdf(res.data);
  };

  return (
    <div className="space-y-4">
      {updateRequired && (
        <div className="rounded-xl border-2 border-foreground bg-warning/40 px-4 py-3 space-y-1">
          <p className="text-sm font-bold">
            Kontrak diperbarui — mohon tanda tangani ulang
          </p>
          <p className="text-xs text-foreground/80">
            Ada perubahan pada kontrakmu. Baca ringkasannya di bawah, lalu tanda
            tangani ulang versi terbaru ini.
          </p>
          {contract.update_note && (
            <p className="text-xs">
              <span className="font-semibold">Perubahan:</span>{" "}
              {contract.update_note}
            </p>
          )}
        </div>
      )}

      {signed && (
        <div className="flex items-center gap-2 rounded-xl border-2 border-foreground bg-pop-emerald/20 px-4 py-3">
          <CheckCircle2 size={18} className="text-foreground" />
          <span className="text-sm font-medium flex-1">
            Kontrak sudah kamu tandatangani
            {contract.employee_signed_at
              ? ` pada ${new Date(contract.employee_signed_at).toLocaleString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
              : ""}
            .
          </span>
          <button
            type="button"
            onClick={download}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 rounded-lg border-2 border-foreground bg-card px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
          >
            <Download size={14} /> Unduh PDF
          </button>
        </div>
      )}

      {/* Dokumen */}
      <div className="rounded-2xl border-2 border-foreground bg-white shadow-hard-sm">
        <div className="px-5 sm:px-8 py-6 max-w-[760px] mx-auto text-[13px] text-foreground leading-relaxed">
          <BlocksHtml blocks={blocks} />

          {/* Lampiran 1 — hanya bila kontrak punya lampiran */}
          {shouldRenderLampiran(contract.body_markdown, lampiran) && (
            <>
              <hr className="my-6 border-border" />
              <h2 className="text-center font-bold text-base mb-3">
                LAMPIRAN 1: DESKRIPSI PEKERJAAN
              </h2>
              <p className="mb-1">
                <strong>Nama:</strong> {lampiran?.nama || contract.fields?.nama || "—"}
                {" · "}
                <strong>Posisi:</strong> {lampiran?.posisi || contract.fields?.jabatan || "—"}
              </p>
              <p className="mb-3">
                <strong>Cabang:</strong> {lampiran?.cabang || contract.fields?.cabang || "—"}
              </p>
              <LampiranList title="B. Tujuan Posisi" items={lampiran?.tujuan} />
              <LampiranList title="C. Tanggung Jawab Utama" items={lampiran?.tanggung_jawab} />
              <LampiranList title="D. SOP yang Relevan" items={lampiran?.sop} />
              <LampiranList title="E. Indikator Kinerja (KPI)" items={lampiran?.kpi} />
              <LampiranList title="F. Waktu Kerja / Shift" items={lampiran?.shift} />
            </>
          )}
        </div>
      </div>

      {/* Sign panel */}
      {!signed && (
        <div className="rounded-2xl border-2 border-foreground bg-card p-5 space-y-4">
          <h3 className="font-display font-bold">
            {updateRequired ? "Tanda tangani ulang kontrak" : "Tanda tangani kontrak"}
          </h3>
          <p className="text-xs text-muted-foreground">
            Lengkapi identitas pribadimu (wajib — sebagian terisi otomatis dari
            profil), bubuhkan tanda tangan, lalu setujui pernyataan di bawah.
            Meterai Rp10.000 dibubuhkan terpisah oleh perusahaan.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {IDENTITY_FIELDS.map((f) => {
              const label = (
                <span className="text-xs font-medium text-muted-foreground">
                  {f.label} <span className="text-destructive">*</span>
                </span>
              );
              // Tempat & tanggal lahir lewat dropdown supaya format seragam
              // ("Surakarta", "20 September 1999").
              if (f.key === "tempat_lahir" || f.key === "tgl_lahir") {
                return (
                  <div key={f.key} className="space-y-1 sm:col-span-2">
                    {label}
                    {f.key === "tempat_lahir" ? (
                      <BirthPlacePicker
                        value={idf.tempat_lahir}
                        onChange={(v) => setIdf((s) => ({ ...s, tempat_lahir: v }))}
                        disabled={pending}
                      />
                    ) : (
                      <BirthDatePicker
                        value={idf.tgl_lahir}
                        onChange={(v) => setIdf((s) => ({ ...s, tgl_lahir: v }))}
                        disabled={pending}
                      />
                    )}
                  </div>
                );
              }
              return (
                <label
                  key={f.key}
                  className={`block space-y-1 ${f.full ? "sm:col-span-2" : ""}`}
                >
                  {label}
                  <input
                    value={idf[f.key]}
                    onChange={(e) =>
                      setIdf((s) => ({ ...s, [f.key]: e.target.value }))
                    }
                    className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm"
                    required
                  />
                </label>
              );
            })}
          </div>
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">
              Foto KTP{" "}
              {!hasSavedKtp && <span className="text-destructive">*</span>}
            </span>
            <p className="text-xs text-muted-foreground">
              {hasSavedKtp
                ? "Foto KTP kamu sudah tersimpan. Unggah lagi hanya bila ingin menggantinya."
                : "Foto KTP asli kamu (seluruh kartu terlihat jelas, tidak buram). Hanya dilihat admin untuk administrasi kepegawaian dan tidak dimasukkan ke dokumen kontrak."}
            </p>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              disabled={pending}
              onChange={(e) => pickKtp(e.target.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border-2 file:border-foreground file:bg-card file:px-3 file:py-1.5 file:text-sm file:font-semibold"
            />
            {ktpPreview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ktpPreview}
                alt="Pratinjau foto KTP"
                className="max-h-48 w-auto rounded-lg border border-border"
              />
            )}
          </div>
          <div>
            <span className="text-xs font-medium text-muted-foreground">Tanda tangan</span>
            <SignaturePad onBlob={setSigBlob} disabled={pending} />
          </div>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 size-4 accent-primary"
            />
            <span className="text-xs leading-relaxed text-foreground">
              Saya menyatakan telah membaca, memahami, dan menyetujui seluruh isi
              Perjanjian Kerja
              {shouldRenderLampiran(contract.body_markdown, lampiran)
                ? " beserta Lampiran"
                : ""}{" "}
              ini, termasuk pemrosesan data pribadi saya (termasuk foto KTP) untuk
              administrasi kepegawaian, dan menandatanganinya secara elektronik
              dengan sadar tanpa paksaan. Tanda tangan elektronik ini sah sebagai
              alat bukti sesuai UU ITE.
            </span>
          </label>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground border-2 border-foreground px-4 py-2 text-sm font-semibold shadow-hard-sm disabled:opacity-50"
          >
            <Lock size={15} /> {pending ? "Memproses…" : "Tandatangani kontrak"}
          </button>
        </div>
      )}
    </div>
  );
}

function Inline({ spans }: { spans: InlineSpan[] }) {
  return (
    <>
      {spans.map((s, i) =>
        s.bold ? <strong key={i}>{s.text}</strong> : <span key={i}>{s.text}</span>
      )}
    </>
  );
}

function BlocksHtml({ blocks }: { blocks: ContractBlock[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.kind === "hr") return <hr key={i} className="my-4 border-border" />;
        if (b.kind === "h1")
          return (
            <h1 key={i} className="text-center font-bold text-base mt-2 mb-2">
              <Inline spans={b.spans} />
            </h1>
          );
        if (b.kind === "h2")
          return (
            <h2 key={i} className="font-bold text-sm mt-4 mb-1">
              <Inline spans={b.spans} />
            </h2>
          );
        if (b.kind === "h3")
          return (
            <h3 key={i} className="font-bold mt-3 mb-1">
              <Inline spans={b.spans} />
            </h3>
          );
        if (b.kind === "li")
          return (
            <div key={i} className="flex gap-2 mb-1 pl-2">
              <span className="text-muted-foreground shrink-0">{b.marker}</span>
              <span className="text-justify">
                <Inline spans={b.spans} />
              </span>
            </div>
          );
        return (
          <p key={i} className="mb-2 text-justify">
            <Inline spans={b.spans} />
          </p>
        );
      })}
    </>
  );
}

function LampiranList({ title, items }: { title: string; items?: string[] }) {
  const clean = (items ?? []).map((x) => (x ?? "").trim()).filter(Boolean);
  return (
    <div className="mb-2">
      <h3 className="font-bold mt-3 mb-1">{title}</h3>
      {clean.length === 0 ? (
        <p className="text-muted-foreground">—</p>
      ) : (
        <ol className="list-decimal pl-6 space-y-0.5">
          {clean.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ol>
      )}
    </div>
  );
}
