"use client";

import { useEffect, useState } from "react";
import { Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  listMyPushDevices,
  removeMyPushDevice,
  type MyPushDevice,
} from "@/lib/actions/push.actions";

/**
 * Shows the CURRENT user's own registered push devices — lets someone
 * verify which devices are actually tied to THIS account instead of
 * assuming. A device subscribed while logged into a different account
 * (tested as an employee, then switched back to admin, say) stays tied to
 * that other account until re-enabled here; this card is how to notice
 * that without asking someone to query the database.
 */
export function MyPushDevicesCard() {
  const [devices, setDevices] = useState<MyPushDevice[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listMyPushDevices().then((d) => {
      if (alive) setDevices(d);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function onRemove(id: string) {
    setBusyId(id);
    try {
      const res = await removeMyPushDevice(id);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setDevices((prev) => prev?.filter((d) => d.id !== id) ?? prev);
      toast.success("Perangkat dihapus dari akun ini.");
    } finally {
      setBusyId(null);
    }
  }

  // Nothing registered at all — no need to show an empty card; the
  // EnablePushButton right above already covers "belum aktifkan".
  if (devices === null || devices.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
      <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
        <Smartphone size={13} />
        Perangkat terdaftar di akun ini ({devices.length})
      </p>
      <ul className="space-y-1.5">
        {devices.map((d) => (
          <li
            key={d.id}
            className="flex items-center justify-between gap-2 text-xs bg-background rounded-lg border border-border px-2.5 py-1.5"
          >
            <span className="truncate">
              {d.label}
              <span className="text-muted-foreground ml-1.5">
                · {new Date(d.createdAt).toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onRemove(d.id)}
              disabled={busyId === d.id}
              className="hover:text-destructive shrink-0"
              aria-label="Hapus perangkat"
            >
              <Trash2 size={12} />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
