import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "application/pdf"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const attendanceLogId = formData.get("attendanceLogId") as string | null;

    if (!file || !attendanceLogId) {
      return NextResponse.json(
        { error: "File and attendanceLogId are required" },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Only JPEG, PNG, and PDF files are allowed" },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "File must be smaller than 5MB" },
        { status: 400 }
      );
    }

    // Verify the attendance log belongs to the user and status is 'late'
    const { data: log } = await supabase
      .from("attendance_logs")
      .select("id, user_id, status, date, late_proof_url")
      .eq("id", attendanceLogId)
      .single();

    if (!log) {
      return NextResponse.json(
        { error: "Attendance log not found" },
        { status: 404 }
      );
    }

    if (log.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (log.status !== "late") {
      return NextResponse.json(
        { error: "Proof can only be uploaded for late check-ins" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Delete old proof if exists
    if (log.late_proof_url) {
      await adminClient.storage.from("late-proofs").remove([log.late_proof_url]);
    }

    // Upload new file
    const ext = file.name.split(".").pop() ?? "bin";
    const filePath = `${user.id}/${log.date}/proof.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await adminClient.storage
      .from("late-proofs")
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload file" },
        { status: 500 }
      );
    }

    // Update attendance log — proof submitted, pending admin review
    const { error: updateError } = await adminClient
      .from("attendance_logs")
      .update({
        late_proof_url: filePath,
        late_proof_status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", attendanceLogId);

    if (updateError) {
      console.error("Attendance update error:", updateError);
      return NextResponse.json(
        { error: "Failed to update attendance record" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, path: filePath });
  } catch (err) {
    console.error("Upload proof error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
