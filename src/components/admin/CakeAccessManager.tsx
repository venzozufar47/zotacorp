"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";
import {
  assignCakeAccess,
  revokeCakeAccess,
  type CakeAccessRow,
  type CakeAccessScope,
  type CakeProductionRole,
} from "@/lib/actions/cake-access.actions";
import { resolveAvatarSrc } from "@/lib/avatar";

interface Employee {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  avatar_seed: string | null;
}

interface Props {
  initialAssignments: CakeAccessRow[];
  employees: Employee[];
}

const SCOPES: Array<{ scope: CakeAccessScope; label: string; desc: string }> = [
  {
    scope: "orders",
    label: "Input order",
    desc: "Mengisi form custom cake (/cake-orders), tandai paid & refund",
  },
  {
    scope: "production",
    label: "Produksi",
    desc: "Menerima slip produksi (/cake-production), tandai status produksi",
  },
];

export function CakeAccessManager({ initialAssignments, employees }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const grouped = useMemo(() => {
    const out: Record<CakeAccessScope, CakeAccessRow[]> = {
      orders: [],
      production: [],
    };
    for (const a of initialAssignments) out[a.scope].push(a);
    return out;
  }, [initialAssignments]);

  const onAssign = (
    userId: string,
    scope: CakeAccessScope,
    productionRole: CakeProductionRole = null
  ) => {
    startTransition(async () => {
      const res = await assignCakeAccess(userId, scope, productionRole);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Akses ditambahkan");
      router.refresh();
    });
  };

  const onRevoke = (userId: string, scope: CakeAccessScope) => {
    if (!confirm("Cabut akses ini?")) return;
    startTransition(async () => {
      const res = await revokeCakeAccess(userId, scope);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Akses dicabut");
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      {SCOPES.map(({ scope, label, desc }) => (
        <section
          key={scope}
          className="rounded-2xl border-2 border-foreground bg-card p-4 space-y-3"
        >
          <div>
            <h2 className="font-semibold text-foreground">{label}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
          </div>

          <ul className="space-y-1.5">
            {grouped[scope].length === 0 ? (
              <li className="text-sm text-muted-foreground italic">
                Belum ada karyawan yang ditunjuk.
              </li>
            ) : (
              grouped[scope].map((a) => (
                <li
                  key={`${a.user_id}-${a.scope}`}
                  className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2"
                >
                  <Image
                    src={resolveAvatarSrc({
                      id: a.user_id,
                      full_name: a.full_name,
                      avatar_url: a.avatar_url,
                      avatar_seed: a.avatar_seed,
                    })}
                    alt={a.full_name ?? "Karyawan"}
                    width={28}
                    height={28}
                    unoptimized
                    className="size-7 rounded-full border border-foreground bg-card shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
                      {a.full_name ?? a.email ?? "—"}
                      {scope === "production" && (
                        <RoleBadge role={a.production_role} />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {a.email ?? ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRevoke(a.user_id, scope)}
                    disabled={pending}
                    className="flex items-center gap-1 rounded-lg border-2 border-foreground bg-destructive text-destructive-foreground px-2.5 py-1 text-xs font-medium disabled:opacity-50"
                  >
                    <Trash2 size={12} strokeWidth={2.5} />
                    Cabut
                  </button>
                </li>
              ))
            )}
          </ul>

          <AssignDropdown
            scope={scope}
            employees={employees}
            existingUserIds={new Set(grouped[scope].map((a) => a.user_id))}
            onAssign={(userId, role) => onAssign(userId, scope, role)}
            disabled={pending}
          />
        </section>
      ))}
    </div>
  );
}

function AssignDropdown({
  scope,
  employees,
  existingUserIds,
  onAssign,
  disabled,
}: {
  scope: CakeAccessScope;
  employees: Employee[];
  existingUserIds: Set<string>;
  onAssign: (userId: string, role: CakeProductionRole) => void;
  disabled: boolean;
}) {
  const [pickedId, setPickedId] = useState("");
  const [role, setRole] = useState<CakeProductionRole>(null);
  const candidates = employees.filter((e) => !existingUserIds.has(e.id));

  return (
    <div className="flex flex-wrap gap-2 pt-1">
      <select
        value={pickedId}
        onChange={(e) => setPickedId(e.target.value)}
        className="flex-1 min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm"
      >
        <option value="">-- pilih karyawan --</option>
        {candidates.map((e) => (
          <option key={e.id} value={e.id}>
            {e.full_name ?? e.email ?? e.id}
          </option>
        ))}
      </select>
      {scope === "production" && (
        <select
          value={role ?? "both"}
          onChange={(e) =>
            setRole(
              e.target.value === "both"
                ? null
                : (e.target.value as "baker" | "decorator")
            )
          }
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          aria-label="Pilih sub-role produksi"
        >
          <option value="both">Baker + Decorator</option>
          <option value="baker">Baker (Mulai produksi)</option>
          <option value="decorator">Decorator (Mulai gambar + Tandai selesai)</option>
        </select>
      )}
      <button
        type="button"
        onClick={() => {
          if (!pickedId) return;
          onAssign(pickedId, scope === "production" ? role : null);
          setPickedId("");
          setRole(null);
        }}
        disabled={!pickedId || disabled}
        className="flex items-center gap-1 rounded-xl bg-primary text-primary-foreground border-2 border-foreground px-3 py-2 text-sm font-medium disabled:opacity-50"
      >
        <Plus size={14} strokeWidth={2.5} />
        Tambahkan ke {scope === "orders" ? "input order" : "produksi"}
      </button>
    </div>
  );
}

function RoleBadge({ role }: { role: CakeProductionRole }) {
  if (role === "baker") {
    return (
      <span className="inline-block rounded-full border border-foreground bg-tertiary/30 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide">
        Baker
      </span>
    );
  }
  if (role === "decorator") {
    return (
      <span className="inline-block rounded-full border border-foreground bg-pop-pink/30 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide">
        Decorator
      </span>
    );
  }
  return (
    <span className="inline-block rounded-full border border-border bg-muted px-1.5 py-0 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
      Both
    </span>
  );
}
