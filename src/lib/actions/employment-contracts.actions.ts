"use server";

import { createElement } from "react";
import { readFile } from "fs/promises";
import { join } from "path";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createAdminClient as adminClient } from "./_supabase-admin";
import { requireAdmin, requireSelfOrAdmin, type ActionResult } from "./_gates";
import { getCurrentUser } from "@/lib/supabase/cached";
import { sendWhatsApp } from "@/lib/whatsapp/fonnte";
import { terbilang } from "@/lib/employment-contracts/terbilang";
import { emptyLampiran } from "@/lib/employment-contracts/types";
import {
  EMPLOYER,
  TGL_BAYAR_DEFAULT,
} from "@/lib/employment-contracts/default-templates";
import type {
  ContractFields,
  ContractLampiran,
  ContractSignerIdentity,
  EmploymentContract,
  EmploymentContractStatus,
  EmploymentContractTemplate,
} from "@/lib/employment-contracts/types";

const PATHS = [
  "/admin/employment-contracts",
  "/kontrak",
  "/payslips",
  "/dashboard",
];
function revalidateAll() {
  for (const p of PATHS) revalidatePath(p);
}

function formatTanggalID(v: string | null | undefined): string {
  if (!v) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return v;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ── Templates (admin) ─────────────────────────────────────────────────

export async function listContractTemplates(): Promise<EmploymentContractTemplate[]> {
  const gate = await requireAdmin();
  if (!gate.ok) return [];
  const db = adminClient();
  const { data } = await db
    .from("employment_contract_templates" as never)
    .select("*")
    .order("business_unit", { ascending: true });
  return (data ?? []) as unknown as EmploymentContractTemplate[];
}

export interface UpsertTemplateInput {
  businessUnit: string;
  title?: string;
  bodyMarkdown: string;
  kota?: string | null;
  employerName?: string | null;
  employerJabatan?: string | null;
  employerAlamat?: string | null;
  employerSignaturePath?: string | null;
}

export async function upsertContractTemplate(
  input: UpsertTemplateInput
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!input.businessUnit.trim())
    return { ok: false, error: "Business unit wajib" };
  if (!input.bodyMarkdown.trim())
    return { ok: false, error: "Isi badan kontrak wajib" };
  const db = adminClient();
  const payload: Record<string, unknown> = {
    business_unit: input.businessUnit.trim(),
    title: input.title?.trim() || "Perjanjian Kerja",
    body_markdown: input.bodyMarkdown,
    kota: input.kota?.trim() || null,
    employer_name: input.employerName?.trim() || null,
    employer_jabatan: input.employerJabatan?.trim() || null,
    employer_alamat: input.employerAlamat?.trim() || null,
  };
  if (input.employerSignaturePath !== undefined)
    payload.employer_signature_path = input.employerSignaturePath;

  // Upsert by unique business_unit.
  const { data: existing } = await db
    .from("employment_contract_templates" as never)
    .select("id")
    .eq("business_unit", input.businessUnit.trim())
    .maybeSingle();
  const existId = (existing as unknown as { id: string } | null)?.id;
  let id = existId;
  if (existId) {
    const { error } = await db
      .from("employment_contract_templates" as never)
      .update(payload as never)
      .eq("id", existId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data, error } = await db
      .from("employment_contract_templates" as never)
      .insert({ ...payload, created_by: gate.userId } as never)
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Gagal" };
    id = (data as unknown as { id: string }).id;
  }
  revalidateAll();
  return { ok: true, data: { id: id! } };
}

// ── Prefill (admin) ───────────────────────────────────────────────────

export interface ContractPrefill {
  fields: ContractFields;
  lampiran: ContractLampiran;
  businessUnit: string;
  hasTemplate: boolean;
}

