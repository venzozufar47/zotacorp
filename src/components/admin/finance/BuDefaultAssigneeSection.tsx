"use client";

/**
 * Section "default assignee per BU" — toggle permanen yang ngatur
 * user mana otomatis ter-assign saat tx baru ber-kategori Needs
 * Assignment. Set sekali, berlaku terus sampai diubah. Saat di-set,
 * existing tx pending juga auto-backfill ke user baru.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Settings2, UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  setBusinessUnitDefaultAssignee,
  listAssignableProfiles,
  type AssignableProfile,
  type BuDefaultAssignment,
} from "@/lib/actions/cashflow-assignments.actions";

interface Props {
  initial: BuDefaultAssignment[];
}

export function BuDefaultAssigneeSection({ initial }: Props) {
  const [items, setItems] = useState(initial);
  const [profiles, setProfiles] = useState<AssignableProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const router = useRouter();
  const [pendingId, startTransition] = useTransition();

  useEffect(() => {
    listAssignableProfiles().then((res) => {
      if (res.ok && res.data) setProfiles(res.data);
      setProfilesLoading(false);
    });
  }, []);

  const handleChange = (businessUnit: string, userId: string) => {
    const nextUserId = userId || null;
    startTransition(async () => {
      const res = await setBusinessUnitDefaultAssignee(
        businessUnit,
        nextUserId
      );
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const backfilled = res.data?.backfilled ?? 0;
      const userName = profiles.find((p) => p.id === nextUserId)?.fullName;
      toast.success(
        nextUserId
          ? backfilled > 0
            ? `Default ${businessUnit} → ${userName}. ${backfilled} tx pending ikut di-assign.`
            : `Default ${businessUnit} → ${userName}.`
          : `Default ${businessUnit} dilepas.`
      );
      setItems((prev) =>
        prev.map((p) =>
          p.businessUnit === businessUnit
            ? {
                ...p,
                userId: nextUserId,
                userName: userName ?? null,
                pendingCount: nextUserId ? 0 : p.pendingCount,
              }
            : p
        )
      );
      router.refresh();
    });
  };

  if (items.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-muted/40 flex items-center gap-2">
        <Settings2 className="size-4 text-muted-foreground" />
        <div>
          <h2 className="text-sm font-semibold">
            Default assignee Needs Assignment
          </h2>
          <p className="text-xs text-muted-foreground">
            Tx baru ber-kategori Needs Assignment otomatis di-assign ke
            user ini per BU. Set sekali, berlaku terus.
          </p>
        </div>
      </div>
      <div className="divide-y divide-border/60">
        {items.map((item) => (
          <div
            key={item.businessUnit}
            className="px-4 py-3 flex flex-wrap items-center gap-3 justify-between"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{item.businessUnit}</span>
              {item.pendingCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">
                  {item.pendingCount} pending unassigned
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {item.userName && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <UserCircle2 className="size-3.5" />
                  saat ini:{" "}
                  <span className="font-medium text-foreground">
                    {item.userName}
                  </span>
                </span>
              )}
              <select
                value={item.userId ?? ""}
                onChange={(e) =>
                  handleChange(item.businessUnit, e.target.value)
                }
                disabled={profilesLoading || pendingId}
                className="text-sm px-2 py-1.5 rounded border border-border bg-background min-w-52"
              >
                <option value="">— tidak ada default —</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                    {p.businessUnit ? ` · ${p.businessUnit}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
