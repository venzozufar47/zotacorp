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
  YeoboBoothBookingWithFreelance,
  YeoboBoothFreelance,
} from "@/lib/yeobo-booth/types";
import { BOOKING_STATUS_LABEL } from "@/lib/yeobo-booth/types";

interface Props {
  freelance: YeoboBoothFreelance[];
  editing?: YeoboBoothBookingWithFreelance;
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

export function BookingForm({ freelance, editing }: Props) {
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
  const [hargaTotal, setHargaTotal] = useState<string>(
    editing ? String(editing.harga_total) : ""
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

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const harga = Number(hargaTotal.replace(/[^\d]/g, ""));
    if (!Number.isFinite(harga) || harga <= 0) {
      toast.error("Harga total wajib diisi");
      return;
    }
    const payload = {
      nama_klien: namaKlien.trim(),
      no_hp_klien: noHpKlien.trim() || null,
      tanggal,
      jam_mulai: jamMulai,
      jam_selesai: jamSelesai,
      lokasi_event: lokasi.trim() || null,
      harga_total: harga,
      catatan: catatan.trim() || null,
      freelance_ids: Array.from(selectedFreelance),
    };
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
          Harga & Pembayaran
        </h2>
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
            required
          />
          <p className="text-xs text-muted-foreground mt-1">
            DP & pelunasan dicatat terpisah lewat panel pembayaran setelah
            booking dibuat.
          </p>
        </div>
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

      {/* Desktop: inline justify-end. Mobile: sticky bottom bar di atas
          AdminMobileNav (h-14 + safe-area). Tambah spacer di mobile
          supaya konten terakhir tidak ketutup. */}
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
          {pending ? "Menyimpan…" : editing ? "Simpan Perubahan" : "Buat Booking"}
        </button>
      </div>

      {/* Mobile sticky action bar */}
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
          {pending ? "Menyimpan…" : editing ? "Simpan Perubahan" : "Buat Booking"}
        </button>
      </div>
    </form>
  );
}