export async function prefillContractFields(
  userId: string
): Promise<ActionResult<ContractPrefill>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = adminClient();

  const { data: pRaw } = await db
    .from("profiles" as never)
    .select(
      "full_name, nik, place_of_birth, date_of_birth, domisili_alamat, position, job_role, business_unit, first_day_of_work"
    )
    .eq("id", userId)
    .maybeSingle();
  if (!pRaw) return { ok: false, error: "Karyawan tidak ditemukan" };
  const p = pRaw as unknown as Record<string, string | null>;
  const bu = p.business_unit ?? "";

  const { data: ps } = await db
    .from("payslip_settings" as never)
    .select("monthly_fixed_amount")
    .eq("user_id", userId)
    .maybeSingle();
  const salary = Number(
    (ps as unknown as { monthly_fixed_amount?: number } | null)
      ?.monthly_fixed_amount ?? 0
  );

  const { data: tpl } = await db
    .from("employment_contract_templates" as never)
    .select("kota")
    .eq("business_unit", bu)
    .maybeSingle();
  const t = tpl as unknown as Record<string, string | null> | null;

  // Tanggal otomatis sesuai saat kontrak dibuat (WIB).
  const now = new Date();
  const wib = (opt: Intl.DateTimeFormatOptions) =>
    now.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", ...opt });
  const yearNum = Number(
    now.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta", year: "numeric" })
  );

  // Nomor kontrak otomatis: urut per BU per tahun (lanjutan dari yang sudah ada).
  const { count } = await db
    .from("employment_contracts" as never)
    .select("id", { count: "exact", head: true })
    .eq("business_unit", bu)
    .gte("created_at", `${yearNum}-01-01`)
    .lt("created_at", `${yearNum + 1}-01-01`);
  const nomor = String((count ?? 0) + 1).padStart(3, "0");

  const jabatan = p.position || p.job_role || "";
  const fields: ContractFields = {
    nomor,
    hari: wib({ weekday: "long" }),
    tanggal: wib({ day: "numeric" }),
    bulan: wib({ month: "long" }),
    tahun: String(yearNum),
    kota: t?.kota ?? "",
    pemberi_nama: EMPLOYER.name,
    pemberi_jabatan: EMPLOYER.jabatan,
    pemberi_alamat: EMPLOYER.alamat,
    // Identitas pribadi dikosongkan — karyawan yang mengisi saat tanda
    // tangan (auto-prefill dari profil di sisi karyawan).
    nama: "",
    nik: "",
    tempat_lahir: "",
    tgl_lahir: "",
    alamat: "",
    jabatan,
    cabang: bu,
    tgl_mulai: formatTanggalID(p.first_day_of_work),
    tgl_berakhir: "",
    gaji_nominal: salary > 0 ? salary.toLocaleString("id-ID") : "",
    gaji_terbilang: salary > 0 ? terbilang(salary) : "",
    komponen_upah: "gaji pokok",
    periode_bayar: "bulanan",
    tgl_bayar: TGL_BAYAR_DEFAULT,
    cara_bayar: "transfer ke rekening Karyawan",
  };
  const lampiran = emptyLampiran();
  lampiran.nama = p.full_name ?? "";
  lampiran.posisi = jabatan;
  lampiran.cabang = bu;

  return {
    ok: true,
    data: { fields, lampiran, businessUnit: bu, hasTemplate: !!t },
  };
}

// ── Contracts list (admin) ────────────────────────────────────────────

export interface ContractListRow extends EmploymentContract {
  employee_name: string;
}

export async function listEmploymentContracts(): Promise<ContractListRow[]> {
  const gate = await requireAdmin();
  if (!gate.ok) return [];
  const db = adminClient();
  const { data } = await db
    .from("employment_contracts" as never)
    .select("*")
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as unknown as EmploymentContract[];
  if (rows.length === 0) return [];
  const ids = Array.from(new Set(rows.map((r) => r.user_id)));
  const { data: profs } = await db
    .from("profiles" as never)
    .select("id, full_name")
    .in("id", ids);
  const nameById = new Map(
    ((profs ?? []) as unknown as { id: string; full_name: string }[]).map(
      (p) => [p.id, p.full_name]
    )
  );
  return rows.map((r) => ({
    ...r,
    employee_name: nameById.get(r.user_id) ?? "—",
  }));
}

// ── Issue (admin) ─────────────────────────────────────────────────────

export interface IssueContractInput {
  userId: string;
  fields: ContractFields;
  lampiran: ContractLampiran;
  contractNumber?: string | null;
  notifyWhatsApp?: boolean;
}

