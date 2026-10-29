"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FileText,
  Plus,
  Trash2,
  Pencil,
  Eye,
  Download,
  X,
  Send,
  Ban,
  Users,
  Copy,
  ArrowUp,
  ArrowDown,
  Archive,
  ArchiveRestore,
  IdCard,
  RefreshCw,
} from "lucide-react";
import {
  reviseEmploymentContract,
  getContractKtpUrl,
  upsertContractTemplate,
  setTemplateEmployerSignature,
  prefillContractFields,
  issueEmploymentContract,
  bulkIssueEmploymentContracts,
  updateEmploymentContract,
  deleteEmploymentContract,
  setEmploymentContractArchived,
  getContractRenderData,
  getNextContractNumber,
  type ContractListRow,
  type BulkContractRow,
  type EmployerSignatureStatus,
} from "@/lib/actions/employment-contracts.actions";
import { contractNomorSurat } from "@/lib/employment-contracts/markdown";
import {
  BRANCH_OPTIONS,
  CONTRACT_FIELD_DEFS,
  CONTRACT_STATUS_LABELS,
  contractNeedsSignature,
  contractSignState,
  emptyLampiran,
  type ContractFields,
  type ContractLampiran,
  type EmploymentContractTemplate,
  type EmploymentContractStatus,
} from "@/lib/employment-contracts/types";
import {
  YEOBO_SPACE_CONTRACT_BODY,
  HAENGBOCAKE_CONTRACT_BODY,
  EMPLOYER,
} from "@/lib/employment-contracts/default-templates";
import { terbilang } from "@/lib/employment-contracts/terbilang";
import {
  downloadContractPdf,
  previewContractPdf,
} from "@/lib/employment-contracts/downloadContractPdf";
import { SignaturePad } from "@/components/employment-contracts/SignaturePad";
import type { ContractEmployee } from "@/app/(admin)/admin/employment-contracts/page";

const INPUT =
  "w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm";
const BTN_PRIMARY =
  "inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground border-2 border-foreground px-3 py-1.5 text-sm font-semibold shadow-hard-sm disabled:opacity-50";
const BTN_OUTLINE =
  "inline-flex items-center gap-1.5 rounded-lg border-2 border-foreground bg-card px-3 py-1.5 text-sm font-semibold hover:bg-muted disabled:opacity-50";

export function EmploymentContractsManager({
  templates,
  contracts,
  employees,
  businessUnits,
  rolesByBu,
  employerSignatures,
}: {
  templates: EmploymentContractTemplate[];
  contracts: ContractListRow[];
  employees: ContractEmployee[];
  businessUnits: string[];
  /** Daftar jabatan per business unit (untuk dropdown Jabatan). */
  rolesByBu: Record<string, string[]>;
  employerSignatures: Record<string, EmployerSignatureStatus>;
}) {
  const [tab, setTab] = useState<"templates" | "contracts" | "archive">("contracts");
  // Arsip = disembunyikan dari daftar utama, TIDAK dihapus.
  const activeContracts = useMemo(() => contracts.filter((c) => !c.archived_at), [contracts]);
  const archivedContracts = useMemo(() => contracts.filter((c) => !!c.archived_at), [contracts]);
  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-border">
        {[
          { id: "contracts", label: "Kontrak Karyawan" },
          { id: "templates", label: "Template per BU" },
          {
            id: "archive",
            label: archivedContracts.length > 0 ? `Arsip (${archivedContracts.length})` : "Arsip",
          },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as typeof tab)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "templates" ? (
        <TemplatesTab
          templates={templates}
          businessUnits={businessUnits}
          employerSignatures={employerSignatures}
        />
      ) : tab === "archive" ? (
        <ContractsTab
          archivedView
          templates={templates}
          rolesByBu={rolesByBu}
          contracts={archivedContracts}
          employees={employees}
          businessUnits={businessUnits}
          employerSignatures={employerSignatures}
        />
      ) : (
        <ContractsTab
          templates={templates}
          rolesByBu={rolesByBu}
          contracts={activeContracts}
          employees={employees}
          businessUnits={businessUnits}
          employerSignatures={employerSignatures}
        />
      )}
    </div>
  );
}

// ── Templates tab ─────────────────────────────────────────────────────

/**
 * Kunci urut nomor surat: tahun → nomor urut → teks lengkap (pembeda awalan
 * antar business unit, mis. /PK/YS/ vs /PK/HC/). Nomor tak terbaca / kosong
 * selalu di paling akhir, baik naik maupun turun.
 */
function nomorSortKey(c: ContractListRow): { year: number; seq: number; text: string } | null {
  const text = contractNomorSurat(c);
  if (!text) return null;
  const seq = /\d+/.exec(text);
  const years = text.match(/\b(19|20)\d{2}\b/g);
  return {
    year: years ? Number(years[years.length - 1]) : 0,
    seq: seq ? Number(seq[0]) : 0,
    text,
  };
}

function compareNomor(a: ContractListRow, b: ContractListRow, dir: 1 | -1): number {
  const ka = nomorSortKey(a);
  const kb = nomorSortKey(b);
  if (!ka && !kb) return 0;
  if (!ka) return 1; // kosong selalu di bawah
  if (!kb) return -1;
  const d = ka.year - kb.year || ka.seq - kb.seq || ka.text.localeCompare(kb.text, "id");
  return d * dir;
}

