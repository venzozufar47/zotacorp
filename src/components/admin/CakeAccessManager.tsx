"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";
import {
  assignCakeAccess,
  revokeCakeAccessById,
  type CakeAccessRow,
  type CakeAccessScope,
  type CakeProductionRole,
} from "@/lib/actions/cake-access.actions";
import { resolveAvatarSrc } from "@/lib/avatar";
import {
  CAKE_BRANCHES,
  CAKE_BRANCH_LABELS,
  type CakeBranch,
} from "@/lib/cake-orders/types";

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
    desc: "Mengisi form custom cake (/cake-orders), tandai paid & refund. Akses semua cabang.",
  },
  {
    scope: "production",
    label: "Produksi",
    desc: "Menerima slip produksi (/cake-production), tandai status. Spesifik per cabang + role.",
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

  const onAssign = (input: {
    userId: string;
    scope: CakeAccessScope;
    productionRole?: CakeProductionRole;
    branch?: CakeBranch | null;
  }) => {
    startTransition(async () => {
      const res = await assignCakeAccess(input);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Akses ditambahkan");
      router.refresh();
    });
  };

  const onRevoke = (assignmentId: string) => {
    if (!confirm("Cabut akses ini?")) return;
    startTransition(async () => {
      const res = await revokeCakeAccessById(assignmentId);
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
                  key={a.id}
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
                    <div className="text-sm font-medium text-foreground truncate flex items-center gap-1.5 flex-wrap">
                      {a.full_name ?? a.email ?? "—"}
                      {scope === "production" && (
                        <>
                          <BranchBadge branch={a.branch} />
                          <RoleBadge role={a.production_role} />
                        </>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {a.email ?? ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRevoke(a.id)}
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
            onAssign={onAssign}
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
  onAssign,
  disabled,
}: {
  scope: CakeAccessScope;
  employees: Employee[];
  onAssign: (input: {
    userId: string;
    scope: CakeAccessScope;
    productionRole?: CakeProductionRole;
    branch?: CakeBranch | null;
  }) => void;
  disabled: boolean;
}) {
  const [pickedId, setPickedId] = useState("");
  const [role, setRole] = useState<CakeProductionRole>(null);
  const [branch, setBranch] = useState<CakeBranch>("pare");

  return (
    <div className="flex flex-wrap gap-2 pt-1">
      <select
        value={pickedId}
        onChange={(e) => setPickedId(e.target.value)}
        className="flex-1 min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm"
      >
        <option value="">-- pilih karyawan --</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>
            {e.full_name ?? e.email ?? e.id}
          </option>
        ))}
      </select>
      {scope === "production" && (
        <>
          <select
            value={branch}
            onChange={(e) => setBranch(e.target.value as CakeBranch)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            aria-label="Cabang"
          >
            {CAKE_BRANCHES.map((b) => (
              <option key={b} value={b}>
                Cabang {CAKE_BRANCH_LABELS[b]}
              </option>
            ))}
          </select>
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
            <option value="decorator">
              Decorator (Mulai gambar + Tandai selesai)
            </option>
          </select>
        </>
      )}
      <button
        type="button"
        onClick={() => {
          if (!pickedId) return;
          onAssign({
            userId: pickedId,
            scope,
            productionRole: scope === "production" ? role : null,
            branch: scope === "production" ? branch : null,
          });
          setPickedId("");
          setRole(null);
        }}
        disabled={!pickedId || disabled}
        className="flex items-center gap-1 rounded-xl bg-primary text-primary-foreground border-2 border-foreground px-3 py-2 text-sm font-medium disabled:opacity-50"
      >
        <Plus size={14} strokeWidth={2.5} />
        Tambahkan
      </button>
    </div>
  );
}

function BranchBadge({ branch }: { branch: CakeBranch | null }) {
  if (!branch) return null;
  const cls =
    branch === "pare"
      ? "bg-pop-emerald/30"
      : "bg-pop-pink/30";
  return (
    <span
      className={`inline-block rounded-full border border-foreground ${cls} px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide`}
    >
      {CAKE_BRANCH_LABELS[branch]}
    </span>
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
      <span className="inline-block rounded-full border border-foreground bg-amber-300/40 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide">
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
