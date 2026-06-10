"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Save } from "lucide-react";
import {
  createBooking,
  updateBooking,
} from "@/lib/actions/yeobo-booth.actions";
import type {
  BookingStatus,
  BookingType,
  CreateBookingInput,
  YeoboBoothBookingWithFreelance,
  YeoboBoothFreelance,
} from "@/lib/yeobo-booth/types";
import {
  BOOKING_STATUS_LABEL,
  BOOKING_TYPE_LABEL,
} from "@/lib/yeobo-booth/types";
import { formatIDR } from "@/lib/cashflow/format";

interface Props {
  freelance: YeoboBoothFreelance[];
  editing?: YeoboBoothBookingWithFreelance;
  /** Pakai sticky bottom action bar di mobile. Default true (cocok
   *  untuk /new page yang form-only). Untuk detail page yang punya
   *  section lain di bawah form (cancel, dst), set ke false supaya
   *  sticky bar tidak overlap konten setelahnya. */
  stickyMobileBar?: boolean;
}

const STATUS_OPTIONS: BookingStatus[] = [
  "scheduled",
  "ongoing",
  "completed",
  "cancelled",
];

const FIELD =
  "w-full rounded-xl border-2 border-foreground/15 bg-card px-3 py-2 text-sm focus:border-primary focus:outline-none transition";
const LABEL =
  "block text-[12px] font-semibold uppercase tracking-wider text-muted-foreground mb-1";

