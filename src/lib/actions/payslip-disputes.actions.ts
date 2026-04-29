"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";

export type DisputeField =
  | "monthly_fixed_amount"
  | "calculation_basis"
  | "expected_days";

export interface DisputeRow {
  id: string;
  userId: string;
  field: DisputeField;
  currentValue: string | null;
  message: string;
  status: "open" | "resolved" | "dismissed";
  adminResponse: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

/** Karyawan submit laporan kesalahan terhadap satu setting payslip-nya. */
export async function submitPayslipDispute(input: {
  field: DisputeField;
  currentValue: string;
  message: string;
}): Promise<{ ok: true } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };
  const message = input.message.trim();
  if (!message) return { error: "Pesan wajib diisi" };

  const supabase = await createClient();
  const { error } = await supabase.from("payslip_settings_disputes").insert({
    user_id: user.id,
    field: input.field,
    current_value: input.currentValue,
    message,
  });
  if (error) return { error: error.message };

  revalidatePath("/payslips");
  revalidatePath("/admin/payslips");
  revalidatePath("/admin/payslips/variables");
  return { ok: true };
}

/** Karyawan: list dispute miliknya sendiri (open + resolved riwayat). */
export async function listMyPayslipDisputes(): Promise<DisputeRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("payslip_settings_disputes")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []).map(toDispute);
}

/** Admin: list semua dispute open. */
export async function listOpenPayslipDisputes(): Promise<DisputeRow[]> {
  const role = await getCurrentRole();
  if (role !== "admin") return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("payslip_settings_disputes")
    .select("*")
    .eq("status", "open")
    .order("created_at", { ascending: false });
  return (data ?? []).map(toDispute);
}

/** Karyawan: hapus laporan miliknya sendiri (riwayat). */
export async function deleteMyPayslipDispute(
  id: string
): Promise<{ ok: true } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("payslip_settings_disputes")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/payslips");
  return { ok: true };
}

export async function resolvePayslipDispute(input: {
  id: string;
  status: "resolved" | "dismissed";
  adminResponse?: string;
}): Promise<{ ok: true } | { error: string }> {
  const role = await getCurrentRole();
  if (role !== "admin") return { error: "Forbidden" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("payslip_settings_disputes")
    .update({
      status: input.status,
      admin_response: input.adminResponse?.trim() || null,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) return { error: error.message };
  revalidatePath("/payslips");
  revalidatePath("/admin/payslips");
  return { ok: true };
}

type Row = {
  id: string;
  user_id: string;
  field: string;
  current_value: string | null;
  message: string;
  status: string;
  admin_response: string | null;
  created_at: string;
  resolved_at: string | null;
};

function toDispute(r: Row): DisputeRow {
  return {
    id: r.id,
    userId: r.user_id,
    field: r.field as DisputeField,
    currentValue: r.current_value,
    message: r.message,
    status: r.status as DisputeRow["status"],
    adminResponse: r.admin_response,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
  };
}
