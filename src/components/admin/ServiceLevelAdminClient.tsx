"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Ban, Check, Clock, Users, X } from "lucide-react";
import { toast } from "sonner";
import {
  addServiceLevelExclusion,
  deleteServiceLevelExclusion,
  endServiceLevelExclusion,
  setServiceLevelOwners,
  setServiceLevelSettings,
  type ServiceLevelExclusionRow,
  type ServiceLevelOwnerRow,
  type ServiceLevelSummary,
} from "@/lib/actions/pos-service-level.actions";

interface Outlet {
  id: string;
  accountName: string;
  branch: string | null;
  enabled: boolean;
  openHour: number;
  closeHour: number;
  summary: ServiceLevelSummary | null;
  owners: ServiceLevelOwnerRow[];
  exclusions: ServiceLevelExclusionRow[];
  skus: Array<{ productId: string; variantId: string | null; label: string }>;
}

/** Ambang warna terhadap target 100%. Token semantik, bukan hex. */
function toneOf(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 0.95) return "text-success";
  if (pct >= 0.85) return "text-warning";
  return "text-destructive";
}

function pctLabel(pct: number | null): string {
  return pct === null ? "—" : `${(pct * 100).toFixed(1)}%`;
}

function todayWib(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function ServiceLevelAdminClient({
  outlets,
  employees,
}: {
  outlets: Outlet[];
  employees: Array<{ id: string; name: string }>;
}) {
  if (outlets.length === 0) {
    return (
      <div className="panel-sticker p-5 text-sm text-muted-foreground">
        Belum ada rekening POS aktif.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Ringkasan — supaya superadmin tidak perlu membuka layar kasir. */}
      <div className="grid gap-3 sm:grid-cols-2">
        {outlets.map((o) => (
          <div key={o.id} className="panel-sticker p-4">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {o.branch ?? o.accountName}
                </p>
                <p
                  className={`font-display text-4xl font-extrabold tabular-nums leading-none mt-1 ${toneOf(
                    o.summary?.percent ?? null
                  )}`}
                >
                  {pctLabel(o.summary?.percent ?? null)}
                </p>
              </div>
              {!o.enabled && (
                <span className="shrink-0 rounded-full border-2 border-foreground bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                  Nonaktif
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {o.summary && o.summary.daysCounted > 0 ? (
                <>
                  {o.summary.daysCounted} hari terhitung ·{" "}
                  {o.summary.lostSkuHours.toLocaleString("id-ID")} SKU-jam kosong
                </>
              ) : (
                "Belum ada data snapshot — cron berjalan tiap 22:30 WIB."
              )}
            </p>
            {o.summary?.hasPartialOpname && (
              <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-warning">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                Ada hari dengan opname parsial — SKU yang tidak dihitung saat
                opname terbaca habis, jadi angkanya bisa tertekan semu.
              </p>
            )}
            {o.summary?.hasBackfill && (
              <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                Sebagian hari dihitung mundur (backfill) — penyebutnya memakai
                katalog hari ini, jadi tidak sebanding dengan hari terukur.
              </p>
            )}
          </div>
        ))}
      </div>

      {outlets.map((o) => (
        <OutletPanel key={o.id} outlet={o} employees={employees} />
      ))}
    </div>
  );
}

function OutletPanel({
  outlet,
  employees,
}: {
  outlet: Outlet;
  employees: Array<{ id: string; name: string }>;
}) {
  return (
    <div className="panel-sticker p-5 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold">
          {outlet.branch ?? outlet.accountName}
        </h2>
        <span className="text-xs text-muted-foreground">
          {outlet.skus.length} SKU dilacak
        </span>
      </div>

      <HoursSection outlet={outlet} />
      <OwnersSection outlet={outlet} employees={employees} />
      <ExclusionsSection outlet={outlet} />
    </div>
  );
}

function HoursSection({ outlet }: { outlet: Outlet }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(outlet.enabled);
  const [open, setOpen] = useState(String(outlet.openHour));
  const [close, setClose] = useState(String(outlet.closeHour));
  const [pending, start] = useTransition();

  const dirty =
    enabled !== outlet.enabled ||
    Number(open) !== outlet.openHour ||
    Number(close) !== outlet.closeHour;

  function save() {
    start(async () => {
      const res = await setServiceLevelSettings({
        bankAccountId: outlet.id,
        enabled,
        openHour: Number(open),
        closeHour: Number(close),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Pengaturan tersimpan");
      router.refresh();
    });
  }

  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        <Clock size={12} /> Jam operasi
      </h3>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Aktifkan metrik
        </label>
        <label className="text-xs">
          <span className="block text-muted-foreground">Buka</span>
          <input
            type="number"
            min={0}
            max={23}
            value={open}
            onChange={(e) => setOpen(e.target.value)}
            className="mt-0.5 h-9 w-20 rounded-lg border-2 border-foreground bg-card px-2 text-sm tabular-nums"
          />
        </label>
        <label className="text-xs">
          <span className="block text-muted-foreground">Tutup</span>
          <input
            type="number"
            min={1}
            max={24}
            value={close}
            onChange={(e) => setClose(e.target.value)}
            className="mt-0.5 h-9 w-20 rounded-lg border-2 border-foreground bg-card px-2 text-sm tabular-nums"
          />
        </label>
        <p className="text-[11px] text-muted-foreground">
          Sampel diambil tiap jam bulat, {outlet.openHour}:00–
          {outlet.closeHour - 1}:00 WIB. Jam tutup eksklusif.
        </p>
        {dirty && (
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="h-9 rounded-lg border-2 border-foreground bg-primary px-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {pending ? "Menyimpan…" : "Simpan"}
          </button>
        )}
      </div>
    </section>
  );
}

function OwnersSection({
  outlet,
  employees,
}: {
  outlet: Outlet;
  employees: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const initial = outlet.owners.map((o) => o.userId);
  const [selected, setSelected] = useState<Set<string>>(new Set(initial));
  const [pending, start] = useTransition();

  const dirty =
    selected.size !== initial.length || initial.some((id) => !selected.has(id));

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function save() {
    start(async () => {
      const res = await setServiceLevelOwners({
        bankAccountId: outlet.id,
        userIds: [...selected],
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Penanggung jawab tersimpan");
      router.refresh();
    });
  }

  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        <Users size={12} /> Penanggung jawab
      </h3>
      <p className="text-[11px] text-muted-foreground">
        Metrik ini muncul di dashboard Zota mereka. Boleh lebih dari satu orang.
      </p>
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4">
        {employees.map((e) => (
          <label
            key={e.id}
            className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs hover:bg-muted"
          >
            <input
              type="checkbox"
              checked={selected.has(e.id)}
              onChange={() => toggle(e.id)}
            />
            <span className="truncate">{e.name}</span>
          </label>
        ))}
      </div>
      {dirty && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="h-9 rounded-lg border-2 border-foreground bg-primary px-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {pending ? "Menyimpan…" : "Simpan"}
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set(initial))}
            disabled={pending}
            className="h-9 rounded-lg border-2 border-foreground bg-card px-3 text-sm font-semibold"
          >
            Batal
          </button>
        </div>
      )}
    </section>
  );
}

function ExclusionsSection({ outlet }: { outlet: Outlet }) {
  const router = useRouter();
  const [sku, setSku] = useState("");
  const [from, setFrom] = useState(todayWib());
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  const skuValue = (s: Outlet["skus"][number]) =>
    `${s.productId}|${s.variantId ?? ""}`;

  function add() {
    const picked = outlet.skus.find((s) => skuValue(s) === sku);
    if (!picked) {
      toast.error("Pilih SKU dulu.");
      return;
    }
    start(async () => {
      const res = await addServiceLevelExclusion({
        bankAccountId: outlet.id,
        productId: picked.productId,
        variantId: picked.variantId,
        excludedFrom: from,
        reason: reason || undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Pengecualian ditambahkan");
      setSku("");
      setReason("");
      router.refresh();
    });
  }

  function end(id: string) {
    const until = todayWib();
    start(async () => {
      const res = await endServiceLevelExclusion({ id, excludedUntil: until });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Pengecualian diakhiri per ${until}`);
      router.refresh();
    });
  }

  function remove(id: string) {
    if (
      !confirm(
        "Hapus permanen? Gunakan ini HANYA untuk membatalkan salah input — " +
          "SKU akan kembali terhitung untuk seluruh periode pengecualian, " +
          "sehingga angka yang sudah dilaporkan ikut berubah."
      )
    )
      return;
    start(async () => {
      const res = await deleteServiceLevelExclusion(id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Dihapus");
      router.refresh();
    });
  }

  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        <Ban size={12} /> Pengecualian SKU
      </h3>
      <p className="text-[11px] text-muted-foreground">
        Untuk menu yang berhenti dijual. Berlaku <strong>mulai tanggal</strong>{" "}
        yang diisi — periode sebelumnya tetap menghitung SKU ini, jadi angka
        lama tidak berubah.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">
          <span className="block text-muted-foreground">Produk / varian</span>
          <select
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            className="mt-0.5 h-9 min-w-[200px] rounded-lg border-2 border-foreground bg-card px-2 text-sm"
          >
            <option value="">— pilih —</option>
            {outlet.skus.map((s) => (
              <option key={skuValue(s)} value={skuValue(s)}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="block text-muted-foreground">Mulai</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-0.5 h-9 rounded-lg border-2 border-foreground bg-card px-2 text-sm"
          />
        </label>
        <label className="text-xs flex-1 min-w-[140px]">
          <span className="block text-muted-foreground">Alasan (opsional)</span>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="mis. sudah tidak diproduksi"
            className="mt-0.5 h-9 w-full rounded-lg border-2 border-foreground bg-card px-2 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={add}
          disabled={pending || !sku}
          className="h-9 rounded-lg border-2 border-foreground bg-primary px-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          Tambah
        </button>
      </div>

      {outlet.exclusions.length > 0 && (
        <ul className="mt-2 space-y-1">
          {outlet.exclusions.map((x) => (
            <li
              key={x.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs"
            >
              <span
                className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                  x.active
                    ? "bg-destructive/15 text-destructive"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {x.active ? <Ban size={9} /> : <Check size={9} />}
                {x.active ? "berlaku" : "selesai"}
              </span>
              <span className="font-medium">{x.label}</span>
              <span className="text-muted-foreground tabular-nums">
                {x.excludedFrom} → {x.excludedUntil ?? "seterusnya"}
              </span>
              {x.reason && (
                <span className="text-muted-foreground italic">“{x.reason}”</span>
              )}
              <span className="ml-auto flex items-center gap-1">
                {x.active && (
                  <button
                    type="button"
                    onClick={() => end(x.id)}
                    disabled={pending}
                    className="rounded border border-border px-1.5 py-0.5 hover:bg-muted"
                    title="Akhiri mulai hari ini (riwayat tetap utuh)"
                  >
                    Akhiri
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(x.id)}
                  disabled={pending}
                  className="rounded border border-destructive/40 p-0.5 text-destructive hover:bg-destructive/10"
                  title="Hapus permanen — hanya untuk salah input"
                >
                  <X size={11} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
