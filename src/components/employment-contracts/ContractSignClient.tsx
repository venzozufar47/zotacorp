"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Camera,
  Download,
  Lock,
  CheckCircle2,
  FileText,
  PenLine,
  RefreshCw,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Disclosure, DisclosureGroup } from "@/components/account/Disclosure";
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

  // Dua pintu ke foto KTP: kamera langsung, atau galeri (tanpa `capture` supaya HP menawarkan pilihan dari galeri).
  const ktpCameraRef = useRef<HTMLInputElement | null>(null);
  const ktpGalleryRef = useRef<HTMLInputElement | null>(null);
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

  const identityComplete = IDENTITY_FIELDS.every((f) => idf[f.key].trim() !== "");
  // Identitas yang sudah terisi dari profil cukup diringkas; dibuka hanya bila perlu dikoreksi.
  const [editIdentity, setEditIdentity] = useState(!identityComplete);
  const withLampiran = shouldRenderLampiran(contract.body_markdown, lampiran);

  return (
    <div className="space-y-4">
      {/* Status dulu: apa yang diminta dari karyawan */}
      {updateRequired ? (
        <StatusBanner
          tone="warning"
          icon={<RefreshCw size={18} aria-hidden />}
          title="Kontrak diperbarui, tanda tangani ulang"
        >
          {contract.update_note ? (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Perubahan:</span>{" "}
              {contract.update_note}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Baca versi terbaru di bawah, lalu tanda tangani ulang.
            </p>
          )}
        </StatusBanner>
      ) : signed ? (
        <StatusBanner
          tone="success"
          icon={<CheckCircle2 size={18} aria-hidden />}
          title="Sudah kamu tandatangani"
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11 gap-1.5"
              onClick={download}
              loading={downloading}
            >
              <Download size={14} /> PDF
            </Button>
          }
        >
          {contract.employee_signed_at && (
            <p className="text-sm text-muted-foreground">
              {new Date(contract.employee_signed_at).toLocaleString("id-ID", {
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
        </StatusBanner>
      ) : (
        <StatusBanner
          tone="warning"
          icon={<PenLine size={18} aria-hidden />}
          title="Menunggu tanda tanganmu"
        >
          <p className="text-sm text-muted-foreground">
            Baca isi kontrak, lalu tanda tangani di bagian bawah.
          </p>
        </StatusBanner>
      )}

      {/* Dokumen: terbuka saat belum ditandatangani, tertutup setelahnya */}
      <DisclosureGroup>
        <Disclosure
          title="Isi kontrak"
          icon={FileText}
          summary={withLampiran ? "Perjanjian Kerja dan Lampiran" : "Perjanjian Kerja"}
          defaultOpen={!signed}
        >
          <div className="mx-auto max-w-[760px] rounded-xl border border-border bg-card px-4 py-5 text-[13px] leading-relaxed text-foreground sm:px-8">
            <BlocksHtml blocks={blocks} />

            {/* Lampiran 1: hanya bila kontrak punya lampiran */}
            {withLampiran && (
              <>
                <hr className="my-6 border-border" />
                <h2 className="mb-3 text-center text-base font-bold">
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
        </Disclosure>
      </DisclosureGroup>

      {/* Panel tanda tangan: tiga langkah */}
      {!signed && (
        <div className="space-y-5 rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div>
            <h2 className="font-display text-base font-semibold">
              {updateRequired ? "Tanda tangani ulang" : "Tanda tangani kontrak"}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Meterai Rp10.000 dibubuhkan terpisah oleh perusahaan.
            </p>
          </div>

          <Step n={1} title="Identitas">
            {!editIdentity ? (
              <div className="flex items-start justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2.5">
                <div className="min-w-0 text-sm">
                  <p className="font-medium">{idf.nama}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    NIK {idf.nik} · {idf.tempat_lahir}, {idf.tgl_lahir}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{idf.alamat}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11 shrink-0 text-muted-foreground"
                  onClick={() => setEditIdentity(true)}
                >
                  Ubah
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {IDENTITY_FIELDS.map((f) => {
                  const label = (
                    <span className="text-xs text-muted-foreground">
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
                      <Input
                        value={idf[f.key]}
                        onChange={(e) =>
                          setIdf((s) => ({ ...s, [f.key]: e.target.value }))
                        }
                        required
                      />
                    </label>
                  );
                })}
              </div>
            )}
          </Step>

          <Step n={2} title="Foto KTP" required={!hasSavedKtp}>
            <p className="text-xs text-muted-foreground">
              {hasSavedKtp
                ? "Foto KTP kamu sudah tersimpan. Unggah lagi hanya bila ingin menggantinya."
                : "Seluruh kartu terlihat jelas dan tidak buram. Hanya admin yang melihatnya, untuk administrasi kepegawaian. Foto tidak masuk ke dokumen kontrak."}
            </p>
            <input
              ref={ktpCameraRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                pickKtp(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            <input
              ref={ktpGalleryRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                pickKtp(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 gap-2"
                disabled={pending}
                onClick={() => ktpCameraRef.current?.click()}
              >
                <Camera size={16} /> {ktpFile ? "Foto ulang" : "Ambil foto"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 gap-2"
                disabled={pending}
                onClick={() => ktpGalleryRef.current?.click()}
              >
                <ImageIcon size={16} /> Dari galeri
              </Button>
            </div>
            {ktpPreview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ktpPreview}
                alt="Pratinjau foto KTP"
                className="max-h-48 w-auto rounded-lg border border-border"
              />
            )}
          </Step>

          <Step n={3} title="Tanda tangan" required>
            <SignaturePad onBlob={setSigBlob} disabled={pending} />
            <label className="flex cursor-pointer items-start gap-2.5 pt-1">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-primary"
              />
              <span className="text-xs leading-relaxed text-muted-foreground">
                Saya sudah membaca, memahami, dan menyetujui seluruh isi Perjanjian
                Kerja{withLampiran ? " beserta Lampiran" : ""} ini, termasuk
                pemrosesan data pribadi saya (termasuk foto KTP) untuk administrasi
                kepegawaian. Saya menandatanganinya secara elektronik dengan sadar
                dan tanpa paksaan. Tanda tangan elektronik ini sah sebagai alat bukti
                menurut UU ITE.
              </span>
            </label>
          </Step>

          <Button
            type="button"
            onClick={submit}
            loading={pending}
            className="min-h-12 w-full gap-2"
          >
            <Lock size={15} /> {pending ? "Memproses…" : "Tandatangani kontrak"}
          </Button>
        </div>
      )}
    </div>
  );
}

function StatusBanner({
  tone,
  icon,
  title,
  action,
  children,
}: {
  tone: "warning" | "success";
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-full ${
          tone === "success" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
        }`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-semibold">{title}</p>
        {children}
      </div>
      {action}
    </div>
  );
}

function Step({
  n,
  title,
  required,
  children,
}: {
  n: number;
  title: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <span className="grid size-5 place-items-center rounded-full bg-foreground text-[11px] font-semibold text-background">
          {n}
        </span>
        {title}
        {required && <span className="text-destructive">*</span>}
      </h3>
      {children}
    </section>
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
