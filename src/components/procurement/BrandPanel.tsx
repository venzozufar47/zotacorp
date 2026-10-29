"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, FileUp, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { compressImageFile } from "@/lib/images/compress-image";
import { defaultHalalKind } from "@/lib/procurement/brand-store";
import {
  getBrandCertificateUrl,
  listMaterialBrands,
  registerBrand,
  setActiveBrand,
  setBrandActive,
  setMaterialHalal,
  updateBrand,
  uploadBrandCertificate,
  type BrandView,
  type HalalKind,
  type HalalStatus,
} from "@/lib/actions/procurement-brands.actions";

const inputCls = "w-full rounded-xl border-2 border-border bg-card px-3 py-2.5 text-base outline-none focus:border-foreground md:text-sm";

const STATUS_LABEL: Record<HalalStatus, string> = {
  bersertifikat: "Bersertifikat halal",
  tidak_wajib: "Tidak wajib (positive list)",
  belum_dicek: "Belum dicek",
};
const KIND_LABEL: Record<HalalKind, string> = { baku: "Bahan baku", tambahan: "Bahan tambahan", penolong: "Bahan penolong" };

export interface BrandPanelMaterial {
  id: string;
  name: string;
  category: string | null;
  halalKind: HalalKind | null;
  inHalalList: boolean;
}

/**
 * Merek & halal satu bahan: daftar merek (yang sedang dipakai di atas), tambah merek, dan lengkapi data halal belakangan.
 * Semua isian opsional; tidak ada yang menahan pembelian.
 */
