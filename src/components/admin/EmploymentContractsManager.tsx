"use client";

import { useMemo, useState, useTransition } from "react";
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
} from "lucide-react";
import {
  upsertContractTemplate,
  setTemplateEmployerSignature,
  prefillContractFields,
  issueEmploymentContract,
  updateEmploymentContract,
  deleteEmploymentContract,
  getContractRenderData,
  getContractSignedUrl,
  type ContractListRow,
} from "@/lib/actions/employment-contracts.actions";
import {
  CONTRACT_FIELD_DEFS,
  CONTRACT_STATUS_LABELS,
  emptyLampiran,
  type ContractFields,
  type ContractLampiran,
  type EmploymentContractTemplate,
  type EmploymentContractStatus,
} from "@/lib/employment-contracts/types";
import { YEOBO_SPACE_CONTRACT_BODY } from "@/lib/employment-contracts/default-templates";
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
}: {
  templates: EmploymentContractTemplate[];
  contracts: ContractListRow[];
  employees: ContractEmployee[];
  businessUnits: string[];
}) {
  const [tab, setTab] = useState<"templates" | "contracts">("contracts");
  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-border">
        {[
          { id: "contracts", label: "Kontrak Karyawan" },
          { id: "templates", label: "Template per BU" },
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
        <TemplatesTab templates={templates} businessUnits={businessUnits} />
      ) : (
        <ContractsTab contracts={contracts} employees={employees} />
      )}
    </div>
  );
}

// ── Templates tab ─────────────────────────────────────────────────────

