"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import { addReportEditor, removeReportEditor, type ReportEditorsData } from "@/lib/actions/social-report.actions";

/** Siapa yang mengisi laporan mingguan (selain owner). Perubahan tampil seketika, disimpan di latar. */
export function SocialEditorsPanel({ data }: { data: ReportEditorsData }) {
  const router = useRouter();
  const [editors, setEditors] = useState(data.editors);
  const [candidates, setCandidates] = useState(data.candidates);
  const [busy, setBusy] = useState(false);

  async function add(userId: string) {
    const person = candidates.find((c) => c.id === userId);
    if (!person) return;
    setEditors((e) => [...e, { userId, name: person.name }].sort((a, b) => a.name.localeCompare(b.name, "id", { sensitivity: "base" })));
    setCandidates((c) => c.filter((x) => x.id !== userId));
    setBusy(true);
    const r = await addReportEditor(userId);
    setBusy(false);
    if (!r.ok) {
      toast.error(r.error);
      setEditors((e) => e.filter((x) => x.userId !== userId));
      setCandidates((c) => [...c, person].sort((a, b) => a.name.localeCompare(b.name, "id", { sensitivity: "base" })));
      return;
    }
    router.refresh();
  }

  async function remove(userId: string, name: string) {
    setEditors((e) => e.filter((x) => x.userId !== userId));
    setCandidates((c) => [...c, { id: userId, name }].sort((a, b) => a.name.localeCompare(b.name, "id", { sensitivity: "base" })));
    setBusy(true);
    const r = await removeReportEditor(userId);
    setBusy(false);
    if (!r.ok) {
      toast.error(r.error);
      setEditors((e) => [...e, { userId, name }]);
      setCandidates((c) => c.filter((x) => x.id !== userId));
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3 rounded-2xl border-2 border-foreground bg-card p-3.5">
      <p className="text-[12.5px] text-muted-foreground">
        Orang di bawah ini melihat menu “Sosmed” di akun mereka, wajib mengisi laporan tiap Senin, dan mendapat pengingat di beranda sampai semua akun terisi.
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {editors.map((e) => (
          <span key={e.userId} className="inline-flex items-center gap-1 rounded-full border border-border bg-background py-0.5 pl-2.5 pr-1 text-[12.5px] font-medium">
            {e.name}
            <button
              type="button"
              onClick={() => remove(e.userId, e.name)}
              disabled={busy}
              aria-label={`Hapus ${e.name} dari pengisi laporan`}
              className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        {editors.length === 0 && <span className="text-[12px] italic text-muted-foreground">Belum ada pengisi.</span>}
        <select
          value=""
          disabled={busy}
          onChange={(e) => e.target.value && add(e.target.value)}
          aria-label="Tambah pengisi laporan"
          className="h-8 rounded-lg border-2 border-border bg-background px-2 text-[12px]"
        >
          <option value="">+ Tambah orang</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