export function BrandPanel({ material, onClose, startAdding = false }: { material: BrandPanelMaterial; onClose: () => void; startAdding?: boolean }) {
  const router = useRouter();
  const [brands, setBrands] = useState<BrandView[] | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [adding, setAdding] = useState(startAdding);
  const [newName, setNewName] = useState("");
  const [kind, setKind] = useState<HalalKind | "">(material.halalKind ?? defaultHalalKind(material.category) ?? "");
  const [inList, setInList] = useState(material.inHalalList);
  const [pending, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    listMaterialBrands(material.id).then((r) => {
      if (!cancelled && r.ok && r.data) setBrands(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, [material.id]);

  async function reload() {
    const r = await listMaterialBrands(material.id);
    if (r.ok && r.data) setBrands(r.data);
    router.refresh();
  }

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string, after?: () => void) {
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? "Gagal");
        return;
      }
      toast.success(okMsg);
      after?.();
      await reload();
    });
  }

  function addBrand() {
    const name = newName.trim();
    if (!name) return;
    start(async () => {
      const res = await registerBrand({ materialId: material.id, name });
      if (!res.ok || !res.data) {
        toast.error(res.ok ? "Gagal" : res.error);
        return;
      }
      toast.success(res.data.existed ? "Merek itu sudah ada" : "Merek ditambahkan");
      setNewName("");
      setAdding(false);
      setEditId(res.data.id);
      await reload();
    });
  }

  function saveMaterialHalal(next: { kind?: HalalKind | ""; inList?: boolean }) {
    const k = next.kind ?? kind;
    const l = next.inList ?? inList;
    run(() => setMaterialHalal({ materialId: material.id, halalKind: k || null, inHalalList: l }), "Tersimpan");
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-background md:items-center md:justify-center md:bg-black/40">
      <div className="flex min-h-0 flex-1 flex-col bg-background md:max-h-[90vh] md:w-full md:max-w-lg md:flex-none md:rounded-2xl md:border md:border-border">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="font-display text-base font-bold">Merek &amp; halal</h2>
            <p className="truncate text-xs text-muted-foreground">{material.name}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" className="rounded-full p-2 hover:bg-muted">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <section className="space-y-2 rounded-2xl border border-border bg-card p-3">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={inList}
                onChange={(e) => {
                  setInList(e.target.checked);
                  saveMaterialHalal({ inList: e.target.checked });
                }}
              />
              Masuk Daftar Bahan Halal
            </label>
            {inList && (
              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">Jenis bahan (untuk Lampiran 5)</span>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(KIND_LABEL) as HalalKind[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        const next = kind === k ? "" : k;
                        setKind(next);
                        saveMaterialHalal({ kind: next });
                      }}
                      aria-pressed={kind === k}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                        kind === k ? "border-foreground bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {KIND_LABEL[k]}
                    </button>
                  ))}
                </div>
                {!material.halalKind && kind && <p className="text-[11px] text-muted-foreground">Usulan dari kategori; ketuk untuk menyimpan atau ganti.</p>}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-bold">Merek terdaftar</h3>
              <button
                type="button"
                onClick={() => setAdding((a) => !a)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <Plus size={13} /> Tambah merek
              </button>
            </div>
            {adding && (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addBrand()}
                  placeholder="Nama merek (mis. Segitiga Biru)"
                  maxLength={80}
                  className={inputCls}
                />
                <button
                  type="button"
                  disabled={pending || !newName.trim()}
                  onClick={addBrand}
                  className="shrink-0 rounded-xl border-2 border-foreground bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
                >
                  Simpan
                </button>
              </div>
            )}
            {brands === null && <p className="py-4 text-center text-sm text-muted-foreground">Memuat…</p>}
            {brands?.length === 0 && !adding && (
              <p className="rounded-xl bg-muted/50 px-3 py-3 text-xs text-muted-foreground">
                Belum ada merek. Merek boleh dikosongkan — tambahkan bila bahan ini dibeli dengan merek tertentu.
              </p>
            )}
            <ul className="space-y-2">
              {brands?.map((b) => (
                <li key={b.id} className={cn("overflow-hidden rounded-2xl border bg-card", b.isCurrent ? "border-foreground" : "border-border", !b.isActive && "opacity-60")}>
                  <button
                    type="button"
                    onClick={() => setEditId(editId === b.id ? null : b.id)}
                    aria-expanded={editId === b.id}
                    className="flex w-full items-start gap-2 px-3 py-2.5 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{b.name}</span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {b.isCurrent && <Badge tone="primary">Dipakai</Badge>}
                        {!b.isActive && <Badge tone="muted">Nonaktif</Badge>}
                        <Badge tone={b.halalStatus === "bersertifikat" ? "ok" : b.halalStatus === "tidak_wajib" ? "muted" : "warn"}>{STATUS_LABEL[b.halalStatus]}</Badge>
                        {b.expiry === "habis" && <Badge tone="bad">Sertifikat habis</Badge>}
                        {b.expiry === "segera" && <Badge tone="warn">Sertifikat segera habis</Badge>}
                        {b.missing.length > 0 && b.halalStatus !== "belum_dicek" && <Badge tone="warn">Kurang: {b.missing.join(", ")}</Badge>}
                      </span>
                    </span>
                    <span className="text-xs font-semibold text-primary">{editId === b.id ? "Tutup" : "Lengkapi"}</span>
                  </button>
                  {editId === b.id && (
                    <BrandEditor
                      key={b.id}
                      brand={b}
                      pending={pending}
                      onSave={(patch) => run(() => updateBrand({ id: b.id, ...patch }), "Tersimpan")}
                      onMakeCurrent={() => run(() => setActiveBrand({ materialId: material.id, brandId: b.id }), `${b.name} ditandai sedang dipakai`)}
                      onToggleActive={() => run(() => setBrandActive({ id: b.id, active: !b.isActive }), b.isActive ? "Merek dinonaktifkan" : "Merek diaktifkan lagi")}
                      onUploaded={reload}
                    />
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function Badge({ tone, children }: { tone: "ok" | "warn" | "bad" | "muted" | "primary"; children: React.ReactNode }) {
  const cls = {
    ok: "bg-success/15 text-success",
    warn: "bg-warning/20 text-warning",
    bad: "bg-destructive/15 text-destructive",
    muted: "bg-muted text-muted-foreground",
    primary: "bg-primary text-primary-foreground",
  }[tone];
  return <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-bold", cls)}>{children}</span>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const ISSUERS = ["BPJPH", "MUI (LPPOM)", "Lembaga halal luar negeri"];

function BrandEditor({
  brand,
  pending,
  onSave,
  onMakeCurrent,
  onToggleActive,
  onUploaded,
}: {
  brand: BrandView;
  pending: boolean;
  onSave: (patch: {
    producer: string | null;
    country: string | null;
    halalStatus: HalalStatus;
    halalIssuer: string | null;
    halalCertNo: string | null;
    halalValidUntil: string | null;
    halalNote: string | null;
  }) => void;
  onMakeCurrent: () => void;
  onToggleActive: () => void;
  onUploaded: () => Promise<void>;
}) {
  const [producer, setProducer] = useState(brand.producer ?? "");
  const [country, setCountry] = useState(brand.country ?? "");
  const [status, setStatus] = useState<HalalStatus>(brand.halalStatus);
  const [issuer, setIssuer] = useState(brand.halalIssuer ?? "");
  const [certNo, setCertNo] = useState(brand.halalCertNo ?? "");
  const [validUntil, setValidUntil] = useState(brand.halalValidUntil ?? "");
  const [note, setNote] = useState(brand.halalNote ?? "");
  const [uploading, startUpload] = useTransition();

  function upload(file: File | undefined) {
    if (!file) return;
    startUpload(async () => {
      try {
        const f = await compressImageFile(file);
        const fd = new FormData();
        fd.set("brandId", brand.id);
        fd.set("file", f);
        const res = await uploadBrandCertificate(fd);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success("Berkas sertifikat tersimpan");
        await onUploaded();
      } catch {
        toast.error("Berkas tidak bisa diproses");
      }
    });
  }

  async function view() {
    const res = await getBrandCertificateUrl(brand.id);
    if (!res.ok || !res.data) return void toast.error(res.ok ? "Gagal" : res.error);
    window.open(res.data.url, "_blank", "noopener");
  }

  return (
    <div className="space-y-3 border-t border-border px-3 py-3">
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Produsen">
          <input value={producer} onChange={(e) => setProducer(e.target.value)} placeholder="mis. PT Bogasari" className={inputCls} maxLength={120} />
        </Field>
        <Field label="Negara">
          <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Indonesia" className={inputCls} maxLength={60} />
        </Field>
      </div>

      <div className="space-y-1">
        <span className="text-xs font-semibold text-muted-foreground">Status halal</span>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(STATUS_LABEL) as HalalStatus[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              aria-pressed={status === s}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                status === s ? "border-foreground bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted"
              )}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {status === "bersertifikat" && (
        <div className="space-y-2.5">
          <Field label="Lembaga penerbit">
            <input list="halal-issuers" value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="BPJPH / MUI / lembaga luar negeri" className={inputCls} maxLength={120} />
            <datalist id="halal-issuers">
              {ISSUERS.map((i) => (
                <option key={i} value={i} />
              ))}
            </datalist>
          </Field>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Nomor sertifikat">
              <input value={certNo} onChange={(e) => setCertNo(e.target.value)} className={inputCls} maxLength={80} />
            </Field>
            <Field label="Berlaku sampai">
              <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={inputCls} />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className={cn("inline-flex cursor-pointer items-center gap-1.5 rounded-xl border-2 border-border px-3 py-2 text-xs font-semibold hover:bg-muted", uploading && "pointer-events-none opacity-50")}>
              <FileUp size={14} /> {brand.hasDoc ? "Ganti foto/PDF sertifikat" : "Unggah foto/PDF sertifikat"}
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
            </label>
            {brand.hasDoc && (
              <button type="button" onClick={view} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                Lihat berkas <ExternalLink size={12} />
              </button>
            )}
          </div>
        </div>
      )}
      {status === "tidak_wajib" && (
        <Field label="Keterangan (opsional)">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. bahan alami: telur segar" className={inputCls} maxLength={300} />
        </Field>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={() =>
          onSave({
            producer: producer.trim() || null,
            country: country.trim() || null,
            halalStatus: status,
            halalIssuer: status === "bersertifikat" ? issuer.trim() || null : null,
            halalCertNo: status === "bersertifikat" ? certNo.trim() || null : null,
            halalValidUntil: status === "bersertifikat" ? validUntil || null : null,
            halalNote: status === "tidak_wajib" ? note.trim() || null : null,
          })
        }
        className="w-full rounded-xl border-2 border-foreground bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
      >
        {pending ? "Menyimpan…" : "Simpan data merek"}
      </button>
      <div className="flex gap-2">
        {!brand.isCurrent && brand.isActive && (
          <button type="button" disabled={pending} onClick={onMakeCurrent} className="flex-1 rounded-xl border-2 border-border py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50">
            Jadikan merek yang dipakai
          </button>
        )}
        <button type="button" disabled={pending || brand.isCurrent} onClick={onToggleActive} className="flex-1 rounded-xl border-2 border-border py-2 text-xs font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50">
          {brand.isActive ? "Nonaktifkan" : "Aktifkan lagi"}
        </button>
      </div>
    </div>
  );
}