function SignatureChip({ status }: { status: EmployerSignatureStatus | undefined }) {
  const filled = !!status && status.source !== "none";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
        filled
          ? "border-emerald-600/40 bg-emerald-50 text-emerald-800"
          : "border-destructive/40 bg-destructive/10 text-destructive"
      }`}
    >
      {filled ? "✓ Terisi" : "Belum ada"}
      {filled && (
        <span className="font-normal opacity-80">
          · {status!.source === "upload" ? "diunggah" : "bawaan sistem"}
        </span>
      )}
    </span>
  );
}

function TemplatesTab({
  templates,
  businessUnits,
  employerSignatures,
}: {
  templates: EmploymentContractTemplate[];
  businessUnits: string[];
  employerSignatures: Record<string, EmployerSignatureStatus>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [bu, setBu] = useState(businessUnits[0] ?? "Yeobo Space");
  const existing = useMemo(
    () => templates.find((t) => t.business_unit === bu) ?? null,
    [templates, bu]
  );
  const [title, setTitle] = useState("");
  const [kota, setKota] = useState("");
  const [body, setBody] = useState("");
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Sync form ke template terpilih saat BU berubah.
  if (loadedFor !== bu) {
    setLoadedFor(bu);
    setTitle(existing?.title ?? "Perjanjian Kerja");
    setKota(existing?.kota ?? "");
    setBody(existing?.body_markdown ?? "");
  }

  const save = () => {
    startTransition(async () => {
      const res = await upsertContractTemplate({
        businessUnit: bu,
        title,
        bodyMarkdown: body,
        kota,
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Template disimpan");
      router.refresh();
    });
  };

  const saveSignature = (blob: Blob | null) => {
    if (!blob || !existing) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.append("file", blob, "ttd.png");
      fd.append("kind", "employer");
      fd.append("id", existing.id);
      const up = await fetch("/api/employment-contracts/upload", {
        method: "POST",
        body: fd,
      });
      const j = await up.json();
      if (!up.ok) return void toast.error(j.error ?? "Gagal upload");
      const res = await setTemplateEmployerSignature(bu, j.path);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Tanda tangan Pemberi Kerja disimpan");
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm font-medium">Business Unit:</label>
        <select value={bu} onChange={(e) => setBu(e.target.value)} className={`${INPUT} w-auto`}>
          {businessUnits.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        {!existing && (
          <span className="text-xs text-muted-foreground">
            Belum ada template — isi lalu simpan.
          </span>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Judul">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT} />
        </Field>
        <Field label="Kota">
          <input value={kota} onChange={(e) => setKota(e.target.value)} className={INPUT} placeholder="mis. Semarang" />
        </Field>
      </div>

      <div className="rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
        <strong className="text-foreground">Pemberi Kerja (otomatis):</strong>{" "}
        {EMPLOYER.name} · {EMPLOYER.jabatan} · {EMPLOYER.alamat}
      </div>

      <Field label="Badan kontrak (markdown, placeholder {token})">
        <div className="flex justify-end mb-1">
          <button
            type="button"
            onClick={() => setBody(YEOBO_SPACE_CONTRACT_BODY)}
            className="text-xs text-primary hover:underline"
          >
            Isi dari contoh Yeobo Space
          </button>
          <span className="mx-2 text-xs text-muted-foreground">·</span>
          <button
            type="button"
            onClick={() => {
              setBody(HAENGBOCAKE_CONTRACT_BODY);
              setTitle("Perjanjian Kerja Waktu Tidak Tertentu");
            }}
            className="text-xs text-primary hover:underline"
          >
            Isi dari contoh Haengbocake (PKWTT)
          </button>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={16}
          className={`${INPUT} font-mono text-xs leading-relaxed`}
          placeholder="Tempel badan kontrak di sini. Placeholder pakai {nama}, {jabatan}, {gaji_nominal}, dst."
        />
      </Field>

      <div className="flex items-center gap-2">
        <button onClick={save} disabled={pending} className={BTN_PRIMARY}>
          Simpan template
        </button>
      </div>

      {existing && (
        <div className="rounded-xl border-2 border-foreground bg-card p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-sm">
              Tanda tangan Pemberi Kerja (dipakai otomatis di semua kontrak {bu})
            </h3>
            <SignatureChip status={employerSignatures[bu]} />
          </div>
          {employerSignatures[bu]?.previewUrl && (
            <div className="inline-block rounded-lg border border-border bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={employerSignatures[bu].previewUrl!}
                alt="Tanda tangan Pemberi Kerja saat ini"
                className="max-h-28 w-auto"
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {employerSignatures[bu]?.source === "upload"
              ? "Memakai tanda tangan yang diunggah lewat panel ini."
              : employerSignatures[bu]?.source === "bundled"
                ? `Memakai file tanda tangan bawaan sistem — sudah tampil di PDF semua kontrak ${bu}.`
                : "Belum ada tanda tangan — bagian Pemberi Kerja di PDF kontrak akan kosong."}
          </p>
          <details open={!employerSignatures[bu] || employerSignatures[bu].source === "none"}>
            <summary className="cursor-pointer text-xs font-semibold text-primary">
              {employerSignatures[bu] && employerSignatures[bu].source !== "none"
                ? "Ganti tanda tangan"
                : "Bubuhkan tanda tangan"}
            </summary>
            <div className="mt-2 max-w-md space-y-1">
              <p className="text-[11px] text-muted-foreground">
                Berlaku untuk kontrak yang diterbitkan setelah ini. PDF kontrak yang
                sudah ditandatangani karyawan tidak berubah.
              </p>
              <SignaturePad onBlob={saveSignature} disabled={pending} />
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

// ── Contracts tab ─────────────────────────────────────────────────────

function ContractsTab({
  templates,
  rolesByBu,
  contracts,
  employees,
  businessUnits,
  employerSignatures,
  archivedView = false,
}: {
  templates: EmploymentContractTemplate[];
  rolesByBu: Record<string, string[]>;
  contracts: ContractListRow[];
  employees: ContractEmployee[];
  businessUnits: string[];
  employerSignatures: Record<string, EmployerSignatureStatus>;
  /** true = tab Arsip: hanya baca + Kembalikan, tanpa penerbitan/edit. */
  archivedView?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [issuing, setIssuing] = useState(false);
  // Urut menurut nomor surat; naik = terkecil dulu. Header "No. Surat" membaliknya.
  const [nomorDir, setNomorDir] = useState<1 | -1>(1);
  const sortedContracts = useMemo(
    () => [...contracts].sort((a, b) => compareNomor(a, b, nomorDir)),
    [contracts, nomorDir]
  );
  const [batching, setBatching] = useState(false);
  const [editing, setEditing] = useState<ContractListRow | null>(null);
  const [duplicating, setDuplicating] = useState<ContractListRow | null>(null);
  const [revising, setRevising] = useState<ContractListRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Foto KTP dibuka di tab baru lewat signed URL berumur pendek. Tab dibuka
  // lebih dulu (sinkron dengan klik) supaya tidak diblokir popup blocker.
  const viewKtp = async (id: string) => {
    const tab = window.open("about:blank", "_blank");
    setBusy(id);
    const res = await getContractKtpUrl(id);
    setBusy(null);
    if (!res.ok || !res.data) {
      tab?.close();
      return void toast.error(res.ok ? "Gagal" : res.error);
    }
    if (tab) {
      tab.opener = null;
      tab.location.href = res.data.url;
    } else {
      toast.error("Pop-up diblokir browser");
    }
  };

  const preview = async (id: string) => {
    setBusy(id);
    const res = await getContractRenderData(id);
    setBusy(null);
    if (!res.ok || !res.data) return void toast.error(res.ok ? "Gagal" : res.error);
    await previewContractPdf(res.data);
  };

  const download = async (row: ContractListRow) => {
    // Render fresh dari data (tanda tangan Pemberi Kerja + format terbaru
    // selalu ikut), bukan PDF beku lama.
    setBusy(row.id);
    const res = await getContractRenderData(row.id);
    setBusy(null);
    if (!res.ok || !res.data) return void toast.error(res.ok ? "Gagal" : res.error);
    await downloadContractPdf(res.data);
  };

  const terminate = (id: string) =>
    startTransition(async () => {
      if (!confirm("Akhiri kontrak ini?")) return;
      const res = await updateEmploymentContract(id, { status: "terminated" });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Kontrak diakhiri");
      router.refresh();
    });

  const archive = (c: ContractListRow, archived: boolean) =>
    startTransition(async () => {
      // Kontrak yang masih menunggu tanda tangan karyawan hilang dari pantauan
      // daftar utama bila diarsipkan — pastikan memang disengaja.
      if (
        archived &&
        contractNeedsSignature(c) &&
        !confirm(
          `Kontrak ${c.employee_name} masih menunggu tanda tangan karyawan. Tetap diarsipkan? (Karyawan tetap bisa menandatangani; Anda bisa mengembalikannya dari tab Arsip.)`
        )
      )
        return;
      const res = await setEmploymentContractArchived(c.id, archived);
      if (!res.ok) return void toast.error(res.error);
      toast.success(
        archived
          ? `Kontrak ${c.employee_name} dipindahkan ke Arsip`
          : `Kontrak ${c.employee_name} dikembalikan ke daftar utama`
      );
      router.refresh();
    });

  const remove = (id: string) =>
    startTransition(async () => {
      if (!confirm("Hapus kontrak ini permanen?")) return;
      const res = await deleteEmploymentContract(id);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Dihapus");
      router.refresh();
    });

  return (
    <div className="space-y-3">
      {archivedView && (
        <p className="text-xs text-muted-foreground">
          Kontrak di sini hanya disembunyikan dari daftar utama — tidak dihapus, dan
          karyawan tetap bisa melihat kontraknya. Tekan Kembalikan untuk memunculkannya lagi.
        </p>
      )}
      {!archivedView && (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">TTD Pemberi Kerja:</span>
          {Array.from(new Set(contracts.map((c) => c.business_unit))).map((b) => (
            <span key={b} className="inline-flex items-center gap-1.5">
              {b}
              <SignatureChip status={employerSignatures[b]} />
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setBatching(true)} className={BTN_OUTLINE}>
            <Users size={15} /> Terbitkan massal
          </button>
          <button onClick={() => setIssuing(true)} className={BTN_PRIMARY}>
            <Plus size={15} /> Terbitkan kontrak
          </button>
        </div>
      </div>
      )}

      {contracts.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {archivedView ? <Archive className="mx-auto mb-2" size={24} /> : <FileText className="mx-auto mb-2" size={24} />}
          {archivedView ? "Belum ada kontrak yang diarsipkan." : "Belum ada kontrak diterbitkan."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border-2 border-foreground">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th
                  className="px-3 py-2 font-semibold whitespace-nowrap"
                  aria-sort={nomorDir === 1 ? "ascending" : "descending"}
                >
                  <button
                    type="button"
                    onClick={() => setNomorDir((d) => (d === 1 ? -1 : 1))}
                    className="inline-flex items-center gap-1 font-semibold hover:text-primary"
                    title={nomorDir === 1 ? "Terkecil dulu — klik untuk terbaru dulu" : "Terbaru dulu — klik untuk terkecil dulu"}
                  >
                    No. Surat
                    {nomorDir === 1 ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
                  </button>
                </th>
                <th className="px-3 py-2 font-semibold">Karyawan</th>
                <th className="px-3 py-2 font-semibold">Business Unit</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Ditandatangani</th>
                <th className="px-3 py-2 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {sortedContracts.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-3 py-2 whitespace-nowrap font-mono text-[13px] tabular-nums">
                    {contractNomorSurat(c) ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-medium">{c.employee_name}</td>
                  <td className="px-3 py-2">{c.business_unit}</td>
                  <td className="px-3 py-2">
                    <StatusBadge contract={c} />
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {c.employee_signed_at
                      ? new Date(c.employee_signed_at).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <IconBtn title="Preview PDF" onClick={() => preview(c.id)} disabled={busy === c.id}>
                        <Eye size={15} />
                      </IconBtn>
                      <IconBtn title="Unduh PDF" onClick={() => download(c)} disabled={busy === c.id}>
                        <Download size={15} />
                      </IconBtn>
                      {c.ktp_photo_path && (
                        <IconBtn title="Lihat foto KTP" onClick={() => viewKtp(c.id)} disabled={busy === c.id}>
                          <IdCard size={15} />
                        </IconBtn>
                      )}
                      {archivedView ? (
                        <IconBtn
                          title="Kembalikan ke daftar utama"
                          onClick={() => archive(c, false)}
                          disabled={pending}
                        >
                          <ArchiveRestore size={15} />
                        </IconBtn>
                      ) : (
                        <>
                          <IconBtn
                            title="Duplikat ke karyawan lain"
                            onClick={() => setDuplicating(c)}
                          >
                            <Copy size={15} />
                          </IconBtn>
                          {c.status !== "signed" && (
                            <IconBtn title="Edit isian" onClick={() => setEditing(c)}>
                              <Pencil size={15} />
                            </IconBtn>
                          )}
                          {(c.status === "signed" || c.status === "pending_signature") && (
                            <IconBtn
                              title="Terbitkan revisi (karyawan diminta tanda tangan ulang)"
                              onClick={() => setRevising(c)}
                            >
                              <RefreshCw size={15} />
                            </IconBtn>
                          )}
                          {c.status === "pending_signature" && (
                            <IconBtn title="Akhiri" onClick={() => terminate(c.id)} disabled={pending}>
                              <Ban size={15} />
                            </IconBtn>
                          )}
                          <IconBtn
                            title="Arsipkan (sembunyikan, tidak dihapus)"
                            onClick={() => archive(c, true)}
                            disabled={pending}
                          >
                            <Archive size={15} />
                          </IconBtn>
                        </>
                      )}
                      <IconBtn title="Hapus" onClick={() => remove(c.id)} disabled={pending} danger>
                        <Trash2 size={15} />
                      </IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {issuing && (
        <ContractFormModal
          mode="issue"
          employees={employees}
          templates={templates}
          rolesByBu={rolesByBu}
          onClose={() => setIssuing(false)}
        />
      )}
      {editing && (
        <ContractFormModal
          mode="edit"
          contract={editing}
          templates={templates}
          rolesByBu={rolesByBu}
          onClose={() => setEditing(null)}
        />
      )}
      {batching && (
        <BatchIssueModal
          employees={employees}
          businessUnits={businessUnits}
          templates={templates}
          rolesByBu={rolesByBu}
          onClose={() => setBatching(false)}
        />
      )}
      {revising && (
        <ReviseContractModal
          contract={revising}
          onClose={() => setRevising(null)}
        />
      )}
      {duplicating && (
        <ContractFormModal
          mode="issue"
          employees={employees}
          templates={templates}
          rolesByBu={rolesByBu}
          seed={{
            // Salin isian sumber (nomor + identitas dikosongkan; nomor
            // di-isi ulang otomatis — preview saat modal terbuka).
            businessUnit: duplicating.business_unit,
            fields: {
              ...duplicating.fields,
              nomor: "",
              nama: "",
              nik: "",
              tempat_lahir: "",
              tgl_lahir: "",
              alamat: "",
            },
            lampiran: duplicating.lampiran ?? emptyLampiran(),
          }}
          onClose={() => setDuplicating(null)}
        />
      )}
    </div>
  );
}

function StatusBadge({
  contract,
}: {
  contract: {
    status: EmploymentContractStatus;
    version?: number | null;
    signed_version?: number | null;
  };
}) {
  // "Perlu TTD ulang" = sudah TTD versi lama, ada revisi baru (update_required).
  if (contractSignState(contract) === "update_required") {
    return (
      <span className="inline-block rounded-full border border-foreground bg-warning/50 px-2 py-0.5 text-[11px] font-medium text-foreground">
        Perlu TTD ulang
      </span>
    );
  }
  const status = contract.status;
  const cls: Record<EmploymentContractStatus, string> = {
    draft: "bg-muted text-muted-foreground",
    pending_signature: "bg-tertiary/40 text-foreground border-foreground",
    signed: "bg-pop-emerald/25 text-foreground border-foreground",
    terminated: "bg-destructive/15 text-foreground border-foreground",
  };
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls[status]}`}>
      {CONTRACT_STATUS_LABELS[status]}
    </span>
  );
}

