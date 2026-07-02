/**
 * Domain types untuk sistem Kontrak Kerja (Perjanjian Kerja). Hand-maintained
 * (tidak regen generated types) — query pakai `.from("x" as never)`.
 */

export type EmploymentContractStatus =
  | "draft"
  | "pending_signature"
  | "signed"
  | "terminated";

/** Template badan kontrak per business unit (1 per BU). */
export interface EmploymentContractTemplate {
  id: string;
  business_unit: string;
  title: string;
  body_markdown: string;
  kota: string | null;
  employer_name: string | null;
  employer_jabatan: string | null;
  employer_alamat: string | null;
  employer_signature_path: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Placeholder badan kontrak. Semua string supaya admin bebas mengisi.
 * Token dipakai di body_markdown sebagai `{key}` (lihat fillContractBody).
 */
export type ContractFieldKey =
  | "nomor"
  | "hari"
  | "tanggal"
  | "bulan"
  | "tahun"
  | "kota"
  | "pemberi_nama"
  | "pemberi_jabatan"
  | "pemberi_alamat"
  | "nama"
  | "nik"
  | "tempat_lahir"
  | "tgl_lahir"
  | "alamat"
  | "jabatan"
  | "cabang"
  | "tgl_mulai"
  | "tgl_berakhir"
  | "gaji_nominal"
  | "gaji_terbilang"
  | "komponen_upah"
  | "periode_bayar"
  | "tgl_bayar"
  | "cara_bayar";

export type ContractFields = Partial<Record<ContractFieldKey, string>>;

/** Label + grup untuk form pengisian placeholder di dashboard admin. */
// Field yang bisa diisi admin di form penerbitan. IDENTITAS PRIBADI karyawan
// (nama, NIK, tempat/tanggal lahir, alamat) TIDAK ada di sini — itu diisi
// sendiri oleh karyawan saat menandatangani. Data Pemberi Kerja & tanggal
// bayar (hardcode), serta nomor/hari/tanggal/bulan (auto-isi) juga tidak
// ditampilkan sebagai input manual.
export const CONTRACT_FIELD_DEFS: Array<{
  key: ContractFieldKey;
  label: string;
  group: "Nomor & Tanggal" | "Jabatan" | "Upah";
}> = [
  { key: "nomor", label: "Nomor kontrak (auto)", group: "Nomor & Tanggal" },
  { key: "hari", label: "Hari (auto)", group: "Nomor & Tanggal" },
  { key: "tanggal", label: "Tanggal (auto)", group: "Nomor & Tanggal" },
  { key: "bulan", label: "Bulan (auto)", group: "Nomor & Tanggal" },
  { key: "tahun", label: "Tahun (auto)", group: "Nomor & Tanggal" },
  { key: "kota", label: "Kota", group: "Nomor & Tanggal" },
  { key: "jabatan", label: "Jabatan/posisi", group: "Jabatan" },
  { key: "cabang", label: "Cabang penempatan", group: "Jabatan" },
  { key: "tgl_mulai", label: "Tanggal mulai", group: "Jabatan" },
  { key: "tgl_berakhir", label: "Tanggal berakhir", group: "Jabatan" },
  { key: "gaji_nominal", label: "Nominal gaji (angka)", group: "Upah" },
  { key: "gaji_terbilang", label: "Terbilang", group: "Upah" },
  { key: "komponen_upah", label: "Komponen upah", group: "Upah" },
  { key: "periode_bayar", label: "Periode bayar (bulanan/mingguan)", group: "Upah" },
  { key: "cara_bayar", label: "Cara bayar", group: "Upah" },
];

/** Identitas pribadi yang WAJIB diisi karyawan saat menandatangani. */
export interface ContractSignerIdentity {
  nama: string;
  nik: string;
  tempat_lahir: string;
  tgl_lahir: string;
  alamat: string;
}

/** Lampiran 1: Deskripsi Pekerjaan (jobdesc) — beda tiap karyawan. */
export interface ContractLampiran {
  nama?: string;
  posisi?: string;
  cabang?: string;
  tujuan: string[];
  tanggung_jawab: string[];
  sop: string[];
  kpi: string[];
  shift: string[];
}

export function emptyLampiran(): ContractLampiran {
  return {
    nama: "",
    posisi: "",
    cabang: "",
    tujuan: [""],
    tanggung_jawab: [""],
    sop: [""],
    kpi: [""],
    shift: [""],
  };
}

/** Penerbitan kontrak per karyawan (row employment_contracts). */
export interface EmploymentContract {
  id: string;
  user_id: string;
  template_id: string | null;
  business_unit: string;
  contract_number: string | null;
  status: EmploymentContractStatus;
  body_markdown: string;
  kota: string | null;
  employer_name: string | null;
  employer_jabatan: string | null;
  employer_alamat: string | null;
  employer_signature_path: string | null;
  fields: ContractFields;
  lampiran: ContractLampiran;
  employee_signature_path: string | null;
  employee_signed_at: string | null;
  employee_signer_name: string | null;
  employee_signer_nik: string | null;
  consent_ip: string | null;
  consent_user_agent: string | null;
  signed_pdf_path: string | null;
  /** Versi isi kontrak saat ini (naik tiap ada revisi). */
  version: number;
  /** Versi yang ditandatangani karyawan (null = belum pernah TTD). */
  signed_version: number | null;
  /** Ringkasan perubahan versi terbaru — ditampilkan saat karyawan perlu TTD ulang. */
  update_note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const CONTRACT_STATUS_LABELS: Record<EmploymentContractStatus, string> = {
  draft: "Draft",
  pending_signature: "Menunggu tanda tangan",
  signed: "Sudah ditandatangani",
  terminated: "Diakhiri",
};

/**
 * State tanda tangan turunan dari (status, version, signed_version):
 *  - "unsigned"        : belum pernah ditandatangani (pending)
 *  - "update_required" : sudah TTD tapi versi lama — perlu TTD ulang
 *  - "signed_current"  : sudah TTD versi terbaru (beres)
 *  - "inactive"        : draft / terminated (tidak butuh aksi karyawan)
 */
export type ContractSignState =
  | "unsigned"
  | "update_required"
  | "signed_current"
  | "inactive";

export function contractSignState(c: {
  status: EmploymentContractStatus;
  version?: number | null;
  signed_version?: number | null;
}): ContractSignState {
  if (c.status === "pending_signature") return "unsigned";
  if (c.status === "signed") {
    const v = c.version ?? 1;
    const sv = c.signed_version ?? 0;
    return sv < v ? "update_required" : "signed_current";
  }
  return "inactive";
}

/** True bila karyawan perlu (menandatangani / menandatangani ulang) kontrak. */
export function contractNeedsSignature(c: {
  status: EmploymentContractStatus;
  version?: number | null;
  signed_version?: number | null;
}): boolean {
  const s = contractSignState(c);
  return s === "unsigned" || s === "update_required";
}
