"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function getMyOvertimeRequests() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data } = await supabase
    .from("overtime_requests")
    .select("*")
    .eq("user_id", user.id)
    .order("date", { ascending: false });

  return data ?? [];
}

export async function getPendingOvertimeRequests(statusFilter: string = "pending") {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  // Verify admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") return [];

  let query = supabase
    .from("overtime_requests")
    .select(
      `
      *,
      profiles!overtime_requests_user_id_fkey(full_name, email)
    `
    )
    .order("created_at", { ascending: false });

  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter as "pending" | "approved" | "rejected");
  }

  const { data } = await query;
  return data ?? [];
}

export async function reviewOvertimeRequest(
  requestId: string,
  decision: "approved" | "rejected",
  adminNote?: string
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  // Verify admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") return { error: "Forbidden" };

  // Get the request
  const { data: request } = await supabase
    .from("overtime_requests")
    .select("id, attendance_log_id, status")
    .eq("id", requestId)
    .single();

  if (!request) return { error: "Request not found" };
  if (request.status !== "pending") return { error: "Request already reviewed" };

  // Update the overtime request
  const { error: updateError } = await supabase
    .from("overtime_requests")
    .update({
      status: decision,
      admin_note: adminNote || null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (updateError) return { error: updateError.message };

  // Update attendance log overtime_status
  if (decision === "rejected") {
    await supabase
      .from("attendance_logs")
      .update({
        is_overtime: false,
        overtime_minutes: 0,
        overtime_status: "rejected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", request.attendance_log_id);
  } else {
    await supabase
      .from("attendance_logs")
      .update({
        overtime_status: "approved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", request.attendance_log_id);
  }

  revalidatePath("/admin/attendance");
  return {};
}

export async function getPendingOvertimeCount() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return 0;

  const { count } = await supabase
    .from("overtime_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  return count ?? 0;
}