export async function issueEmploymentContract(
  input: IssueContractInput
): Promise<ActionResult<{ contractId: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = adminClient();

  const { data: pRaw } = await db
    .from("profiles" as never)
    .select("business_unit, whatsapp_number, full_name")
    .eq("id", input.userId)
    .maybeSingle();
  if (!pRaw) return { ok: false, error: "Karyawan tidak ditemukan" };
  const prof = pRaw as unknown as {
    business_unit: string | null;
    whatsapp_number: string | null;
    full_name: string | null;
  };
  const bu = prof.business_unit ?? "";

  const { data: tplRaw } = await db
    .from("employment_contract_templates" as never)
    .select("*")
    .eq("business_unit", bu)
    .maybeSingle();
  const tpl = tplRaw as unknown as EmploymentContractTemplate | null;
  if (!tpl)
    return {
      ok: false,
      error: `Belum ada template kontrak untuk business unit "${bu}". Buat dulu di tab Template.`,
    };

  // Nomor SELALU di-generate otomatis & urut (per BU per tahun) supaya tidak
  // pernah bentrok — mis. saat menduplikasi kontrak lama.
  const yearNum = Number(
    new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
    })
  );
  const { count } = await db
    .from("employment_contracts" as never)
    .select("id", { count: "exact", head: true })
    .eq("business_unit", bu)
    .gte("created_at", `${yearNum}-01-01`)
    .lt("created_at", `${yearNum + 1}-01-01`);
  const nomor = String((count ?? 0) + 1).padStart(3, "0");
  const fields: ContractFields = { ...input.fields, nomor };

  const { data, error } = await db
    .from("employment_contracts" as never)
    .insert({
      user_id: input.userId,
      template_id: tpl.id,
      business_unit: bu,
      contract_number: nomor,
      status: "pending_signature",
      body_markdown: tpl.body_markdown,
      kota: tpl.kota,
      employer_name: EMPLOYER.name,
      employer_jabatan: EMPLOYER.jabatan,
      employer_alamat: EMPLOYER.alamat,
      employer_signature_path: tpl.employer_signature_path,
      fields,
      lampiran: input.lampiran,
      created_by: gate.userId,
    } as never)
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Gagal terbit" };
  const contractId = (data as unknown as { id: string }).id;

  if (input.notifyWhatsApp && prof.whatsapp_number) {
    const nama = prof.full_name?.split(" ")[0] ?? "Karyawan";
    void sendWhatsApp(
      prof.whatsapp_number,
      `Halo ${nama}, kontrak kerja kamu sudah siap untuk ditandatangani. Silakan buka aplikasi → menu Kontrak Kerja untuk membaca & menandatanganinya. Slip gaji akan terbuka setelah kontrak ditandatangani.`
    ).catch(() => {});
  }

  revalidateAll();
  return { ok: true, data: { contractId } };
}

// ── Bulk issue (admin) ────────────────────────────────────────────────

function gajiParts(v: string | number): { nominal: string; terbilang: string } {
  const n =
    typeof v === "number"
      ? Math.floor(v)
      : parseInt(String(v).replace(/[^\d]/g, ""), 10);
  if (!Number.isFinite(n) || n <= 0) return { nominal: "", terbilang: "" };
  return { nominal: n.toLocaleString("id-ID"), terbilang: terbilang(n) };
}

export interface BulkContractCommon {
  jabatan?: string;
  tgl_mulai?: string;
  kota?: string;
  komponen_upah?: string;
  periode_bayar?: string;
  cara_bayar?: string;
}
export interface BulkContractRow {
  userId: string;
  cabang: string;
  gaji: string; // angka (boleh ada pemisah ribuan)
  tglBerakhir: string;
  /** Waktu kerja / shift — berbeda tiap karyawan (override lampiran.shift). */
  shift?: string;
}

/**
 * Terbitkan kontrak untuk BANYAK karyawan sekaligus dengan nomor urut
 * otomatis (lanjutan dari yang sudah ada, per BU per tahun). Yang berbeda
 * per karyawan: cabang penempatan, gaji (+terbilang otomatis), tanggal
 * berakhir. Sisanya (common) sama. Identitas pribadi tetap diisi karyawan
 * saat tanda tangan.
 */
