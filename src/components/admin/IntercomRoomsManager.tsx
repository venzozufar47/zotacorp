"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, Save, X } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  createVoiceRoom,
  updateVoiceRoom,
  deleteVoiceRoom,
  type VoiceRoomInput,
} from "@/lib/actions/voice-rooms.actions";
import type { VoiceRoom } from "@/lib/voice/types";

interface Props {
  initialRooms: VoiceRoom[];
  brandOptions: string[];
}

const CROSS_BRAND_VALUE = "__all__";

/**
 * Inline-edit table for intercom rooms. New row appears in the editor
 * panel above the list; clicking Edit on an existing row swaps it
 * into the same panel. Keeps the surface to a single component
 * without a separate dialog (matches LocationsManager pattern).
 */
export function IntercomRoomsManager({ initialRooms, brandOptions }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<VoiceRoom | "new" | null>(null);

  const startNew = () => setEditing("new");
  const startEdit = (room: VoiceRoom) => setEditing(room);
  const cancel = () => setEditing(null);

  const onSave = (input: VoiceRoomInput) => {
    const target = editing;
    if (target === null) return;
    startTransition(async () => {
      const isNew = target === "new";
      const res = isNew
        ? await createVoiceRoom(input)
        : await updateVoiceRoom(target.id, input);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(isNew ? "Room dibuat" : "Room diperbarui");
      setEditing(null);
      router.refresh();
    });
  };

  const onDelete = (room: VoiceRoom) => {
    if (
      !confirm(
        `Hapus room "${room.name}"? Semua presensi yang sedang aktif akan otomatis terlempar.`
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteVoiceRoom(room.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Room dihapus");
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {editing ? (
        <RoomEditor
          key={editing === "new" ? "new" : editing.id}
          initial={editing === "new" ? null : editing}
          brandOptions={brandOptions}
          pending={pending}
          onSave={onSave}
          onCancel={cancel}
        />
      ) : (
        <button
          type="button"
          onClick={startNew}
          className="flex items-center gap-2 rounded-xl bg-primary text-primary-foreground border-2 border-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          <Plus size={16} strokeWidth={2.5} />
          Tambah room
        </button>
      )}

      <div className="rounded-2xl border-2 border-foreground bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b-2 border-foreground">
            <tr>
              <th className="text-left px-4 py-2 font-semibold">Nama</th>
              <th className="text-left px-4 py-2 font-semibold">Brand</th>
              <th className="text-left px-4 py-2 font-semibold">Status</th>
              <th className="text-left px-4 py-2 font-semibold">Urutan</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {initialRooms.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Belum ada room. Klik &quot;Tambah room&quot; untuk membuat yang
                  pertama.
                </td>
              </tr>
            ) : (
              initialRooms.map((room) => (
                <tr key={room.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3 font-medium text-foreground">
                    {room.name}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {room.business_unit ?? (
                      <span className="italic">Semua brand</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {room.is_active ? (
                      <span className="inline-block rounded-full bg-pop-emerald/20 text-foreground border border-foreground px-2 py-0.5 text-xs font-medium">
                        Aktif
                      </span>
                    ) : (
                      <span className="inline-block rounded-full bg-muted text-muted-foreground border border-border px-2 py-0.5 text-xs font-medium">
                        Nonaktif
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">
                    {room.sort_order}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(room)}
                        disabled={pending}
                        className="flex items-center gap-1 rounded-lg border-2 border-foreground bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
                      >
                        <Pencil size={12} strokeWidth={2.5} />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(room)}
                        disabled={pending}
                        className="flex items-center gap-1 rounded-lg border-2 border-foreground bg-destructive text-destructive-foreground px-2.5 py-1 text-xs font-medium hover:opacity-90 disabled:opacity-50"
                      >
                        <Trash2 size={12} strokeWidth={2.5} />
                        Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoomEditor({
  initial,
  brandOptions,
  pending,
  onSave,
  onCancel,
}: {
  initial: VoiceRoom | null;
  brandOptions: string[];
  pending: boolean;
  onSave: (input: VoiceRoomInput) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [brand, setBrand] = useState(
    initial?.business_unit ?? CROSS_BRAND_VALUE
  );
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [sortOrder, setSortOrder] = useState(
    String(initial?.sort_order ?? 0)
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name,
      business_unit: brand === CROSS_BRAND_VALUE ? null : brand,
      is_active: isActive,
      sort_order: parseInt(sortOrder, 10) || 0,
    });
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border-2 border-foreground bg-card p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">
          {initial ? `Edit room — ${initial.name}` : "Room baru"}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full p-1 text-muted-foreground hover:bg-muted"
          aria-label="Tutup"
        >
          <X size={16} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">
            Nama room
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Contoh: Pusat, Semarang, Operasional"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">
            Brand
          </span>
          <select
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value={CROSS_BRAND_VALUE}>Semua brand (cross)</option>
            {brandOptions.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">
            Urutan tampil
          </span>
          <input
            type="number"
            inputMode="numeric"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
          />
        </label>

        <label className="flex items-center gap-2 mt-5">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="size-4"
          />
          <span className="text-sm text-foreground">Aktif (tampil di lobby)</span>
        </label>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="flex-1 sm:flex-none rounded-xl border-2 border-foreground bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
        >
          Batal
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground border-2 border-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          <Save size={14} strokeWidth={2.5} />
          {pending ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
    </form>
  );
}
