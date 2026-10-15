"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Copy, KeyRound, Plus, X } from "lucide-react";
import {
  createBoothDevice,
  revokeBoothDevice,
  rotateBoothDeviceToken,
  setBoothDeviceEvent,
} from "@/lib/actions/booth.actions";
import {
  BOOTH_BRAND_LABELS,
  formatBoothTime,
  type BoothBrand,
  type BoothDevice,
  type BoothEventOption,
} from "@/lib/booth/types";

interface Props {
  devices: BoothDevice[];
  events: BoothEventOption[];
}

const FIELD =
  "w-full rounded-xl border-2 border-foreground/15 bg-card px-3 py-2 text-sm focus:border-primary focus:outline-none transition";
const LABEL =
  "block text-[12px] font-semibold uppercase tracking-wider text-muted-foreground mb-1";

function Flag({ label, value }: { label: string; value: boolean | null }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={
          value === null
            ? "text-sm text-muted-foreground"
            : value
              ? "text-sm font-semibold text-foreground"
              : "text-sm font-semibold text-destructive"
        }
      >
        {value === null ? "-" : value ? "Siap" : "Bermasalah"}
      </div>
    </div>
  );
}

export function DevicesManager({ devices, events }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [revealed, setRevealed] = useState<{ name: string; token: string } | null>(
    null
  );
  const [name, setName] = useState("");
  const [brand, setBrand] = useState<BoothBrand>("yeobo_space");
  const [location, setLocation] = useState("");
  const [eventId, setEventId] = useState("");

  function onCreate(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await createBoothDevice({
        name,
        brand,
        location: location || null,
        event_id: eventId || null,
      });
      if (!res.ok || !res.data) {
        toast.error(res.ok ? "Gagal membuat perangkat" : res.error);
        return;
      }
      setAdding(false);
      setRevealed({ name, token: res.data.token });
      setName("");
      setLocation("");
      setEventId("");
      router.refresh();
    });
  }

  function onRotate(d: BoothDevice) {
    if (
      !confirm(
        `Buat token baru untuk ${d.name}? Token lama langsung berhenti bekerja, jadi .env di laptop cabang harus diganti.`
      )
    )
      return;
    start(async () => {
      const res = await rotateBoothDeviceToken(d.id);
      if (!res.ok || !res.data) {
        toast.error(res.ok ? "Gagal membuat token" : res.error);
        return;
      }
      setRevealed({ name: d.name, token: res.data.token });
      router.refresh();
    });
  }

  function onRevoke(d: BoothDevice) {
    if (!confirm(`Cabut ${d.name}? Perangkat ini langsung berhenti bisa mengirim foto.`))
      return;
    start(async () => {
      const res = await revokeBoothDevice(d.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Perangkat dicabut");
      router.refresh();
    });
  }

  function onEvent(d: BoothDevice, value: string) {
    start(async () => {
      const res = await setBoothDeviceEvent(d.id, value || null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Event aktif diperbarui");
      router.refresh();
    });
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Disalin");
    } catch {
      toast.error("Gagal menyalin, salin manual");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90"
        >
          <Plus size={14} /> Tambah Perangkat
        </button>
      </div>

      {devices.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground text-sm">
          Belum ada perangkat booth. Tambah satu per laptop cabang.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {devices.map((d) => (
            <div
              key={d.id}
              className="rounded-2xl border border-border bg-card p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-foreground truncate">
                    {d.name}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {BOOTH_BRAND_LABELS[d.brand]}
                    {d.location && <> · {d.location}</>}
                  </div>
                </div>
                <span
                  className={
                    d.revoked_at
                      ? "shrink-0 rounded-full border-2 border-foreground/20 px-2.5 py-0.5 text-xs font-semibold text-muted-foreground"
                      : d.online
                        ? "shrink-0 rounded-full bg-pop-emerald border-2 border-foreground px-2.5 py-0.5 text-xs font-semibold"
                        : "shrink-0 rounded-full border-2 border-destructive/60 px-2.5 py-0.5 text-xs font-semibold text-destructive"
                  }
                >
                  {d.revoked_at ? "Dicabut" : d.online ? "Online" : "Offline"}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <Flag label="Kamera" value={d.camera_ready} />
                <Flag label="Printer" value={d.printer_ready} />
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Antrean
                  </div>
                  <div className="text-sm font-semibold">
                    {d.queue_pending ?? "-"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Versi
                  </div>
                  <div className="text-sm font-semibold">
                    {d.app_version ?? "-"}
                  </div>
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                Terakhir terlihat: {formatBoothTime(d.last_seen_at)} WIB
              </div>

              <div>
                <label className={LABEL}>Event aktif</label>
                <select
                  className={FIELD}
                  value={d.active_event_id ?? ""}
                  disabled={pending || !!d.revoked_at}
                  onChange={(e) => onEvent(d, e.target.value)}
                >
                  <option value="">— Tidak ada —</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name}
                      {ev.status !== "active" ? ` (${ev.status})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onRotate(d)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 border-foreground/20 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  <KeyRound size={14} /> Token baru
                </button>
                {!d.revoked_at && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onRevoke(d)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 border-destructive/40 text-destructive text-sm font-medium hover:bg-muted disabled:opacity-50"
                  >
                    <Ban size={14} /> Cabut
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4">
          <form
            onSubmit={onCreate}
            className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-card border border-border p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg">Tambah Perangkat</h3>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="p-1 rounded hover:bg-muted"
              >
                <X size={16} />
              </button>
            </div>
            <div>
              <label className={LABEL}>Nama</label>
              <input
                className={FIELD}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Mis. Yeobo Space Jebres"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Brand</label>
                <select
                  className={FIELD}
                  value={brand}
                  onChange={(e) => setBrand(e.target.value as BoothBrand)}
                >
                  <option value="yeobo_space">Yeobo Space</option>
                  <option value="yeobo_booth">Yeobo Booth</option>
                </select>
              </div>
              <div>
                <label className={LABEL}>Lokasi</label>
                <input
                  className={FIELD}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Mis. Jebres"
                />
              </div>
            </div>
            <div>
              <label className={LABEL}>Event aktif (opsional)</label>
              <select
                className={FIELD}
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
              >
                <option value="">— Tidak ada —</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="px-4 py-2 rounded-xl border-2 border-foreground/20 text-sm font-medium hover:bg-muted"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={pending}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Membuat…" : "Buat & tampilkan token"}
              </button>
            </div>
          </form>
        </div>
      )}

      {revealed && (
        <div className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4">
          <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl bg-card border border-border p-5 space-y-4 shadow-2xl">
            <h3 className="font-display font-bold text-lg">
              Token {revealed.name}
            </h3>
            <p className="text-sm text-muted-foreground">
              Token ini <strong>hanya ditampilkan sekali</strong>. Salin ke
              baris <code>DEVICE_TOKEN=</code> di file <code>.env</code> laptop
              cabang. Kalau hilang, buat token baru.
            </p>
            <div className="flex gap-2">
              <input
                readOnly
                className={`${FIELD} font-mono text-xs`}
                value={`DEVICE_TOKEN=${revealed.token}`}
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                onClick={() => copy(`DEVICE_TOKEN=${revealed.token}`)}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
              >
                <Copy size={14} /> Salin
              </button>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setRevealed(null)}
                className="px-4 py-2 rounded-xl border-2 border-foreground/20 text-sm font-medium hover:bg-muted"
              >
                Sudah disalin, tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