export async function bulkIssueEmploymentContracts(input: {
  businessUnit: string;
  common: BulkContractCommon;
  /** Lampiran 1 (jobdesc) bersama untuk semua kontrak di batch ini. */
  lampiran?: ContractLampiran;
  rows: BulkContractRow[];
  notifyWhatsApp?: boolean;
}): Promise<ActionResult<{ issued: number }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const bu = input.businessUnit.trim();
  if (!bu) return { ok: false, error: "Business unit wajib" };
  const rows = input.rows.filter((r) => r.userId);
  if (rows.length === 0) return { ok: false, error: "Tidak ada karyawan dipilih" };

  const db = adminClient();
  const { data: tplRaw } = await db
    .from("employment_contract_templates" as never)
    .select("*")
    .eq("business_unit", bu)
    .maybeSingle();
  const tpl = tplRaw as unknown as EmploymentContractTemplate | null;
  if (!tpl)
    return {
      ok: false,
      error: `Belum ada template kontrak untuk "${bu}". Buat dulu di tab Template.`,
    };

  // Tanggal otomatis + nomor urut (lanjut dari yang sudah ada tahun ini).
  const now = new Date();
  const wib = (opt: Intl.DateTimeFormatOptions) =>
    now.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", ...opt });
  const yearNum = Number(
    now.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta", year: "numeric" })
  );
  const { count } = await db
    .from("employment_contracts" as never)
    .select("id", { count: "exact", head: true })
    .eq("business_unit", bu)
    .gte("created_at", `${yearNum}-01-01`)
    .lt("created_at", `${yearNum + 1}-01-01`);
  let seq = count ?? 0;

  const common = input.common;
  const dateBase = {
    hari: wib({ weekday: "long" }),
    tanggal: wib({ day: "numeric" }),
    bulan: wib({ month: "long" }),
    tahun: String(yearNum),
  };

  // Daftar nomor WA penerima (untuk notifikasi).
  const ids = rows.map((r) => r.userId);
  const { data: profsRaw } = await db
    .from("profiles" as never)
    .select("id, full_name, whatsapp_number")
    .in("id", ids);
  const profById = new Map(
    ((profsRaw ?? []) as unknown as {
      id: string;
      full_name: string | null;
      whatsapp_number: string | null;
    }[]).map((p) => [p.id, p])
  );

  const toInsert = rows.map((r) => {
    seq += 1;
    const nomor = String(seq).padStart(3, "0");
    const g = gajiParts(r.gaji);
    const fields: ContractFields = {
      nomor,
      ...dateBase,
      kota: common.kota?.trim() || tpl.kota || "",
      pemberi_nama: EMPLOYER.name,
      pemberi_jabatan: EMPLOYER.jabatan,
      pemberi_alamat: EMPLOYER.alamat,
      nama: "",
      nik: "",
      tempat_lahir: "",
      tgl_lahir: "",
      alamat: "",
      jabatan: common.jabatan?.trim() || "",
      cabang: r.cabang.trim(),
      tgl_mulai: common.tgl_mulai?.trim() || "",
      tgl_berakhir: r.tglBerakhir.trim(),
      gaji_nominal: g.nominal,
      gaji_terbilang: g.terbilang,
      komponen_upah: common.komponen_upah?.trim() || "gaji pokok",
      periode_bayar: common.periode_bayar?.trim() || "bulanan",
      tgl_bayar: TGL_BAYAR_DEFAULT,
      cara_bayar: common.cara_bayar?.trim() || "transfer ke rekening Karyawan",
    };
    return {
      user_id: r.userId,
      template_id: tpl.id,
      business_unit: bu,
      contract_number: nomor,
      status: "pending_signature",
      body_markdown: tpl.body_markdown,
      kota: fields.kota,
      employer_name: EMPLOYER.name,
      employer_jabatan: EMPLOYER.jabatan,
      employer_alamat: EMPLOYER.alamat,
      employer_signature_path: tpl.employer_signature_path,
      fields,
      // Lampiran bersama, KECUALI shift yang berbeda tiap karyawan.
      lampiran: {
        ...(input.lampiran ?? emptyLampiran()),
        shift: r.shift?.trim()
          ? [r.shift.trim()]
          : input.lampiran?.shift ?? [""],
      },
      created_by: gate.userId,
    };
  });

  const { error } = await db
    .from("employment_contracts" as never)
    .insert(toInsert as never);
  if (error) return { ok: false, error: error.message };

  if (input.notifyWhatsApp) {
    for (const r of rows) {
      const p = profById.get(r.userId);
      if (!p?.whatsapp_number) continue;
      const nama = p.full_name?.split(" ")[0] ?? "Karyawan";
      void sendWhatsApp(
        p.whatsapp_number,
        `Halo ${nama}, kontrak kerja kamu sudah siap untuk ditandatangani. Silakan buka aplikasi → menu Kontrak Kerja untuk membaca & menandatanganinya. Slip gaji akan terbuka setelah kontrak ditandatangani.`
      ).catch(() => {});
    }
  }

  revalidateAll();
  return { ok: true, data: { issued: toInsert.length } };
}