export function BookingForm({
  freelance,
  editing,
  stickyMobileBar = true,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [namaKlien, setNamaKlien] = useState(editing?.nama_klien ?? "");
  const [noHpKlien, setNoHpKlien] = useState(editing?.no_hp_klien ?? "");
  const [tanggal, setTanggal] = useState(editing?.tanggal ?? "");
  const [jamMulai, setJamMulai] = useState(
    editing?.jam_mulai?.slice(0, 5) ?? "10:00"
  );
  const [jamSelesai, setJamSelesai] = useState(
    editing?.jam_selesai?.slice(0, 5) ?? "12:00"
  );
  const [lokasi, setLokasi] = useState(editing?.lokasi_event ?? "");
  const [bookingType, setBookingType] = useState<BookingType>(
    editing?.booking_type ?? "event_hire"
  );
  const [hargaTotal, setHargaTotal] = useState<string>(
    editing && editing.booking_type === "event_hire"
      ? String(editing.harga_total)
      : ""
  );
  // Field ekonomi space_rent (string input, di-parse saat submit).
  const [biayaSewa, setBiayaSewa] = useState<string>(
    editing?.biaya_sewa_space != null ? String(editing.biaya_sewa_space) : ""
  );
  const [hargaPerSesi, setHargaPerSesi] = useState<string>(
    editing?.harga_per_sesi != null ? String(editing.harga_per_sesi) : ""
  );
  const [bagiHasil, setBagiHasil] = useState<string>(
    editing?.bagi_hasil_per_sesi != null
      ? String(editing.bagi_hasil_per_sesi)
      : ""
  );
  const [jumlahSesi, setJumlahSesi] = useState<string>(
    editing?.jumlah_sesi != null ? String(editing.jumlah_sesi) : ""
  );
  const [catatan, setCatatan] = useState(editing?.catatan ?? "");
  const [status, setStatus] = useState<BookingStatus>(
    editing?.status ?? "scheduled"
  );
  const [selectedFreelance, setSelectedFreelance] = useState<Set<string>>(
    new Set(editing?.freelance.map((f) => f.id) ?? [])
  );

  function toggleFreelance(id: string) {
    setSelectedFreelance((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const num = (s: string) => Number(s.replace(/[^\d]/g, "")) || 0;
  // Ringkasan ekonomi space_rent (live).
  const srRevenue = num(hargaPerSesi) * num(jumlahSesi);
  const srCosts = num(biayaSewa) + num(bagiHasil) * num(jumlahSesi);
  const srProfit = srRevenue - srCosts;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const common = {
      booking_type: bookingType,
      nama_klien: namaKlien.trim(),
      no_hp_klien: noHpKlien.trim() || null,
      tanggal,
      jam_mulai: jamMulai,
      jam_selesai: jamSelesai,
      lokasi_event: lokasi.trim() || null,
      catatan: catatan.trim() || null,
      freelance_ids: Array.from(selectedFreelance),
    };
    let payload: CreateBookingInput;
    if (bookingType === "event_hire") {
      const harga = num(hargaTotal);
      if (harga <= 0) {
        toast.error("Harga total wajib diisi");
        return;
      }
      payload = { ...common, harga_total: harga };
    } else {
      const hps = num(hargaPerSesi);
      const js = num(jumlahSesi);
      if (hps <= 0) {
        toast.error("Harga per sesi wajib diisi");
        return;
      }
      if (js < 1) {
        toast.error("Jumlah sesi minimal 1");
        return;
      }
      payload = {
        ...common,
        biaya_sewa_space: biayaSewa ? num(biayaSewa) : null,
        harga_per_sesi: hps,
        bagi_hasil_per_sesi: bagiHasil ? num(bagiHasil) : null,
        jumlah_sesi: js,
      };
    }
    start(async () => {
      const res = editing
        ? await updateBooking({ ...payload, id: editing.id, status })
        : await createBooking(payload);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(editing ? "Booking diperbarui" : "Booking dibuat");
      if (editing) {
        router.refresh();
      } else if ("data" in res && res.data) {
        router.push(`/admin/yeobo-booth/bookings/${res.data.id}`);
      } else {
        router.push("/admin/yeobo-booth/bookings");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/yeobo-booth/bookings"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition"
        >
          <ArrowLeft size={14} /> Kembali
        </Link>
      </div>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-lg font-bold text-foreground">
          Tipe Booking
        </h2>
        <div className="flex flex-wrap gap-2">
          {(["event_hire", "space_rent"] as BookingType[]).map((t) => {
            const active = bookingType === t;
            return (
              <button
                type="button"
                key={t}
                onClick={() => setBookingType(t)}
                className={
                  active
                    ? "px-4 py-1.5 rounded-full text-sm font-semibold bg-primary text-primary-foreground border-2 border-primary"
                    : "px-4 py-1.5 rounded-full text-sm font-semibold bg-card text-foreground border-2 border-border hover:border-foreground/40"
                }
              >
                {BOOKING_TYPE_LABEL[t]}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          {bookingType === "event_hire"
            ? "Sewa untuk acara (wedding, dll). Pakai harga total + alur DP/pelunasan."
            : "Sewa space (operator). Tanpa DP/pelunasan — isi biaya sewa, harga/sesi, jumlah sesi, dan opsional bagi hasil/sesi."}
        </p>
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-lg font-bold text-foreground">
          Data Klien & Sesi
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Nama Klien *</label>
            <input
              className={FIELD}
              value={namaKlien}
              onChange={(e) => setNamaKlien(e.target.value)}
              required
            />
          </div>
          <div>
            <label className={LABEL}>No HP Klien</label>
            <input
              className={FIELD}
              value={noHpKlien}
              onChange={(e) => setNoHpKlien(e.target.value)}
              placeholder="08xxx"
            />
          </div>
          <div>
            <label className={LABEL}>Tanggal Sesi *</label>
            <input
              type="date"
              className={FIELD}
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={LABEL}>Jam Mulai *</label>
              <input
                type="time"
                className={FIELD}
                value={jamMulai}
                onChange={(e) => setJamMulai(e.target.value)}
                required
              />
            </div>
            <div>
              <label className={LABEL}>Jam Selesai *</label>
              <input
                type="time"
                className={FIELD}
                value={jamSelesai}
                onChange={(e) => setJamSelesai(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="md:col-span-2">
            <label className={LABEL}>Lokasi Event</label>
            <input
              className={FIELD}
              value={lokasi}
              onChange={(e) => setLokasi(e.target.value)}
              placeholder="Mis. Gedung Serbaguna, Jl. Mawar No. 5"
            />
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-lg font-bold text-foreground">
          {bookingType === "event_hire"
            ? "Harga & Pembayaran"
            : "Biaya & Pendapatan"}
        </h2>
        {bookingType === "event_hire" ? (
          <div>
            <label className={LABEL}>Harga Total (IDR) *</label>
            <input
              inputMode="numeric"
              className={FIELD}
              value={hargaTotal}
              onChange={(e) =>
                setHargaTotal(e.target.value.replace(/[^\d]/g, ""))
              }
              placeholder="Mis. 1500000"
            />
            <p className="text-xs text-muted-foreground mt-1">
              DP & pelunasan dicatat terpisah lewat panel pembayaran setelah
              booking dibuat.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Harga per Sesi (IDR) *</label>
                <input
                  inputMode="numeric"
                  className={FIELD}
                  value={hargaPerSesi}
                  onChange={(e) =>
                    setHargaPerSesi(e.target.value.replace(/[^\d]/g, ""))
                  }
                  placeholder="Mis. 50000"
                />
              </div>
              <div>
                <label className={LABEL}>Jumlah Sesi *</label>
                <input
                  inputMode="numeric"
                  className={FIELD}
                  value={jumlahSesi}
                  onChange={(e) =>
                    setJumlahSesi(e.target.value.replace(/[^\d]/g, ""))
                  }
                  placeholder="Mis. 100"
                />
              </div>
              <div>
                <label className={LABEL}>Biaya Sewa Space (IDR)</label>
                <input
                  inputMode="numeric"
                  className={FIELD}
                  value={biayaSewa}
                  onChange={(e) =>
                    setBiayaSewa(e.target.value.replace(/[^\d]/g, ""))
                  }
                  placeholder="Opsional, mis. 2000000"
                />
              </div>
              <div>
                <label className={LABEL}>Bagi Hasil per Sesi (IDR)</label>
                <input
                  inputMode="numeric"
                  className={FIELD}
                  value={bagiHasil}
                  onChange={(e) =>
                    setBagiHasil(e.target.value.replace(/[^\d]/g, ""))
                  }
                  placeholder="Opsional, mis. 10000"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 rounded-xl border border-border bg-muted/30 p-3 text-center">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Pendapatan
                </div>
                <div className="font-semibold text-foreground tabular-nums">
                  {formatIDR(srRevenue)}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Biaya
                </div>
                <div className="font-semibold text-foreground tabular-nums">
                  {formatIDR(srCosts)}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Profit
                </div>
                <div
                  className={
                    "font-semibold tabular-nums " +
                    (srProfit >= 0 ? "text-emerald-600" : "text-destructive")
                  }
                >
                  {formatIDR(srProfit)}
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Pendapatan = harga/sesi × jumlah sesi. Biaya = biaya sewa + (bagi
              hasil/sesi × jumlah sesi).
            </p>
          </>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-lg font-bold text-foreground">
          Freelance yang Bertugas
        </h2>
        {freelance.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Belum ada freelance aktif.{" "}
            <Link
              href="/admin/yeobo-booth/freelance"
              className="text-primary underline"
            >
              Tambah di master freelance
            </Link>
            .
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {freelance.map((f) => {
              const selected = selectedFreelance.has(f.id);
              return (
                <button
                  type="button"
                  key={f.id}
                  onClick={() => toggleFreelance(f.id)}
                  className={
                    selected
                      ? "px-3 py-1.5 rounded-full text-sm font-medium bg-primary text-primary-foreground border-2 border-primary"
                      : "px-3 py-1.5 rounded-full text-sm font-medium bg-card text-foreground border-2 border-border hover:border-foreground/40"
                  }
                >
                  {f.nama}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-lg font-bold text-foreground">
          Catatan Internal
        </h2>
        <textarea
          className={FIELD + " min-h-24"}
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          placeholder="Detail tambahan untuk operator…"
        />
        {editing && (
          <div>
            <label className={LABEL}>Status Sesi</label>
            <select
              className={FIELD}
              value={status}
              onChange={(e) => setStatus(e.target.value as BookingStatus)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {BOOKING_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      {/* Mode INLINE — selalu inline (mobile & desktop). Cocok untuk
          detail page di mana form bukan satu-satunya konten; menghindari
          sticky bar overlap section setelahnya (mis. Batalkan Booking).
          Di mobile stack vertikal (Simpan di atas, Batal di bawah). */}
      {!stickyMobileBar && (
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Link
            href={
              editing
                ? `/admin/yeobo-booth/bookings/${editing.id}`
                : "/admin/yeobo-booth/bookings"
            }
            className="px-4 py-2.5 sm:py-2 rounded-xl border-2 border-foreground/20 text-sm font-medium hover:bg-muted text-center"
          >
            Batal
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            <Save size={14} />
            {pending
              ? "Menyimpan…"
              : editing
                ? "Simpan Perubahan"
                : "Buat Booking"}
          </button>
        </div>
      )}

      {/* Mode STICKY — desktop inline, mobile sticky bottom bar. Cocok
          untuk /new page yang form-only — sticky bar selalu accessible
          tanpa scroll. */}
      {stickyMobileBar && (
        <>
          <div className="hidden md:flex justify-end gap-2">
            <Link
              href={
                editing
                  ? `/admin/yeobo-booth/bookings/${editing.id}`
                  : "/admin/yeobo-booth/bookings"
              }
              className="px-4 py-2 rounded-xl border-2 border-foreground/20 text-sm font-medium hover:bg-muted"
            >
              Batal
            </Link>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50"
            >
              <Save size={14} />
              {pending
                ? "Menyimpan…"
                : editing
                  ? "Simpan Perubahan"
                  : "Buat Booking"}
            </button>
          </div>

          <div className="md:hidden h-20" aria-hidden />
          <div
            className="md:hidden fixed left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t-2 border-foreground/15 px-4 py-3 flex gap-2"
            style={{
              bottom: "calc(3.75rem + env(safe-area-inset-bottom, 0px))",
            }}
          >
            <Link
              href={
                editing
                  ? `/admin/yeobo-booth/bookings/${editing.id}`
                  : "/admin/yeobo-booth/bookings"
              }
              className="px-4 py-2.5 rounded-xl border-2 border-foreground/20 text-sm font-medium hover:bg-muted shrink-0"
            >
              Batal
            </Link>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50"
            >
              <Save size={14} />
              {pending
                ? "Menyimpan…"
                : editing
                  ? "Simpan Perubahan"
                  : "Buat Booking"}
            </button>
          </div>
        </>
      )}
    </form>
  );
}