// ── Issue / edit modal ────────────────────────────────────────────────

/**
 * Dropdown dengan opsi "Lainnya…" untuk mengetik sendiri. Nilai di luar daftar
 * (mis. jabatan gabungan dari profil, "Baker & Kepala Produksi") otomatis
 * tampil sebagai isian teks agar tidak hilang.
 */
function SelectOrText({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const opts = Array.from(new Set(options.map((o) => o.trim()).filter(Boolean)));
  const [custom, setCustom] = useState(false);
  const showText = custom || (value.trim() !== "" && !opts.includes(value));
  return (
    <div className="space-y-1">
      <select
        value={showText ? "__custom" : value}
        onChange={(e) => {
          if (e.target.value === "__custom") {
            setCustom(true);
            return;
          }
          setCustom(false);
          onChange(e.target.value);
        }}
        className={INPUT}
      >
        <option value="">— pilih —</option>
        {opts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value="__custom">Lainnya (ketik sendiri)…</option>
      </select>
      {showText && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={INPUT}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}

function ContractFormModal({
  mode,
  employees,
  templates,
  rolesByBu,
  contract,
  seed,
  onClose,
}: {
  mode: "issue" | "edit";
  employees?: ContractEmployee[];
  templates: EmploymentContractTemplate[];
  rolesByBu: Record<string, string[]>;
  contract?: ContractListRow;
  /** Saat duplikat: pra-isi fields + lampiran dari kontrak sumber. */
  seed?: {
    businessUnit: string;
    fields: ContractFields;
    lampiran: ContractLampiran;
  };
  onClose: () => void;
}) {
  const router = useRouter();
  const isDuplicate = mode === "issue" && !!seed;
  const [pending, startTransition] = useTransition();
  const [userId, setUserId] = useState(contract?.user_id ?? "");
  const [fields, setFields] = useState<ContractFields>(
    contract?.fields ?? seed?.fields ?? {}
  );
  const [lampiran, setLampiran] = useState<ContractLampiran>(
    contract?.lampiran ?? seed?.lampiran ?? emptyLampiran()
  );
  // Edit + duplikat: form langsung tampil (isian sudah ada).
  const [loaded, setLoaded] = useState(mode === "edit" || isDuplicate);
  // Edit/duplikat: template pasti ada (kontrak sumber sudah pakai template).
  const [hasTemplate, setHasTemplate] = useState(mode === "edit" || isDuplicate);
  const [pickedBu, setPickedBu] = useState("");

  // Duplikat: langsung isi nomor urut berikutnya + segarkan tanggal ke hari
  // ini (kontrak sumber menyalin tanggal/nomor lama).
  useEffect(() => {
    if (!isDuplicate || !seed) return;
    const now = new Date();
    const wib = (opt: Intl.DateTimeFormatOptions) =>
      now.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", ...opt });
    const tahun = now.toLocaleDateString("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
    });
    setFields((prev) => ({
      ...prev,
      hari: wib({ weekday: "long" }),
      tanggal: wib({ day: "numeric" }),
      bulan: wib({ month: "long" }),
      tahun,
    }));
    getNextContractNumber(seed.businessUnit).then((n) => {
      if (n) setFields((prev) => ({ ...prev, nomor: n }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPickEmployee = (id: string) => {
    setUserId(id);
    if (!id) {
      if (!isDuplicate) setLoaded(false);
      return;
    }
    startTransition(async () => {
      const res = await prefillContractFields(id);
      if (!res.ok || !res.data) return void toast.error(res.ok ? "Gagal" : res.error);
      if (isDuplicate) {
        // Pertahankan isian yang sudah disalin (jabatan, lampiran, dll.);
        // segarkan kolom spesifik karyawan + nomor/tanggal dari prefill
        // (mengikuti BU karyawan yang dipilih).
        setFields((prev) => ({
          ...prev,
          nomor: res.data!.fields.nomor ?? prev.nomor ?? "",
          hari: res.data!.fields.hari ?? prev.hari ?? "",
          tanggal: res.data!.fields.tanggal ?? prev.tanggal ?? "",
          bulan: res.data!.fields.bulan ?? prev.bulan ?? "",
          tahun: res.data!.fields.tahun ?? prev.tahun ?? "",
          cabang: res.data!.fields.cabang ?? prev.cabang ?? "",
          gaji_nominal: res.data!.fields.gaji_nominal ?? prev.gaji_nominal ?? "",
          gaji_terbilang:
            res.data!.fields.gaji_terbilang ?? prev.gaji_terbilang ?? "",
        }));
      } else {
        setFields(res.data.fields);
        setLampiran(res.data.lampiran);
      }
      setHasTemplate(res.data.hasTemplate);
      setPickedBu(res.data.businessUnit);
      setLoaded(true);
    });
  };

  const submit = () => {
    startTransition(async () => {
      if (mode === "issue") {
        if (!userId) return void toast.error("Pilih karyawan");
        const res = await issueEmploymentContract({
          userId,
          fields,
          lampiran,
          contractNumber: fields.nomor ?? null,
          notifyWhatsApp: true,
        });
        if (!res.ok) return void toast.error(res.error);
        toast.success("Kontrak diterbitkan & karyawan dinotifikasi");
      } else {
        const res = await updateEmploymentContract(contract!.id, {
          fields,
          lampiran,
          contractNumber: fields.nomor ?? null,
        });
        if (!res.ok) return void toast.error(res.error);
        toast.success("Kontrak diperbarui");
      }
      router.refresh();
      onClose();
    });
  };

  // Unit bisnis kontrak ini: dari karyawan yang dipilih / kontrak yang diedit.
  const formBu = pickedBu || contract?.business_unit || seed?.businessUnit || "";
  // Tanggal berakhir hanya relevan untuk template berjangka (PKWT) yang
  // memakai {tgl_berakhir}; PKWTT (Haengbocake) menyembunyikannya.
  const needsEndDate = (
    templates.find((t) => t.business_unit === formBu)?.body_markdown ?? ""
  ).includes("{tgl_berakhir}");

  const groups = useMemo(() => {
    const m = new Map<string, typeof CONTRACT_FIELD_DEFS>();
    for (const d of CONTRACT_FIELD_DEFS) {
      if (d.key === "tgl_berakhir" && !needsEndDate) continue;
      const arr = m.get(d.group) ?? [];
      arr.push(d);
      m.set(d.group, arr);
    }
    return Array.from(m.entries());
  }, [needsEndDate]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4">
      <div className="w-full max-w-3xl rounded-2xl border-2 border-foreground bg-card shadow-hard my-8">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="font-display font-bold">
            {isDuplicate
              ? "Duplikat kontrak — pilih karyawan tujuan"
              : mode === "issue"
                ? "Terbitkan kontrak"
                : `Edit kontrak — ${contract?.employee_name}`}
          </h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-muted">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {mode === "issue" && (
            <Field label="Karyawan">
              <select
                value={userId}
                onChange={(e) => onPickEmployee(e.target.value)}
                className={INPUT}
              >
                <option value="">— pilih karyawan —</option>
                {employees!.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name}
                    {e.business_unit ? ` · ${e.business_unit}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {loaded && mode === "issue" && !hasTemplate && (
            <div className="rounded-xl border-2 border-foreground bg-warning/40 px-3 py-2.5 text-sm">
              <strong>Belum ada template untuk &quot;{pickedBu || "BU ini"}&quot;.</strong>{" "}
              Buat dulu di tab <strong>Template per BU</strong> (badan kontrak +
              data &amp; tanda tangan Pemberi Kerja) sebelum menerbitkan kontrak.
            </div>
          )}

          {loaded && (
            <>
              {groups.map(([group, defs]) => (
                <div key={group} className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {group}
                  </h4>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {defs.map((d) => {
                      // Nominal gaji: input digit polos (tanpa titik) + terbilang
                      // ikut otomatis — sama seperti form batch. Pemformatan
                      // "Rp 3.701.709" dilakukan server saat terbit.
                      if (d.key === "gaji_nominal") {
                        const digits = (fields.gaji_nominal ?? "").replace(
                          /[^\d]/g,
                          ""
                        );
                        return (
                          <Field key={d.key} label="Nominal gaji (angka, tanpa titik)">
                            <input
                              inputMode="numeric"
                              value={digits}
                              onChange={(e) => {
                                const v = e.target.value.replace(/[^\d]/g, "");
                                setFields((f) => ({
                                  ...f,
                                  gaji_nominal: v,
                                  gaji_terbilang: v ? terbilang(v) : "",
                                }));
                              }}
                              className={INPUT}
                            />
                            {digits && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                Rp {Number(digits).toLocaleString("id-ID")} ·{" "}
                                {terbilang(digits)} rupiah
                              </p>
                            )}
                          </Field>
                        );
                      }
                      // Terbilang: read-only, selalu sinkron dengan nominal.
                      if (d.key === "gaji_terbilang") {
                        return (
                          <Field key={d.key} label="Terbilang (otomatis)">
                            <input
                              value={fields.gaji_terbilang ?? ""}
                              readOnly
                              className={`${INPUT} bg-muted/40 text-muted-foreground`}
                            />
                          </Field>
                        );
                      }
                      // Jabatan & cabang: dropdown (terisi otomatis dari profil /
                      // lokasi absen, bisa diganti).
                      if (d.key === "jabatan" || d.key === "cabang") {
                        return (
                          <Field key={d.key} label={d.label}>
                            <SelectOrText
                              value={fields[d.key] ?? ""}
                              onChange={(v) =>
                                setFields((f) => ({ ...f, [d.key]: v }))
                              }
                              options={
                                d.key === "jabatan"
                                  ? (rolesByBu[formBu] ?? [])
                                  : (BRANCH_OPTIONS[formBu] ?? [])
                              }
                              placeholder={
                                d.key === "jabatan" ? "Ketik jabatan" : "Ketik cabang"
                              }
                            />
                          </Field>
                        );
                      }
                      return (
                        <Field key={d.key} label={d.label}>
                          <input
                            value={fields[d.key] ?? ""}
                            onChange={(e) =>
                              setFields((f) => ({ ...f, [d.key]: e.target.value }))
                            }
                            className={INPUT}
                          />
                        </Field>
                      );
                    })}
                  </div>
                </div>
              ))}

              <details className="space-y-3 border-t border-border pt-3">
                <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Lampiran 1 — Deskripsi Pekerjaan (opsional; kosongkan bila kontrak tanpa lampiran)
                </summary>
                <ListEditor
                  label="B. Tujuan Posisi"
                  items={lampiran.tujuan}
                  onChange={(v) => setLampiran((l) => ({ ...l, tujuan: v }))}
                />
                <ListEditor
                  label="C. Tanggung Jawab Utama"
                  items={lampiran.tanggung_jawab}
                  onChange={(v) => setLampiran((l) => ({ ...l, tanggung_jawab: v }))}
                />
                <ListEditor
                  label="D. SOP yang Relevan"
                  items={lampiran.sop}
                  onChange={(v) => setLampiran((l) => ({ ...l, sop: v }))}
                />
                <ListEditor
                  label="E. Indikator Kinerja (KPI)"
                  items={lampiran.kpi}
                  onChange={(v) => setLampiran((l) => ({ ...l, kpi: v }))}
                />
                <ListEditor
                  label="F. Waktu Kerja / Shift"
                  items={lampiran.shift}
                  onChange={(v) => setLampiran((l) => ({ ...l, shift: v }))}
                />
              </details>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button onClick={onClose} className={BTN_OUTLINE}>
            Batal
          </button>
          <button
            onClick={submit}
            disabled={pending || !loaded || (mode === "issue" && !hasTemplate)}
            className={BTN_PRIMARY}
          >
            {mode === "issue" ? (
              <>
                <Send size={15} /> Terbitkan
              </>
            ) : (
              "Simpan"
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Revise modal ──────────────────────────────────────────────────────

/**
 * Terbitkan revisi: menaikkan versi kontrak sehingga karyawan yang sudah
 * menandatangani diminta tanda tangan ulang, dengan ringkasan perubahan yang
 * ia baca di halaman Kontrak. Opsi "muat ulang isi dari template" mengganti
 * badan kontrak dengan template BU saat ini (isian karyawan tetap).
 */
function ReviseContractModal({
  contract,
  onClose,
}: {
  contract: ContractListRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [refresh, setRefresh] = useState(true);
  const [notify, setNotify] = useState(true);
  const nextVersion = (contract.version ?? 1) + 1;

  const submit = () => {
    if (!note.trim()) return void toast.error("Tulis ringkasan perubahan");
    startTransition(async () => {
      const res = await reviseEmploymentContract({
        id: contract.id,
        note,
        refreshFromTemplate: refresh,
        notify,
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Revisi v${res.data?.version ?? nextVersion} diterbitkan`);
      router.refresh();
      onClose();
    });
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4">
      <div className="w-full max-w-lg rounded-2xl border-2 border-foreground bg-card shadow-hard my-8">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="font-display font-bold">
            Terbitkan revisi — {contract.employee_name}
          </h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-muted">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Versi kontrak naik ke v{nextVersion}.{" "}
            {contract.status === "signed"
              ? "Karyawan akan diminta menandatangani ulang; foto KTP yang sudah tersimpan dipakai kembali."
              : "Kontrak masih menunggu tanda tangan, jadi karyawan langsung membaca versi terbaru."}
          </p>
          <Field label="Ringkasan perubahan (dibaca karyawan)">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className={INPUT}
              placeholder="mis. Pasal 5 ayat 7 ditambah: ketentuan THR"
            />
          </Field>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={refresh}
              onChange={(e) => setRefresh(e.target.checked)}
              className="mt-0.5 size-4 accent-primary"
            />
            <span>
              Ganti isi kontrak dengan template {contract.business_unit} saat
              ini (isian karyawan tidak berubah)
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
              className="mt-0.5 size-4 accent-primary"
            />
            <span>Kirim notifikasi ke karyawan</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button onClick={onClose} className={BTN_OUTLINE}>
            Batal
          </button>
          <button onClick={submit} disabled={pending} className={BTN_PRIMARY}>
            <RefreshCw size={15} /> Terbitkan revisi
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Batch issue modal ─────────────────────────────────────────────────

interface BatchCommon {
  jabatan: string;
  tgl_mulai: string;
  kota: string;
  komponen_upah: string;
  periode_bayar: string;
  cara_bayar: string;
}

function BatchIssueModal({
  employees,
  businessUnits,
  templates,
  rolesByBu,
  onClose,
}: {
  employees: ContractEmployee[];
  businessUnits: string[];
  templates: EmploymentContractTemplate[];
  rolesByBu: Record<string, string[]>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [bu, setBu] = useState(
    businessUnits.find((b) => b === "Yeobo Space") ?? businessUnits[0] ?? ""
  );
  // Tanggal berakhir hanya relevan untuk template berjangka (PKWT) yang
  // memakai {tgl_berakhir}; template PKWTT (Haengbocake) tidak memakainya.
  const needsEndDate = useMemo(
    () =>
      (templates.find((t) => t.business_unit === bu)?.body_markdown ?? "").includes(
        "{tgl_berakhir}"
      ),
    [templates, bu]
  );
  const [common, setCommon] = useState<BatchCommon>({
    jabatan: "",
    tgl_mulai: "",
    kota: "",
    komponen_upah: "gaji pokok",
    periode_bayar: "bulanan",
    cara_bayar: "transfer ke rekening Karyawan",
  });
  const [rows, setRows] = useState<BulkContractRow[]>([
    { userId: "", cabang: "", gaji: "", tglBerakhir: "", shift: "" },
  ]);
  // Lampiran 1 (jobdesc) bersama untuk semua kontrak di batch ini.
  const [lampiran, setLampiran] = useState<ContractLampiran>(emptyLampiran());

  const setRow = (i: number, patch: Partial<BulkContractRow>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const onPickEmployee = (i: number, userId: string) => {
    setRow(i, { userId });
    if (!userId) return;
    startTransition(async () => {
      const res = await prefillContractFields(userId);
      if (res.ok && res.data) {
        setRow(i, {
          cabang: res.data.fields.cabang ?? "",
          gaji: (res.data.fields.gaji_nominal ?? "").replace(/[^\d]/g, ""),
        });
      }
    });
  };

  const submit = () => {
    const valid = rows.filter((r) => r.userId);
    if (valid.length === 0) return void toast.error("Pilih minimal satu karyawan");
    for (const r of valid) {
      if (!r.cabang.trim() || !r.gaji.trim() || (needsEndDate && !r.tglBerakhir.trim()))
        return void toast.error(
          needsEndDate
            ? "Lengkapi cabang, gaji, dan tanggal berakhir untuk setiap baris"
            : "Lengkapi cabang dan gaji untuk setiap baris"
        );
    }
    startTransition(async () => {
      const res = await bulkIssueEmploymentContracts({
        businessUnit: bu,
        common,
        lampiran,
        rows: valid,
        notifyWhatsApp: true,
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success(`${res.data?.issued ?? valid.length} kontrak diterbitkan`);
      router.refresh();
      onClose();
    });
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4">
      <div className="w-full max-w-4xl rounded-2xl border-2 border-foreground bg-card shadow-hard my-8">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="font-display font-bold">Terbitkan kontrak massal</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-muted">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-4 max-h-[72vh] overflow-y-auto">
          <p className="text-xs text-muted-foreground">
            Nomor kontrak otomatis berurutan. Yang berbeda tiap karyawan: cabang,
            gaji (terbilang otomatis){needsEndDate ? ", tanggal berakhir" : ""}.
            Sisanya di bawah ini berlaku untuk semua. Identitas pribadi dan foto
            KTP diisi karyawan saat menandatangani.
          </p>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Business Unit:</label>
            <select
              value={bu}
              onChange={(e) => setBu(e.target.value)}
              className={`${INPUT} w-auto`}
            >
              {businessUnits.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
              Data umum (sama untuk semua)
            </h4>
            <div className="grid sm:grid-cols-2 gap-2">
              <Field label="Jabatan/posisi (kosong = jabatan di profil masing-masing)">
                <SelectOrText
                  value={common.jabatan}
                  onChange={(v) => setCommon((c) => ({ ...c, jabatan: v }))}
                  options={rolesByBu[bu] ?? []}
                  placeholder="Ketik jabatan"
                />
              </Field>
              <Field label="Tanggal mulai (kosong = tanggal mulai kerja di akun masing-masing)">
                <input
                  value={common.tgl_mulai}
                  onChange={(e) => setCommon((c) => ({ ...c, tgl_mulai: e.target.value }))}
                  className={INPUT}
                  placeholder="kosong = ikut akun, atau mis. 1 Juli 2026"
                />
              </Field>
              <Field label="Kota (kosong = ikut template)">
                <input
                  value={common.kota}
                  onChange={(e) => setCommon((c) => ({ ...c, kota: e.target.value }))}
                  className={INPUT}
                />
              </Field>
              <Field label="Komponen upah">
                <input
                  value={common.komponen_upah}
                  onChange={(e) => setCommon((c) => ({ ...c, komponen_upah: e.target.value }))}
                  className={INPUT}
                />
              </Field>
              <Field label="Periode bayar">
                <input
                  value={common.periode_bayar}
                  onChange={(e) => setCommon((c) => ({ ...c, periode_bayar: e.target.value }))}
                  className={INPUT}
                />
              </Field>
              <Field label="Cara bayar">
                <input
                  value={common.cara_bayar}
                  onChange={(e) => setCommon((c) => ({ ...c, cara_bayar: e.target.value }))}
                  className={INPUT}
                />
              </Field>
            </div>
          </div>

          <details className="space-y-3 border-t border-border pt-3">
            <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Lampiran 1 — Deskripsi Pekerjaan (opsional; kosongkan bila kontrak tanpa lampiran)
            </summary>
            <ListEditor
              label="B. Tujuan Posisi"
              items={lampiran.tujuan}
              onChange={(v) => setLampiran((l) => ({ ...l, tujuan: v }))}
            />
            <ListEditor
              label="C. Tanggung Jawab Utama"
              items={lampiran.tanggung_jawab}
              onChange={(v) => setLampiran((l) => ({ ...l, tanggung_jawab: v }))}
            />
            <ListEditor
              label="D. SOP yang Relevan"
              items={lampiran.sop}
              onChange={(v) => setLampiran((l) => ({ ...l, sop: v }))}
            />
            <ListEditor
              label="E. Indikator Kinerja (KPI)"
              items={lampiran.kpi}
              onChange={(v) => setLampiran((l) => ({ ...l, kpi: v }))}
            />
            <p className="text-[11px] text-muted-foreground">
              F. Waktu Kerja / Shift diisi per karyawan di tabel bawah.
            </p>
          </details>

          <div className="border-t border-border pt-3">
            <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
              Karyawan (berbeda tiap baris)
            </h4>
            <div className="space-y-2">
              {rows.map((r, i) => {
                const tb = terbilang((r.gaji || "").replace(/[^\d]/g, ""));
                return (
                  <div
                    key={i}
                    className="grid grid-cols-[1.3fr_0.9fr_0.9fr_0.9fr_1.1fr_28px] gap-1.5 items-start"
                  >
                    <select
                      value={r.userId}
                      onChange={(e) => onPickEmployee(i, e.target.value)}
                      className={INPUT}
                    >
                      <option value="">— karyawan —</option>
                      {employees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.full_name}
                        </option>
                      ))}
                    </select>
                    <SelectOrText
                      value={r.cabang}
                      onChange={(v) => setRow(i, { cabang: v })}
                      options={BRANCH_OPTIONS[bu] ?? []}
                      placeholder="Cabang"
                    />
                    <div>
                      <input
                        value={r.gaji}
                        onChange={(e) =>
                          setRow(i, { gaji: e.target.value.replace(/[^\d]/g, "") })
                        }
                        className={`${INPUT} tabular-nums`}
                        inputMode="numeric"
                        placeholder="Gaji (Rp)"
                      />
                      {r.gaji && tb && (
                        <span className="block text-[10px] text-muted-foreground mt-0.5 leading-tight">
                          {tb} rupiah
                        </span>
                      )}
                    </div>
                    <input
                      value={r.tglBerakhir}
                      onChange={(e) => setRow(i, { tglBerakhir: e.target.value })}
                      className={INPUT}
                      placeholder={needsEndDate ? "Tgl berakhir" : "Tgl berakhir (tidak dipakai)"}
                      disabled={!needsEndDate}
                    />
                    <input
                      value={r.shift ?? ""}
                      onChange={(e) => setRow(i, { shift: e.target.value })}
                      className={INPUT}
                      placeholder="Shift / waktu kerja"
                    />
                    <button
                      type="button"
                      onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                      disabled={rows.length === 1}
                      className="size-9 rounded-lg border border-border bg-card text-muted-foreground hover:text-destructive disabled:opacity-30 flex items-center justify-center"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() =>
                setRows((rs) => [...rs, { userId: "", cabang: "", gaji: "", tglBerakhir: "", shift: "" }])
              }
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <Plus size={13} /> Tambah karyawan
            </button>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button onClick={onClose} className={BTN_OUTLINE}>
            Batal
          </button>
          <button onClick={submit} disabled={pending} className={BTN_PRIMARY}>
            <Send size={15} /> Terbitkan semua
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ListEditor({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (v: string[]) => void;
}) {
  const set = (i: number, v: string) =>
    onChange(items.map((x, idx) => (idx === i ? v : x)));
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium">{label}</label>
      {items.map((it, i) => (
        <div key={i} className="flex gap-1.5">
          <span className="text-xs text-muted-foreground pt-2 w-5 text-right">
            {i + 1}.
          </span>
          <input value={it} onChange={(e) => set(i, e.target.value)} className={INPUT} />
          <button
            type="button"
            onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            disabled={items.length === 1}
            className="px-2 text-muted-foreground hover:text-destructive disabled:opacity-30"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, ""])}
        className="text-xs text-primary hover:underline ml-6"
      >
        + Tambah
      </button>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block space-y-1 ${className ?? ""}`}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 ${
        danger ? "hover:text-destructive hover:border-destructive" : ""
      }`}
    >
      {children}
    </button>
  );
}