export async function updateEmploymentContract(
  id: string,
  patch: {
    fields?: ContractFields;
    lampiran?: ContractLampiran;
    contractNumber?: string | null;
    status?: EmploymentContractStatus;
  }
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = adminClient();
  const upd: Record<string, unknown> = {};
  if (patch.fields) upd.fields = patch.fields;
  if (patch.lampiran) upd.lampiran = patch.lampiran;
  if (patch.contractNumber !== undefined)
    upd.contract_number = patch.contractNumber?.trim() || null;
  if (patch.status) upd.status = patch.status;
  if (Object.keys(upd).length === 0) return { ok: true };
  const { error } = await db
    .from("employment_contracts" as never)
    .update(upd as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true };
}

export async function deleteEmploymentContract(id: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = adminClient();
  const { error } = await db
    .from("employment_contracts" as never)
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true };
}

// ── Employee read + gate ──────────────────────────────────────────────

export async function getMyContract(): Promise<EmploymentContract | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const db = adminClient();
  const { data } = await db
    .from("employment_contracts" as never)
    .select("*")
    .eq("user_id", user.id)
    .in("status", ["pending_signature", "signed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as unknown as EmploymentContract | null) ?? null;
}

/**
 * Auto-prefill identitas pribadi untuk form tanda tangan karyawan — diambil
 * dari profil sendiri (yang sudah tersedia). Karyawan tetap wajib melengkapi
 * yang kosong sebelum menandatangani.
 */
export async function getContractSignerPrefill(): Promise<ContractSignerIdentity> {
  const empty: ContractSignerIdentity = {
    nama: "",
    nik: "",
    tempat_lahir: "",
    tgl_lahir: "",
    alamat: "",
  };
  const user = await getCurrentUser();
  if (!user) return empty;
  const db = adminClient();
  const { data } = await db
    .from("profiles" as never)
    .select("full_name, nik, place_of_birth, date_of_birth, domisili_alamat")
    .eq("id", user.id)
    .maybeSingle();
  const p = data as unknown as Record<string, string | null> | null;
  if (!p) return empty;
  return {
    nama: p.full_name ?? "",
    nik: p.nik ?? "",
    tempat_lahir: p.place_of_birth ?? "",
    tgl_lahir: formatTanggalID(p.date_of_birth),
    alamat: p.domisili_alamat ?? "",
  };
}

/** Dipakai gate slip gaji: kontrak yang masih menunggu tanda tangan. */
export async function getMyPendingContract(): Promise<{
  id: string;
} | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const db = adminClient();
  const { data } = await db
    .from("employment_contracts" as never)
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "pending_signature")
    .limit(1)
    .maybeSingle();
  return (data as unknown as { id: string } | null) ?? null;
}

// ── Storage helpers ───────────────────────────────────────────────────

async function pathToDataUrl(
  db: ReturnType<typeof adminClient>,
  path: string | null
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await db.storage
    .from("employment-contracts")
    .download(path);
  if (error || !data) return null;
  const buf = Buffer.from(await data.arrayBuffer());
  return `data:image/png;base64,${buf.toString("base64")}`;
}

/**
 * Tanda tangan PIHAK PERTAMA (Pemberi Kerja). Prioritas: file statis di
 * `public/signatures/Sign_Avenzoar_Transparant.png` (hardcode); kalau tak
 * ada, fallback ke gambar yang diupload ke storage (template TTD pad).
 */