function TemplatesTab({
  templates,
  businessUnits,
}: {
  templates: EmploymentContractTemplate[];
  businessUnits: string[];
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
  const [empName, setEmpName] = useState("");
  const [empJabatan, setEmpJabatan] = useState("");
  const [empAlamat, setEmpAlamat] = useState("");
  const [body, setBody] = useState("");
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Sync form ke template terpilih saat BU berubah.
  if (loadedFor !== bu) {
    setLoadedFor(bu);
    setTitle(existing?.title ?? "Perjanjian Kerja");
    setKota(existing?.kota ?? "");
    setEmpName(existing?.employer_name ?? "");
    setEmpJabatan(existing?.employer_jabatan ?? "");
    setEmpAlamat(existing?.employer_alamat ?? "");
    setBody(existing?.body_markdown ?? "");
  }

  const save = () => {
    startTransition(async () => {
      const res = await upsertContractTemplate({
        businessUnit: bu,
        title,
        bodyMarkdown: body,
        kota,
        employerName: empName,
        employerJabatan: empJabatan,
        employerAlamat: empAlamat,
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
        <Field label="Nama penanggung jawab (Pemberi Kerja)">
          <input value={empName} onChange={(e) => setEmpName(e.target.value)} className={INPUT} />
        </Field>
        <Field label="Jabatan (Pemilik/Direktur)">
          <input value={empJabatan} onChange={(e) => setEmpJabatan(e.target.value)} className={INPUT} />
        </Field>
        <Field label="Alamat usaha" className="sm:col-span-2">
          <input value={empAlamat} onChange={(e) => setEmpAlamat(e.target.value)} className={INPUT} />
        </Field>
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
        <div className="rounded-xl border-2 border-foreground bg-card p-4 space-y-2">
          <h3 className="font-semibold text-sm">
            Tanda tangan Pemberi Kerja (dipakai otomatis di semua kontrak {bu})
          </h3>
          <p className="text-xs text-muted-foreground">
            {existing.employer_signature_path
              ? "Tanda tangan sudah tersimpan ✓. Tanda tangan ulang di bawah untuk mengganti."
              : "Belum ada tanda tangan. Bubuhkan di bawah."}
          </p>
          <div className="max-w-md">
            <SignaturePad onBlob={saveSignature} disabled={pending} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Contracts tab ─────────────────────────────────────────────────────

function ContractsTab({
  contracts,
  employees,
}: {
  contracts: ContractListRow[];
  employees: ContractEmployee[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [issuing, setIssuing] = useState(false);
  const [editing, setEditing] = useState<ContractListRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const preview = async (id: string) => {
    setBusy(id);
    const res = await getContractRenderData(id);
    setBusy(null);
    if (!res.ok || !res.data) return void toast.error(res.ok ? "Gagal" : res.error);
    await previewContractPdf(res.data);
  };

  const download = async (row: ContractListRow) => {
    setBusy(row.id);
    if (row.signed_pdf_path) {
      const res = await getContractSignedUrl(row.id, "pdf");
      setBusy(null);
      if (!res.ok || !res.data) return void toast.error(res.ok ? "Gagal" : res.error);
      window.open(res.data.url, "_blank");
      return;
    }
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
      <div className="flex justify-end">
        <button onClick={() => setIssuing(true)} className={BTN_PRIMARY}>
          <Plus size={15} /> Terbitkan kontrak
        </button>
      </div>

      {contracts.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          <FileText className="mx-auto mb-2" size={24} />
          Belum ada kontrak diterbitkan.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border-2 border-foreground">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-semibold">Karyawan</th>
                <th className="px-3 py-2 font-semibold">Business Unit</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Ditandatangani</th>
                <th className="px-3 py-2 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{c.employee_name}</td>
                  <td className="px-3 py-2">{c.business_unit}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={c.status} />
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
                      {c.status !== "signed" && (
                        <IconBtn title="Edit isian" onClick={() => setEditing(c)}>
                          <Pencil size={15} />
                        </IconBtn>
                      )}
                      {c.status === "pending_signature" && (
                        <IconBtn title="Akhiri" onClick={() => terminate(c.id)} disabled={pending}>
                          <Ban size={15} />
                        </IconBtn>
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
          onClose={() => setIssuing(false)}
        />
      )}
      {editing && (
        <ContractFormModal
          mode="edit"
          contract={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: EmploymentContractStatus }) {
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

function ContractFormModal({
  mode,
  employees,
  contract,
  onClose,
}: {
  mode: "issue" | "edit";
  employees?: ContractEmployee[];
  contract?: ContractListRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [userId, setUserId] = useState(contract?.user_id ?? "");
  const [fields, setFields] = useState<ContractFields>(contract?.fields ?? {});
  const [lampiran, setLampiran] = useState<ContractLampiran>(
    contract?.lampiran ?? emptyLampiran()
  );
  const [loaded, setLoaded] = useState(mode === "edit");
  // Edit mode: kontrak sudah terbit → template pasti ada saat itu.
  const [hasTemplate, setHasTemplate] = useState(mode === "edit");
  const [pickedBu, setPickedBu] = useState("");

  const onPickEmployee = (id: string) => {
    setUserId(id);
    if (!id) {
      setLoaded(false);
      return;
    }
    startTransition(async () => {
      const res = await prefillContractFields(id);
      if (!res.ok || !res.data) return void toast.error(res.ok ? "Gagal" : res.error);
      setFields(res.data.fields);
      setLampiran(res.data.lampiran);
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

  const groups = useMemo(() => {
    const m = new Map<string, typeof CONTRACT_FIELD_DEFS>();
    for (const d of CONTRACT_FIELD_DEFS) {
      const arr = m.get(d.group) ?? [];
      arr.push(d);
      m.set(d.group, arr);
    }
    return Array.from(m.entries());
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4">
      <div className="w-full max-w-3xl rounded-2xl border-2 border-foreground bg-card shadow-hard my-8">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="font-display font-bold">
            {mode === "issue" ? "Terbitkan kontrak" : `Edit kontrak — ${contract?.employee_name}`}
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
                    {defs.map((d) => (
                      <Field key={d.key} label={d.label}>
                        <input
                          value={fields[d.key] ?? ""}
                          onChange={(e) =>
                            setFields((f) => ({ ...f, [d.key]: e.target.value }))
                          }
                          className={INPUT}
                        />
                      </Field>
                    ))}
                  </div>
                </div>
              ))}

              <div className="space-y-3 border-t border-border pt-3">
                <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Lampiran 1 — Deskripsi Pekerjaan (jobdesc)
                </h4>
                <div className="grid sm:grid-cols-2 gap-2">
                  <Field label="Atasan langsung">
                    <input
                      value={lampiran.atasan ?? ""}
                      onChange={(e) =>
                        setLampiran((l) => ({ ...l, atasan: e.target.value }))
                      }
                      className={INPUT}
                    />
                  </Field>
                </div>
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
              </div>
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
