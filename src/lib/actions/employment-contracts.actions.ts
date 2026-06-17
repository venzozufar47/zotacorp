"use server";

import { createElement } from "react";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createAdminClient as adminClient } from "./_supabase-admin";
import { requireAdmin, requireSelfOrAdmin, type ActionResult } from "./_gates";
import { getCurrentUser } from "@/lib/supabase/cached";
import { sendWhatsApp } from "@/lib/whatsapp/fonnte";
import { terbilang } from "@/lib/employment-contracts/terbilang";
import { emptyLampiran } from "@/lib/employment-contracts/types";
import type {
  ContractFields,
  ContractLampiran,
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
    .select("kota, employer_name, employer_jabatan, employer_alamat")
    .eq("business_unit", bu)
    .maybeSingle();
  const t = tpl as unknown as Record<string, string | null> | null;

  const jabatan = p.position || p.job_role || "";
  const fields: ContractFields = {
    nomor: "",
    tahun: String(new Date().getFullYear()),
    kota: t?.kota ?? "",
    pemberi_nama: t?.employer_name ?? "",
    pemberi_jabatan: t?.employer_jabatan ?? "",
    pemberi_alamat: t?.employer_alamat ?? "",
    nama: p.full_name ?? "",
    nik: p.nik ?? "",
    tempat_lahir: p.place_of_birth ?? "",
    tgl_lahir: formatTanggalID(p.date_of_birth),
    alamat: p.domisili_alamat ?? "",
    jabatan,
    cabang: bu,
    tgl_mulai: formatTanggalID(p.first_day_of_work),
    tgl_berakhir: "",
    gaji_nominal: salary > 0 ? salary.toLocaleString("id-ID") : "",
    gaji_terbilang: salary > 0 ? terbilang(salary) : "",
    komponen_upah: "gaji pokok",
    periode_bayar: "bulanan",
    tgl_bayar: "",
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

  const { data, error } = await db
    .from("employment_contracts" as never)
    .insert({
      user_id: input.userId,
      template_id: tpl.id,
      business_unit: bu,
      contract_number: input.contractNumber?.trim() || input.fields.nomor || null,
      status: "pending_signature",
      body_markdown: tpl.body_markdown,
      kota: tpl.kota,
      employer_name: tpl.employer_name,
      employer_jabatan: tpl.employer_jabatan,
      employer_alamat: tpl.employer_alamat,
      employer_signature_path: tpl.employer_signature_path,
      fields: input.fields,
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
    pathToDataUrl(db, c.employer_signature_path),
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
  signerName: string;
  signerNik: string;
  consent: boolean;
}): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (!input.consent)
    return { ok: false, error: "Centang persetujuan terlebih dahulu" };
  if (!input.signerName.trim())
    return { ok: false, error: "Nama lengkap wajib diisi" };
  if (!input.signaturePath)
    return { ok: false, error: "Tanda tangan wajib" };

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

  // 1. Set tanda tangan + audit → status signed.
  const { error: updErr } = await db
    .from("employment_contracts" as never)
    .update({
      employee_signature_path: input.signaturePath,
      employee_signed_at: nowIso,
      employee_signer_name: input.signerName.trim(),
      employee_signer_nik: input.signerNik.trim() || null,
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
      pathToDataUrl(db, c.employer_signature_path),
      pathToDataUrl(db, input.signaturePath),
    ]);
    const { renderToBuffer } = await import("@react-pdf/renderer");
    const { ContractPdfDocument } = await import(
      "@/components/employment-contracts/ContractPdfDocument"
    );
    const element = createElement(ContractPdfDocument, {
      bodyMarkdown: c.body_markdown,
      fields: c.fields ?? {},
      lampiran: c.lampiran ?? emptyLampiran(),
      employerName: c.employer_name ?? c.fields?.pemberi_nama ?? "",
      employerRole: c.employer_jabatan ?? "",
      employeeName: input.signerName.trim(),
      employeeNik: input.signerNik.trim() || null,
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
