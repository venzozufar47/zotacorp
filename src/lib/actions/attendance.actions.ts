"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTodayDateString } from "@/lib/utils/date";

interface CheckInPayload {
  latitude: number | null;
  longitude: number | null;
}

export async function checkIn(payload: CheckInPayload) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const today = getTodayDateString();

  // Check for existing record today
  const { data: existing } = await supabase
    .from("attendance_logs")
    .select("id, checked_in_at, checked_out_at")
    .eq("user_id", user.id)
    .eq("date", today)
    .maybeSingle();

  if (existing) {
    if (!existing.checked_out_at) {
      return { error: "You are already checked in. Please check out first." };
    }
    return { error: "You have already completed attendance for today." };
  }

  const { data, error } = await supabase
    .from("attendance_logs")
    .insert({
      user_id: user.id,
      date: today,
      checked_in_at: new Date().toISOString(),
      latitude: payload.latitude,
      longitude: payload.longitude,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "You have already completed attendance for today." };
    }
    return { error: error.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/attendance");
  return { data };
}

export async function checkOut() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const today = getTodayDateString();

  const { data: existing } = await supabase
    .from("attendance_logs")
    .select("id, checked_out_at")
    .eq("user_id", user.id)
    .eq("date", today)
    .maybeSingle();

  if (!existing) {
    return { error: "No check-in found for today." };
  }

  if (existing.checked_out_at) {
    return { error: "You have already checked out today." };
  }

  const { data, error } = await supabase
    .from("attendance_logs")
    .update({
      checked_out_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id)
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/attendance");
  return { data };
}

export async function getTodayAttendance() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("attendance_logs")
    .select("*")
    .eq("user_id", user.id)
    .eq("date", getTodayDateString())
    .maybeSingle();

  return data;
}

export async function getMyAttendanceLogs(limit = 30) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data } = await supabase
    .from("attendance_logs")
    .select("*")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(limit);

  return data ?? [];
}

export async function getAllAttendanceLogs(params: {
  startDate?: string;
  endDate?: string;
  department?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { data: [], count: 0 };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") return { data: [], count: 0 };

  const {
    startDate,
    endDate,
    department,
    search,
    page = 1,
    pageSize = 25,
  } = params;

  let query = supabase
    .from("attendance_logs")
    .select(
      `
      *,
      profiles!inner(full_name, email, department, position)
    `,
      { count: "exact" }
    )
    .order("date", { ascending: false })
    .order("checked_in_at", { ascending: false });

  if (startDate) query = query.gte("date", startDate);
  if (endDate) query = query.lte("date", endDate);
  if (department)
    query = query.eq("profiles.department", department);
  if (search)
    query = query.ilike("profiles.full_name", `%${search}%`);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;

  if (error) return { data: [], count: 0 };
  return { data: data ?? [], count: count ?? 0 };
}
