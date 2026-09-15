"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Send, Loader2, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createRound, type RoundOverviewRow } from "@/lib/actions/evaluation-360.actions";
import { cn } from "@/lib/utils";

export interface Evaluation360Employee {
  id: string;
  name: string;
  businessUnit: string | null;
  jobRole: string | null;
  isProbation: boolean;
}

/** Add/remove chip picker — urutan tidak relevan di sini (beda dari MemberPicker rotasi cleaning). */
function CohortPicker({
  employees,
  selected,
  onChange,
  disabled,
}: {
  employees: Evaluation360Employee[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const byId = new Map(employees.map((e) => [e.id, e]));
  const available = employees.filter((e) => !selected.includes(e.id));

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-1 text-xs font-semibold"
            >
              {byId.get(id)?.name ?? "—"}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(selected.filter((s) => s !== id))}
                className="text-muted-foreground hover:text-destructive disabled:opacity-50"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <select
        value=""
        disabled={disabled || available.length === 0}
        onChange={(e) => {
          if (e.target.value) onChange([...selected, e.target.value]);
        }}
        className="w-full h-9 rounded-lg border border-border bg-card px-2 text-sm"
      >
        <option value="">+ tambah karyawan ke kohort…</option>
        {available.map((emp) => (
          <option key={emp.id} value={emp.id}>
            {emp.name}
            {emp.isProbation ? " · probation" : ""}
            {emp.businessUnit ? ` · ${emp.businessUnit}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

function CreateRoundDialog({
  open,
  onOpenChange,
  employees,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employees: Evaluation360Employee[];
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  function reset() {
    setTitle("");
    setSelected([]);
  }

  function submit() {
    if (!title.trim()) {
      toast.error("Judul round wajib diisi.");
      return;
    }
    if (selected.length < 2) {
      toast.error("Pilih minimal 2 karyawan untuk round-robin.");
      return;
    }
    startTransition(async () => {
      const res = await createRound({ title: title.trim(), participantUserIds: selected });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Round "${title.trim()}" dibuat & dipush ke ${selected.length} karyawan.`);
      reset();
      onOpenChange(false);
      onDone();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Buat & push round evaluasi 360°</DialogTitle>
          <DialogDescription>
            Semua karyawan yang dipilih akan saling menilai satu sama lain
            (round-robin penuh, tanpa menilai diri sendiri) dan menerima
            notifikasi push.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Judul round
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="mis. Evaluasi Probation Dhara — Sept 2026"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Kohort peserta ({selected.length})
            </label>
            <CohortPicker
              employees={employees}
              selected={selected}
              onChange={setSelected}
              disabled={pending}
            />
            {selected.length >= 2 && (
              <p className="text-[11px] text-muted-foreground">
                Total {selected.length * (selected.length - 1)} form akan dibuat
                ({selected.length} orang × {selected.length - 1} peer).
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
            disabled={pending}
          >
            Batal
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Membuat…
              </>
            ) : (
              <>
                <Send size={14} /> Buat & push
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Evaluation360RoundsManager({
  rounds,
  employees,
}: {
  rounds: RoundOverviewRow[];
  employees: Evaluation360Employee[];
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);

  const sorted = useMemo(
    () => [...rounds].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [rounds]
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setCreateOpen(true)} className="gap-1.5">
          <Plus size={14} /> Buat Round
        </Button>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground italic px-1">Belum ada round evaluasi.</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((r) => (
            <Link
              key={r.id}
              href={`/admin/evaluasi-360/${r.id}`}
              className="flex items-center gap-3 rounded-2xl border-2 border-foreground bg-card p-4 shadow-hard-sm hover:-translate-y-0.5 transition"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-tight truncate">{r.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {r.participantCount} peserta · {r.submittedCount}/{r.totalSlots} form
                  terkumpul
                </p>
              </div>
              <span
                className={cn(
                  "inline-flex items-center rounded-full border-2 border-foreground px-2.5 py-0.5 text-[10.5px] font-bold",
                  r.status === "active" ? "bg-warning/40" : "bg-muted"
                )}
              >
                {r.status === "active" ? "Aktif" : "Ditutup"}
              </span>
              <ArrowRight size={16} className="text-muted-foreground shrink-0" />
            </Link>
          ))}
        </div>
      )}

      <CreateRoundDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        employees={employees}
        onDone={() => router.refresh()}
      />
    </div>
  );
}
