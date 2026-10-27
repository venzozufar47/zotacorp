"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Network, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { setSuperiors, type HierarchyAdminData, type HierarchyBranch } from "@/lib/actions/tickets.actions";

/** Tombol "Atur hierarki" + dialog: atasan langsung tiap orang per cabang (owner selalu puncak). */
export function HierarchyManager({ data }: { data: HierarchyAdminData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Perubahan dicatat dulu di sini (tampil seketika) lalu disimpan ke server di latar; halaman disegarkan saat dialog ditutup.
  const [changed, setChanged] = useState(false);
  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v && changed) {
      setChanged(false);
      router.refresh();
    }
  }
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} title="Atur atasan tiap orang untuk tiket">
        <Network size={15} /> Atur hierarki
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Hierarki tiket per cabang</DialogTitle>
            <DialogDescription>
              Tiap orang punya atasan langsung. Tiketnya masuk ke SATU atasan itu; yang punya dua atasan memilih sendiri saat membuat tiket.
              Bila atasan tidak sanggup, tiket naik ke atasan langsungnya, dan seterusnya sampai owner. Tanpa atasan, tiket langsung ke owner.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            {data.branches
              .filter((b) => b.branch.isActive)
              .map((b) => (
                <BranchPeople key={b.branch.id} item={b} eligible={data.eligible} onSaved={() => setChanged(true)} />
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function BranchPeople({
  item,
  eligible,
  onSaved,
}: {
  item: HierarchyBranch;
  eligible: HierarchyAdminData["eligible"];
  onSaved: () => void;
}) {
  const nameOf = new Map(eligible.map((e) => [e.id, e.name]));
  // Salinan lokal untuk pembaruan optimistis (UI berubah seketika, server menyusul).
  const [people, setPeople] = useState(item.people);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  function save(userId: string, superiorIds: string[]) {
    const before = people.find((p) => p.userId === userId)?.superiorIds ?? [];
    setPeople((ps) => ps.map((p) => (p.userId === userId ? { ...p, superiorIds } : p)));
    setBusy((b) => new Set(b).add(userId));
    void setSuperiors(item.branch.id, userId, superiorIds)
      .then((r) => {
        if (!r.ok) {
          setPeople((ps) => ps.map((p) => (p.userId === userId ? { ...p, superiorIds: before } : p)));
          toast.error(r.error);
        } else onSaved();
      })
      .catch(() => {
        setPeople((ps) => ps.map((p) => (p.userId === userId ? { ...p, superiorIds: before } : p)));
        toast.error("Gagal menyimpan. Coba lagi.");
      })
      .finally(() =>
        setBusy((b) => {
          const n = new Set(b);
          n.delete(userId);
          return n;
        })
      );
  }

  return (
    <section className="rounded-2xl border-2 border-foreground bg-card p-3.5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="font-display text-[14px] font-bold">{item.branch.label}</h3>
        <span className="text-[11px] text-muted-foreground">{people.length} orang</span>
      </div>
      <ul className="space-y-1.5">
        {people.map((p) => {
          const candidates = eligible.filter((e) => e.id !== p.userId && !p.superiorIds.includes(e.id));
          return (
            <li key={p.userId} className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/50 px-3 py-2">
              <span className="w-[110px] shrink-0 truncate text-[12.5px] font-bold" title={p.name}>
                {p.name}
              </span>
              <span className="text-[11px] text-muted-foreground">atasan:</span>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                {p.superiorIds.map((sid) => (
                  <span key={sid} className="inline-flex items-center gap-1 rounded-full border border-border bg-card py-0.5 pl-2.5 pr-1 text-[12px] font-medium">
                    {nameOf.get(sid) ?? "—"}
                    <button
                      type="button"
                      onClick={() =>
                        save(
                          p.userId,
                          p.superiorIds.filter((x) => x !== sid)
                        )
                      }
                      disabled={busy.has(p.userId)}
                      aria-label={`Lepas ${nameOf.get(sid) ?? "atasan"} sebagai atasan ${p.name}`}
                      className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
                {p.superiorIds.length === 0 && <span className="text-[11.5px] italic text-muted-foreground">Owner (langsung)</span>}
              </div>
              <select
                value=""
                disabled={busy.has(p.userId)}
                onChange={(e) => e.target.value && save(p.userId, [...p.superiorIds, e.target.value])}
                aria-label={`Tambah atasan untuk ${p.name}`}
                className="h-8 max-w-[11rem] rounded-lg border-2 border-border bg-background px-2 text-[12px]"
              >
                <option value="">+ Atasan</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.businessUnit ? ` · ${c.businessUnit}` : ""}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
        {people.length === 0 && (
          <li className="rounded-lg bg-warning/10 px-3 py-2 text-[12px] text-warning">Belum ada karyawan yang ditugaskan ke cabang ini.</li>
        )}
      </ul>
    </section>
  );
}
