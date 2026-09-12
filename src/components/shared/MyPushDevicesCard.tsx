"use client";

import { useEffect, useState } from "react";
import { Smartphone, Trash2, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  listMyPushDevices,
  removeMyPushDevice,
  renameMyPushDevice,
  type MyPushDevice,
} from "@/lib/actions/push.actions";

/**
 * Shows the CURRENT user's own registered push devices — lets someone
 * verify which devices are actually tied to THIS account instead of
 * assuming. A device subscribed while logged into a different account
 * (tested as an employee, then switched back to admin, say) stays tied to
 * that other account until re-enabled here; this card is how to notice
 * that without asking someone to query the database.
 *
 * Safari never reveals the exact iPhone/iPad model, so two iPhones can
 * look identical here — each row can be given a custom nickname to tell
 * them apart going forward.
 */
export function MyPushDevicesCard() {
  const [devices, setDevices] = useState<MyPushDevice[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

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

  function startEdit(d: MyPushDevice) {
    setEditingId(d.id);
    setEditValue(d.isCustomLabel ? d.label : "");
  }

  async function saveEdit(id: string) {
    setBusyId(id);
    try {
      const res = await renameMyPushDevice(id, editValue);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setDevices(
        (prev) =>
          prev?.map((d) =>
            d.id === id
              ? {
                  ...d,
                  label: editValue.trim() || d.label,
                  isCustomLabel: Boolean(editValue.trim()),
                }
              : d
          ) ?? prev
      );
      setEditingId(null);
      toast.success("Nama perangkat disimpan.");
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
            {editingId === d.id ? (
              <>
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit(d.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  placeholder="mis. iPhone 15 Pro Max"
                  className="flex-1 min-w-0 rounded border border-border bg-background px-1.5 py-0.5 text-xs"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => saveEdit(d.id)}
                  disabled={busyId === d.id}
                  aria-label="Simpan nama"
                >
                  <Check size={12} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setEditingId(null)}
                  disabled={busyId === d.id}
                  aria-label="Batal"
                >
                  <X size={12} />
                </Button>
              </>
            ) : (
              <>
                <span className="truncate">
                  {d.label}
                  <span className="text-muted-foreground ml-1.5">
                    ·{" "}
                    {new Date(d.createdAt).toLocaleString("id-ID", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </span>
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => startEdit(d)}
                    disabled={busyId === d.id}
                    aria-label="Beri nama perangkat"
                  >
                    <Pencil size={12} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onRemove(d.id)}
                    disabled={busyId === d.id}
                    className="hover:text-destructive"
                    aria-label="Hapus perangkat"
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