const EMPLOYER_SIG_FILE = join(
  process.cwd(),
  "public",
  "signatures",
  "Sign_Avenzoar_Transparant.png"
);
async function employerSignatureDataUrl(
  db: ReturnType<typeof adminClient>,
  storagePath: string | null
): Promise<string | null> {
  try {
    const buf = await readFile(EMPLOYER_SIG_FILE);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return pathToDataUrl(db, storagePath);
  }
}

/** Signed URL untuk objek di bucket (PDF / tanda tangan). */
export async function getContractSignedUrl(
  contractId: string,
  which: "pdf" | "employee" | "employer"
): Promise<ActionResult<{ url: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const db = adminClient();
  const { data: cRaw } = await db
    .from("employment_contracts" as never)
    .select("user_id, signed_pdf_path, employee_signature_path, employer_signature_path")
    .eq("id", contractId)
    .maybeSingle();
  const c = cRaw as unknown as {
    user_id: string;
    signed_pdf_path: string | null;
    employee_signature_path: string | null;
    employer_signature_path: string | null;
  } | null;
  if (!c) return { ok: false, error: "Kontrak tidak ditemukan" };
  const gate = await requireSelfOrAdmin(c.user_id);
  if (!gate.ok) return { ok: false, error: gate.error };
  const path =
    which === "pdf"
      ? c.signed_pdf_path
      : which === "employee"
        ? c.employee_signature_path
        : c.employer_signature_path;
  if (!path) return { ok: false, error: "File tidak ada" };
  const { data, error } = await db.storage
    .from("employment-contracts")
    .createSignedUrl(path, 3600);
  if (error || !data) return { ok: false, error: error?.message ?? "Gagal sign URL" };
  return { ok: true, data: { url: data.signedUrl } };
}

/** Data untuk render PDF di klien (preview): badan + data URL tanda tangan. */
export interface ContractRenderData {
  bodyMarkdown: string;
  fields: ContractFields;
  lampiran: ContractLampiran;
  employerName: string;
  employerRole: string;
  employeeName: string;
  employeeNik: string | null;
  signedAt: string | null;
  employerSignatureDataUrl: string | null;
  employeeSignatureDataUrl: string | null;
}

export async function getContractRenderData(
  contractId: string
): Promise<ActionResult<ContractRenderData>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const db = adminClient();
  const { data: cRaw } = await db
    .from("employment_contracts" as never)
    .select("*")
    .eq("id", contractId)
    .maybeSingle();
  const c = cRaw as unknown as EmploymentContract | null;
  if (!c) return { ok: false, error: "Kontrak tidak ditemukan" };
  const gate = await requireSelfOrAdmin(c.user_id);
  if (!gate.ok) return { ok: false, error: gate.error };

  const [employerUrl, employeeUrl] = await Promise.all([
    employerSignatureDataUrl(db, c.employer_signature_path),
    pathToDataUrl(db, c.employee_signature_path),
  ]);
  return {
    ok: true,
    data: {
      bodyMarkdown: c.body_markdown,
      fields: c.fields ?? {},
      lampiran: c.lampiran ?? emptyLampiran(),
      employerName: c.employer_name ?? c.fields?.pemberi_nama ?? "",
      employerRole: c.employer_jabatan ?? c.fields?.pemberi_jabatan ?? "",
      employeeName: c.employee_signer_name ?? c.fields?.nama ?? "",
      employeeNik: c.employee_signer_nik ?? c.fields?.nik ?? null,
      signedAt: c.employee_signed_at,
      employerSignatureDataUrl: employerUrl,
      employeeSignatureDataUrl: employeeUrl,
    },
  };
}

// ── Sign (employee) ───────────────────────────────────────────────────

