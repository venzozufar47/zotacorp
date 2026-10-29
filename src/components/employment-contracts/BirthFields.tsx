"use client";

import { useEffect, useMemo, useState } from "react";
import { ID_PROVINCES } from "@/lib/utils/constants";
import {
  MONTHS_ID,
  cleanRegencyName,
  daysInMonth,
  formatTanggalLahir,
  parseTanggalLahir,
} from "@/lib/employment-contracts/birth";

const SELECT =
  "w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm disabled:opacity-50";

/**
 * Tanggal lahir lewat tiga dropdown (tanggal, bulan, tahun) — hasilnya selalu
 * "20 September 1999". Selama belum lengkap, nilai yang dilaporkan "" sehingga
 * validasi "wajib diisi" tetap menahan penandatanganan.
 */
export function BirthDatePicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const initial = parseTanggalLahir(value);
  const [d, setD] = useState(initial ? String(initial.d) : "");
  const [m, setM] = useState(initial ? String(initial.m) : "");
  const [y, setY] = useState(initial ? String(initial.y) : "");

  const thisYear = new Date().getFullYear();
  const years = useMemo(
    () => Array.from({ length: thisYear - 15 - 1940 + 1 }, (_, i) => thisYear - 15 - i),
    [thisYear]
  );
  const maxDay = m && y ? daysInMonth(Number(m), Number(y)) : m ? daysInMonth(Number(m), 2000) : 31;

  const emit = (nd: string, nm: string, ny: string) => {
    if (!nd || !nm || !ny) return onChange("");
    onChange(formatTanggalLahir({ d: Number(nd), m: Number(nm), y: Number(ny) }));
  };

  const change = (field: "d" | "m" | "y", v: string) => {
    let nd = d;
    let nm = m;
    let ny = y;
    if (field === "d") nd = v;
    if (field === "m") nm = v;
    if (field === "y") ny = v;
    // Bulan/tahun berubah → tanggal yang tidak ada di bulan itu (31 Feb) dibuang.
    if (nd && nm && Number(nd) > daysInMonth(Number(nm), ny ? Number(ny) : 2000)) nd = "";
    setD(nd);
    setM(nm);
    setY(ny);
    emit(nd, nm, ny);
  };

  return (
    <div className="grid grid-cols-[1fr_1.6fr_1.1fr] gap-2">
      <select
        aria-label="Tanggal lahir"
        value={d}
        onChange={(e) => change("d", e.target.value)}
        disabled={disabled}
        className={SELECT}
      >
        <option value="">Tgl</option>
        {Array.from({ length: maxDay }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <select
        aria-label="Bulan lahir"
        value={m}
        onChange={(e) => change("m", e.target.value)}
        disabled={disabled}
        className={SELECT}
      >
        <option value="">Bulan</option>
        {MONTHS_ID.map((name, i) => (
          <option key={name} value={i + 1}>
            {name}
          </option>
        ))}
      </select>
      <select
        aria-label="Tahun lahir"
        value={y}
        onChange={(e) => change("y", e.target.value)}
        disabled={disabled}
        className={SELECT}
      >
        <option value="">Tahun</option>
        {years.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </div>
  );
}

type Regency = { code: string; name: string };

/**
 * Tempat lahir lewat dropdown provinsi → kota/kabupaten (data wilayah.id, sama
 * dengan pemilih alamat profil). Nilai tersimpan nama polos ("Surakarta").
 * Nilai lama dari profil yang tidak ada di daftar tetap tampil sebagai pilihan
 * terpilih sampai karyawan memilih ulang.
 */
export function BirthPlacePicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [province, setProvince] = useState("");
  // Daftar hasil unduhan beserta kode provinsinya; "memuat" = provinsi sudah
  // dipilih tetapi daftar yang tersimpan milik provinsi lain.
  const [loaded, setLoaded] = useState<{ code: string; list: Regency[] }>({
    code: "",
    list: [],
  });
  const loading = !!province && loaded.code !== province;

  useEffect(() => {
    if (!province) return;
    let cancelled = false;
    fetch(`/api/wilayah/regencies/${province}.json`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j: { data?: Regency[] }) => {
        if (!cancelled) setLoaded({ code: province, list: j.data ?? [] });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ code: province, list: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [province]);

  // Nama polos, tanpa duplikat ("Kabupaten Bandung" dan "Kota Bandung" → "Bandung").
  const names = useMemo(() => {
    const list = loaded.code === province ? loaded.list : [];
    return Array.from(
      new Set(list.map((r) => cleanRegencyName(r.name)).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, "id"));
  }, [loaded, province]);
  const legacy = value && !names.includes(value);

  return (
    <div className="grid sm:grid-cols-2 gap-2">
      <select
        aria-label="Provinsi tempat lahir"
        value={province}
        onChange={(e) => {
          setProvince(e.target.value);
          onChange("");
        }}
        disabled={disabled}
        className={SELECT}
      >
        <option value="">Pilih provinsi…</option>
        {ID_PROVINCES.map((p) => (
          <option key={p.code} value={p.code}>
            {p.name}
          </option>
        ))}
      </select>
      {province && !loading && names.length === 0 ? (
        // Cadangan bila layanan daftar wilayah gagal dimuat: jangan sampai
        // karyawan terkunci tidak bisa menandatangani.
        <input
          aria-label="Kota atau kabupaten tempat lahir"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="Daftar gagal dimuat — ketik kota/kabupaten"
          className={SELECT}
        />
      ) : (
      <select
        aria-label="Kota atau kabupaten tempat lahir"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || (!!province && loading)}
        className={SELECT}
      >
        <option value="">
          {!province && !value
            ? "Pilih provinsi dulu"
            : loading
              ? "Memuat…"
              : "Pilih kota/kabupaten…"}
        </option>
        {legacy && <option value={value}>{value}</option>}
        {names.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      )}
    </div>
  );
}
