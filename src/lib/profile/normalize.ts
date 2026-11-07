/**
 * Pembersih isian profil (nama, nama panggilan, kontak, NPWP). Satu aturan,
 * dipakai di form (klien), API profil (server), dan dicerminkan oleh trigger
 * `profiles_normalize` di database (migrasi 318). Ubah aturan di sini DAN di
 * migrasi itu sekaligus, supaya hasil klien dan hasil database sama.
 *
 * Fungsi `clean*` mengembalikan `{ ok: true, value }` atau `{ ok: false, error }`.
 * Format yang bisa dibenahi otomatis (huruf besar-kecil, spasi, tanda baca
 * pembatas) dibenahi diam-diam; isi yang salah arti (angka di nama, nomor
 * telepon di kolom nama) ditolak dengan pesan.
 */

export type Cleaned =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

const ok = (value: string | null): Cleaned => ({ ok: true, value });
const fail = (error: string): Cleaned => ({ ok: false, error });

/** Rapikan spasi: NFC, apostrof lengkung → lurus, spasi ganda dan ujung dibuang. */
function tidy(input: string): string {
  return input
    .normalize("NFC")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Huruf awal besar per kata; cermin `normalize_person_name` di database
 * (migrasi 187, diperluas di 318). Pemisah kata: spasi, "-", ".", "(", ")".
 * Huruf setelah apostrof tidak dibesarkan ("A'yunin"). CamelCase yang disengaja
 * dibiarkan ("McDonald", "DeAndre"); "DEVI" → "Devi", "ibu" → "Ibu".
 */
export function titleCaseName(input: string): string {
  return input.replace(/[^\s\-().]+/g, (w) => {
    if (/^\p{Lu}\p{Ll}+.*\p{Lu}/u.test(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  });
}

/** Nama lengkap: huruf, spasi, apostrof, titik, dan "-" di dalam kata (mis. Al-Ayyubi). */
export function cleanFullName(input: string): Cleaned {
  const s = tidy(input);
  if (s === "") return fail("Nama lengkap wajib diisi.");
  if (/[^\p{L}\p{M}\s'.-]/u.test(s)) {
    return fail(
      "Nama hanya boleh berisi huruf, spasi, apostrof, dan titik. Angka, emoji, dan simbol lain tidak dipakai."
    );
  }
  if (/(^|\s)-|-($|\s)/.test(s)) {
    return fail(
      'Tanda "-" hanya boleh di dalam kata (mis. Al-Ayyubi), bukan sebagai pemisah. Tulis nama panggilan di kolom Nama Panggilan.'
    );
  }
  if (s.length < 2) return fail("Nama lengkap terlalu pendek.");
  if (s.length > 100) return fail("Nama lengkap maksimal 100 karakter.");
  return ok(titleCaseName(s));
}

/** Nama panggilan: hanya dirapikan. Emoji dan simbol dibuang, kosong jadi null. */
export function cleanNickname(input: string): Cleaned {
  const s = tidy(input.replace(/[^\p{L}\p{M}\s'.-]/gu, ""));
  if (s === "") return ok(null);
  if (s.length > 30) return fail("Nama panggilan maksimal 30 karakter.");
  return ok(titleCaseName(s));
}

/** Nama kontak darurat. Boleh "Ibu", "Djumroni (Ayah)"; tanda strip/nol jadi kosong. */
export function cleanContactName(input: string): Cleaned {
  const s = tidy(input);
  if (s === "" || /^[-0\s]+$/.test(s)) return ok(null);
  if (/^[\d\s+().-]+$/.test(s)) {
    return fail("Isi nama kontak (mis. Ibu atau Budi), bukan nomor telepon.");
  }
  if (s.length > 100) return fail("Nama kontak maksimal 100 karakter.");
  return ok(titleCaseName(s));
}

/** Tempat lahir: huruf awal besar per kata, "Kab.Semarang" → "Kab. Semarang". */
export function cleanPlace(input: string): Cleaned {
  const s = tidy(input).replace(/\.(?=\p{L})/gu, ". ");
  if (s === "" || /^[-0\s]+$/.test(s)) return ok(null);
  if (s.length > 100) return fail("Tempat lahir maksimal 100 karakter.");
  return ok(titleCaseName(s));
}

/**
 * Nomor WhatsApp ke bentuk baku "+62…". Menerima 08…, 8…, 62…, +62… dengan
 * spasi atau tanda hubung. Hanya nomor seluler Indonesia; kosong/nol jadi null.
 */
export function cleanWhatsapp(input: string, label = "Nomor WhatsApp"): Cleaned {
  let d = input.replace(/\D/g, "");
  if (d === "" || /^0+$/.test(d)) return ok(null);
  if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("8")) d = "62" + d;
  if (!/^628\d{8,11}$/.test(d)) {
    return fail(`${label} tidak valid. Gunakan nomor seluler Indonesia, mis. 0812 3456 7890.`);
  }
  return ok("+" + d);
}

/** NPWP: hanya digit (15 atau 16). Strip, nol, atau teks seperti "Tidak ada" jadi kosong. */
export function cleanNpwp(input: string): Cleaned {
  const d = input.replace(/\D/g, "");
  if (d === "" || /^0+$/.test(d)) return ok(null);
  if (d.length !== 15 && d.length !== 16) {
    return fail("NPWP harus 15 atau 16 digit. Kosongkan bila belum punya.");
  }
  return ok(d);
}

const FIELD_CLEANERS: Record<string, (v: string) => Cleaned> = {
  full_name: cleanFullName,
  nickname: cleanNickname,
  emergency_contact_name: cleanContactName,
  place_of_birth: cleanPlace,
  whatsapp_number: (v) => cleanWhatsapp(v, "Nomor WhatsApp"),
  emergency_contact_whatsapp: (v) => cleanWhatsapp(v, "Nomor WhatsApp kontak darurat"),
  npwp: cleanNpwp,
};

/**
 * Bersihkan semua kolom bertanda di `fields` (hanya yang ada dan berupa string).
 * Kolom lain lewat apa adanya. `errors` memuat pesan per kolom yang ditolak.
 */
export function cleanProfileFields<T extends Record<string, unknown>>(
  fields: T
): { values: T; errors: Partial<Record<string, string>> } {
  const values: Record<string, unknown> = { ...fields };
  const errors: Partial<Record<string, string>> = {};
  for (const [key, clean] of Object.entries(FIELD_CLEANERS)) {
    const raw = values[key];
    if (typeof raw !== "string") continue;
    const res = clean(raw);
    if (res.ok) values[key] = res.value;
    else errors[key] = res.error;
  }
  return { values: values as T, errors };
}
