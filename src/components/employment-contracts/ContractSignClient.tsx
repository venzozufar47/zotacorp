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
  type EmploymentContract,
  type ContractSignerIdentity,
} from "@/lib/employment-contracts/types";
import { SignaturePad } from "./SignaturePad";

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
    tgl_lahir: contract.fields?.tgl_lahir || signerPrefill.tgl_lahir,
    alamat: contract.fields?.alamat || signerPrefill.alamat,
  }));
  const [consent, setConsent] = useState(false);
  const [downloading, setDownloading] = useState(false);

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
    if (!sigBlob) return void toast.error("Bubuhkan tanda tangan dulu");
    if (!consent) return void toast.error("Centang persetujuan");
    startTransition(async () => {
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
            . Slip gaji kamu sudah terbuka.
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

          {/* Lampiran 1 */}
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
            {IDENTITY_FIELDS.map((f) => (
              <label
                key={f.key}
                className={`block space-y-1 ${f.full ? "sm:col-span-2" : ""}`}
              >
                <span className="text-xs font-medium text-muted-foreground">
                  {f.label} <span className="text-destructive">*</span>
                </span>
                <input
                  value={idf[f.key]}
                  onChange={(e) =>
                    setIdf((s) => ({ ...s, [f.key]: e.target.value }))
                  }
                  className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm"
                  required
                />
              </label>
            ))}
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
              Perjanjian Kerja beserta Lampiran ini, dan menandatanganinya secara
              elektronik dengan sadar tanpa paksaan. Tanda tangan elektronik ini
              sah sebagai alat bukti sesuai UU ITE.
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
