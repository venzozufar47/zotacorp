import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActionSeverity, EmployeeAction } from "@/lib/employees/lifecycle";

export interface QueueItem {
  employeeId: string;
  name: string;
  action: EmployeeAction;
}

const GROUP_TITLE: Record<string, string> = {
  lokasi: "Absen bebas lokasi",
  kontrak: "Kontrak",
  gaji: "Setelan gaji belum final",
  sanggahan: "Sanggahan slip",
  perpanjangan: "Masa kontrak habis",
  izin: "Izin menunggu keputusan",
  probation: "Probation perlu diputuskan",
  offboarding: "Checklist keluar belum selesai",
  "hari-terakhir": "Akan keluar",
  "belum-dinonaktifkan": "Kontrak berakhir, akun masih aktif",
  profil: "Data diri belum lengkap",
};

const RANK: Record<ActionSeverity, number> = { tinggi: 0, sedang: 1, info: 2 };

const DOT: Record<ActionSeverity, string> = {
  tinggi: "bg-destructive",
  sedang: "bg-warning",
  info: "bg-muted-foreground/40",
};

function groupItems(items: QueueItem[]) {
  const map = new Map<string, QueueItem[]>();
  for (const it of items) {
    const arr = map.get(it.action.key) ?? [];
    arr.push(it);
    map.set(it.action.key, arr);
  }
  return [...map.entries()]
    .map(([key, list]) => ({
      key,
      list,
      severity: list.reduce<ActionSeverity>(
        (s, i) => (RANK[i.action.severity] < RANK[s] ? i.action.severity : s),
        "info"
      ),
    }))
    .sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.list.length - a.list.length);
}

function Section({ title, hint, items }: { title: string; hint: string; items: QueueItem[] }) {
  const groups = groupItems(items);
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Kosong.
        </p>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {groups.map((g) => (
            <details key={g.key} className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
                <span aria-hidden className={cn("size-2 rounded-full", DOT[g.severity])} />
                <span className="font-medium text-foreground">{GROUP_TITLE[g.key] ?? g.key}</span>
                <span className="tabular-nums text-muted-foreground">{g.list.length}</span>
                <ChevronDown
                  size={16}
                  aria-hidden
                  className="ml-auto text-muted-foreground transition-transform group-open:rotate-180"
                />
              </summary>
              <ul className="border-t border-border bg-muted/20">
                {g.list.map((it) => (
                  <li key={it.employeeId}>
                    <Link
                      href={`/admin/karyawan/${it.employeeId}?tab=${it.action.tab}`}
                      className="flex items-center justify-between gap-3 px-4 py-2 pl-9 text-sm hover:bg-muted/60"
                    >
                      <span className="text-foreground">{it.name}</span>
                      <span className="text-xs text-muted-foreground">{it.action.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

export function ActionQueue({ items }: { items: QueueItem[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
      <Section
        title="Giliran Anda"
        hint="buka grup, klik nama untuk langsung ke bagiannya"
        items={items.filter((i) => i.action.owner === "owner")}
      />
      <Section
        title="Menunggu karyawan"
        hint="ingatkan bila terlalu lama"
        items={items.filter((i) => i.action.owner === "karyawan")}
      />
    </div>
  );
}
