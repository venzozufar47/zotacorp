"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { addReportEditor, removeReportEditor, setReportEditorBrands, type ReportEditorsData } from "@/lib/actions/social-report.actions";

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "id", { sensitivity: "base" });

function BrandChips({ brands, ids, onToggle, disabled }: { brands: { id: string; label: string }[]; ids: string[]; onToggle: (brandId: string) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {brands.map((b) => {
        const on = ids.includes(b.id);
        return (
          <button
            key={b.id}
            type="button"
            role="checkbox"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onToggle(b.id)}
            className={cn(
              "h-8 rounded-full border-2 px-3 text-[12px] font-semibold transition disabled:opacity-50",
              on ? "border-foreground bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:border-foreground/50"
            )}
          >
            {b.label}
          </button>
        );
      })}
    </div>
  );
}

/** Siapa yang mengisi laporan mingguan (selain owner) dan brand apa yang boleh diisi. Perubahan tampil seketika, disimpan di latar. */
export function SocialEditorsPanel({ data }: { data: ReportEditorsData }) {
  const router = useRouter();
  const [editors, setEditors] = useState(data.editors);
  const [candidates, setCandidates] = useState(data.candidates);
  const [busy, setBusy] = useState(false);
  // Orang yang baru dipilih dari dropdown: brand wajib dipilih dulu sebelum ditambahkan.
  const [pending, setPending] = useState<{ id: string; name: string; brandIds: string[] } | null>(null);

  async function confirmAdd() {
    if (!pending || pending.brandIds.length === 0) return;
    const { id, name, brandIds } = pending;
    setEditors((e) => [...e, { userId: id, name, brandIds }].sort(byName));
    setCandidates((c) => c.filter((x) => x.id !== id));
    setPending(null);
    setBusy(true);
    const r = await addReportEditor(id, brandIds);
    setBusy(false);
    if (!r.ok) {
      toast.error(r.error);
      setEditors((e) => e.filter((x) => x.userId !== id));
      setCandidates((c) => [...c, { id, name }].sort(byName));
      return;
    }
    router.refresh();
  }

  async function remove(userId: string, name: string, brandIds: string[]) {
    setEditors((e) => e.filter((x) => x.userId !== userId));
    setCandidates((c) => [...c, { id: userId, name }].sort(byName));
    setBusy(true);
    const r = await removeReportEditor(userId);
    setBusy(false);
    if (!r.ok) {
      toast.error(r.error);
      setEditors((e) => [...e, { userId, name, brandIds }].sort(byName));
      setCandidates((c) => c.filter((x) => x.id !== userId));
      return;
    }
    router.refresh();
  }

  async function toggleBrand(userId: string, brandId: string) {
    const cur = editors.find((e) => e.userId === userId);
    if (!cur) return;
    const next = cur.brandIds.includes(brandId) ? cur.brandIds.filter((b) => b !== brandId) : [...cur.brandIds, brandId];
    if (next.length === 0) {
      toast.error("Pengisi harus punya minimal satu brand. Untuk mencabut akses, hapus orangnya.");
      return;
    }
    setEditors((e) => e.map((x) => (x.userId === userId ? { ...x, brandIds: next } : x)));
    setBusy(true);
    const r = await setReportEditorBrands(userId, next);
    setBusy(false);
    if (!r.ok) {
      toast.error(r.error);
      setEditors((e) => e.map((x) => (x.userId === userId ? { ...x, brandIds: cur.brandIds } : x)));
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3 rounded-2xl border-2 border-foreground bg-card p-3.5">
      <p className="text-[12.5px] text-muted-foreground">
        Orang di bawah ini melihat menu “Sosmed” di akun mereka, hanya untuk brand yang dipilih. Mereka wajib mengisi laporan tiap Senin dan mendapat pengingat di
        beranda sampai semua akun brand mereka terisi.
      </p>
      <ul className="space-y-2">
        {editors.map((e) => (
          <li key={e.userId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-border bg-background px-3 py-2">
            <span className="min-w-[5rem] text-[13px] font-semibold">{e.name}</span>
            <BrandChips brands={data.brands} ids={e.brandIds} onToggle={(b) => toggleBrand(e.userId, b)} disabled={busy} />
            <button
              type="button"
              onClick={() => remove(e.userId, e.name, e.brandIds)}
              disabled={busy}
              aria-label={`Hapus ${e.name} dari pengisi laporan`}
              className="ml-auto grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <X size={14} />
            </button>
          </li>
        ))}
        {editors.length === 0 && <li className="text-[12px] italic text-muted-foreground">Belum ada pengisi.</li>}
      </ul>

      {pending ? (
        <div className="space-y-2 rounded-xl border-2 border-dashed border-border p-3">
          <p className="text-[12.5px] font-semibold">Brand yang diisi {pending.name}</p>
          <BrandChips
            brands={data.brands}
            ids={pending.brandIds}
            onToggle={(b) => setPending((p) => (p ? { ...p, brandIds: p.brandIds.includes(b) ? p.brandIds.filter((x) => x !== b) : [...p.brandIds, b] } : p))}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirmAdd}
              disabled={pending.brandIds.length === 0}
              className="h-9 rounded-lg border-2 border-foreground bg-primary px-4 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-40"
            >
              Tambahkan
            </button>
            <button type="button" onClick={() => setPending(null)} className="h-9 rounded-lg border-2 border-border px-4 text-[12.5px] font-semibold">
              Batal
            </button>
          </div>
        </div>
      ) : (
        <select
          value=""
          disabled={busy}
          onChange={(e) => {
            const c = candidates.find((x) => x.id === e.target.value);
            if (c) setPending({ id: c.id, name: c.name, brandIds: [] });
          }}
          aria-label="Tambah pengisi laporan"
          className="h-9 rounded-lg border-2 border-border bg-background px-2 text-[12.5px]"
        >
          <option value="">+ Tambah orang</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
