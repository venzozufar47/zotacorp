"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays, Plus, Trash2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createHoliday,
  deleteHoliday,
  seedHolidays2026,
  type HolidayRow,
} from "@/lib/actions/holidays.actions";

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function HolidayCalendarCard({ initial }: { initial: HolidayRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");

  function onAdd() {
    const date = newDate.trim();
    const name = newName.trim();
    if (!date || !name) {
      toast.error("Tanggal & nama wajib diisi");
      return;
    }
    startTransition(async () => {
      const res = await createHoliday({ date, name });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(`"${name}" ditambahkan`);
      setNewDate("");
      setNewName("");
      router.refresh();
    });
  }

  function onDelete(h: HolidayRow) {
    startTransition(async () => {
      const res = await deleteHoliday({ id: h.id });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(`"${h.name}" dihapus`);
      router.refresh();
    });
  }

  function onSeed() {
    startTransition(async () => {
      const res = await seedHolidays2026();
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        res.inserted > 0
          ? `${res.inserted} libur nasional 2026 ditambahkan`
          : "Semua libur nasional 2026 sudah ada"
      );
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-base font-semibold flex items-center gap-2">
            <CalendarDays size={14} />
            Hari libur nasional
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
            Tanggal merah dipakai untuk karyawan yang fitur{" "}
            <strong>&ldquo;Libur nasional dihitung bonus&rdquo;</strong>-nya
            aktif (atur per karyawan di Pengguna → jadwal). Saat check-in di
            tanggal ini, absensi mereka otomatis jadi <strong>bonus</strong> —
            tidak telat.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onSeed}
          disabled={pending}
          className="shrink-0 gap-1.5"
        >
          <Sparkles size={13} />
          Seed 2026
        </Button>
      </div>

      <div className="divide-y divide-border max-h-72 overflow-y-auto">
        {initial.map((h) => (
          <div
            key={h.id}
            className="px-4 py-2 flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <span className="text-xs font-semibold tabular-nums text-foreground">
                {formatDate(h.date)}
              </span>
              <span className="text-xs text-muted-foreground"> · {h.name}</span>
            </div>
            <button
              type="button"
              onClick={() => onDelete(h)}
              disabled={pending}
              className="text-muted-foreground hover:text-destructive disabled:opacity-50 shrink-0"
              aria-label="Hapus"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {initial.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground italic text-center">
            Belum ada hari libur. Klik &ldquo;Seed 2026&rdquo; atau tambah manual.
          </p>
        )}
      </div>

      <div className="px-4 py-3 border-t border-border bg-muted/20 flex flex-wrap items-end gap-2">
        <Input
          type="date"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          className="w-40"
        />
        <Input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nama hari libur"
          className="flex-1 min-w-[10rem]"
        />
        <Button type="button" onClick={onAdd} disabled={pending} className="gap-1.5">
          <Plus size={14} />
          Tambah
        </Button>
      </div>
    </section>
  );
}