export async function signEmploymentContract(input: {
  contractId: string;
  signaturePath: string;
  identity: ContractSignerIdentity;
  consent: boolean;
}): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (!input.consent)
    return { ok: false, error: "Centang persetujuan terlebih dahulu" };
  if (!input.signaturePath)
    return { ok: false, error: "Tanda tangan wajib" };

  // Identitas pribadi WAJIB lengkap.
  const id = {
    nama: input.identity.nama?.trim() ?? "",
    nik: input.identity.nik?.trim() ?? "",
    tempat_lahir: input.identity.tempat_lahir?.trim() ?? "",
    tgl_lahir: input.identity.tgl_lahir?.trim() ?? "",
    alamat: input.identity.alamat?.trim() ?? "",
  };
  const LABELS: Record<keyof typeof id, string> = {
    nama: "Nama lengkap",
    nik: "NIK",
    tempat_lahir: "Tempat lahir",
    tgl_lahir: "Tanggal lahir",
    alamat: "Alamat",
  };
  for (const k of Object.keys(id) as (keyof typeof id)[]) {
    if (!id[k]) return { ok: false, error: `${LABELS[k]} wajib diisi` };
  }

  const db = adminClient();
  const { data: cRaw } = await db
    .from("employment_contracts" as never)
    .select("*")
    .eq("id", input.contractId)
    .maybeSingle();
  const c = cRaw as unknown as EmploymentContract | null;
  if (!c) return { ok: false, error: "Kontrak tidak ditemukan" };
  if (c.user_id !== user.id) return { ok: false, error: "Forbidden" };
  if (c.status !== "pending_signature")
    return { ok: false, error: "Kontrak sudah ditandatangani / tidak aktif" };

  const h = await headers();
  const ua = h.get("user-agent")?.slice(0, 400) ?? null;
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null;
  const nowIso = new Date().toISOString();

  // Gabungkan identitas yang diisi karyawan ke fields (dipakai badan PDF).
  const mergedFields: ContractFields = { ...(c.fields ?? {}), ...id };

  // 1. Set identitas + tanda tangan + audit → status signed.
  const { error: updErr } = await db
    .from("employment_contracts" as never)
    .update({
      fields: mergedFields,
      employee_signature_path: input.signaturePath,
      employee_signed_at: nowIso,
      employee_signer_name: id.nama,
      employee_signer_nik: id.nik,
      consent_ip: ip,
      consent_user_agent: ua,
      status: "signed",
    } as never)
    .eq("id", input.contractId);
  if (updErr) return { ok: false, error: updErr.message };

  // 2. Bekukan PDF immutable (best-effort — kegagalan tidak meng-undo TTD;
  //    PDF bisa diregenerasi dari data tersimpan).
  try {
    const [employerUrl, employeeUrl] = await Promise.all([
      employerSignatureDataUrl(db, c.employer_signature_path),
      pathToDataUrl(db, input.signaturePath),
    ]);
    const { renderToBuffer } = await import("@react-pdf/renderer");
    const { ContractPdfDocument } = await import(
      "@/components/employment-contracts/ContractPdfDocument"
    );
    const element = createElement(ContractPdfDocument, {
      bodyMarkdown: c.body_markdown,
      fields: mergedFields,
      lampiran: c.lampiran ?? emptyLampiran(),
      employerName: c.employer_name ?? c.fields?.pemberi_nama ?? "",
      employerRole: c.employer_jabatan ?? "",
      employeeName: id.nama,
      employeeNik: id.nik || null,
      signedAt: nowIso,
      employerSignatureDataUrl: employerUrl,
      employeeSignatureDataUrl: employeeUrl,
    });
    const buffer = await renderToBuffer(
      element as unknown as Parameters<typeof renderToBuffer>[0]
    );
    const pdfPath = `${input.contractId}/signed-${crypto.randomUUID()}.pdf`;
    await db.storage
      .from("employment-contracts")
      .upload(pdfPath, buffer, { contentType: "application/pdf", upsert: false });
    await db
      .from("employment_contracts" as never)
      .update({ signed_pdf_path: pdfPath } as never)
      .eq("id", input.contractId);
  } catch (e) {
    console.error("[contract] PDF freeze failed", e);
  }

  revalidateAll();
  return { ok: true };
}

/** Set tanda tangan Pemberi Kerja di template (sekali per BU). */
export async function setTemplateEmployerSignature(
  businessUnit: string,
  signaturePath: string
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = adminClient();
  const { error } = await db
    .from("employment_contract_templates" as never)
    .update({ employer_signature_path: signaturePath } as never)
    .eq("business_unit", businessUnit);
  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true };
}
