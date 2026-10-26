"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Network, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { removeChainMember, setChainMember, type HierarchyAdminData, type HierarchyBranch } from "@/lib/actions/tickets.actions";
import { OWNER_LEVEL } from "@/lib/tickets/chain-logic";

const MAX_LEVEL = 8;

/** Tombol "Atur hierarki" + dialog: rantai bertingkat per cabang (Tingkat 1..8, owner selalu puncak). */
export function HierarchyManager({ data }: { data: HierarchyAdminData }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} title="Atur siapa yang menangani tiket tiap cabang">
        <Network size={15} /> Atur hierarki
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Hierarki tiket per cabang</DialogTitle>
            <DialogDescription>
              Tiket dari karyawan masuk ke Tingkat 1 cabangnya. Bila tidak sanggup, tingkat itu mengeskalasi ke tingkat berikutnya, dan seterusnya sampai owner.
              Satu tingkat boleh diisi lebih dari satu orang (siapa pun di tingkat itu bisa menangani).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {data.branches
              .filter((b) => b.branch.isActive)
              .map((b) => (
                <BranchChain key={b.branch.id} item={b} eligible={data.eligible} />
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function BranchChain({ item, eligible }: { item: HierarchyBranch; eligible: HierarchyAdminData["eligible"] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // Tingkat kosong yang sengaja dibuka (belum ada anggotanya).
  const [extraLevels, setExtraLevels] = useState<number[]>([]);
  const usedLevels = Array.from(new Set(item.members.map((m) => m.level)));
  const levels = Array.from(new Set([...usedLevels, ...extraLevels])).sort((a, b) => a - b);
  const inChain = new Set(item.members.map((m) => m.userId));
  const candidates = eligible.filter((e) => !inChain.has(e.id));

  function add(level: number, userId: string) {
    if (!userId) return;
    start(async () => {
      const r = await setChainMember(item.branch.id, userId, level);
      if (!r.ok) return void toast.error(r.error);
      setExtraLevels((x) => x.filter((l) => l !== level));
      router.refresh();
    });
  }
  function remove(userId: string) {
    start(async () => {
      const r = await removeChainMember(item.branch.id, userId);
      if (!r.ok) return void toast.error(r.error);
      router.refresh();
    });
  }
  function addLevel() {
    const next = (levels.length ? Math.max(...levels) : 0) + 1;
    if (next > MAX_LEVEL) return void toast.error(`Maksimal ${MAX_LEVEL} tingkat`);
    setExtraLevels((x) => [...x, next]);
  }

  return (
    <section className="rounded-2xl border-2 border-foreground bg-card p-3.5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="font-display text-[14px] font-bold">{item.branch.label}</h3>
        <span className="text-[11px] text-muted-foreground">{item.employeeCount} karyawan ditugaskan</span>
      </div>

      <ol className="space-y-2">
        {levels.length === 0 && (
          <li className="rounded-lg bg-warning/10 px-3 py-2 text-[12px] text-warning">
            Belum ada tingkat. Tiket dari cabang ini langsung masuk ke owner. Tambahkan Tingkat 1 untuk memberi cabang ini penanggung jawab.
          </li>
        )}
        {levels.map((lvl) => {
          const members = item.members.filter((m) => m.level === lvl);
          return (
            <li key={lvl} className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/50 px-3 py-2">
              <span className="w-[70px] shrink-0 text-[12px] font-bold">Tingkat {lvl}</span>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                {members.map((m) => (
                  <span key={m.userId} className="inline-flex items-center gap-1 rounded-full border border-border bg-card py-0.5 pl-2.5 pr-1 text-[12px] font-medium">
                    {m.name}
                    <button
                      type="button"
                      onClick={() => remove(m.userId)}
                      disabled={pending}
                      aria-label={`Keluarkan ${m.name}`}
                      className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
                {members.length === 0 && <span className="text-[11.5px] italic text-muted-foreground">kosong, pilih orang →</span>}
              </div>
              <select
                value=""
                disabled={pending}
                onChange={(e) => add(lvl, e.target.value)}
                aria-label={`Tambah orang ke Tingkat ${lvl}`}
                className="h-8 max-w-[11rem] rounded-lg border-2 border-border bg-background px-2 text-[12px]"
              >
                <option value="">+ Tambah orang</option>
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
        <li className="flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2">
          <span className="w-[70px] shrink-0 text-[12px] font-bold">Owner</span>
          <span className="text-[11.5px] text-muted-foreground">Selalu puncak (otomatis, level {OWNER_LEVEL}). Menerima eskalasi dari tingkat tertinggi.</span>
        </li>
      </ol>

      <Button variant="ghost" size="xs" className="mt-2" onClick={addLevel} disabled={pending}>
        <Plus size={13} /> Tambah tingkat
      </Button>
    </section>
  );
}
