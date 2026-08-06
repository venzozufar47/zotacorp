import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { renderPasswordResetEmail } from "@/lib/email/password-reset-template";
import type { Database } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/auth/forgot-password  — ANONIM.
 *
 * Saudara dari /api/auth/request-password-reset, yang sengaja dipagari
 * sesi login. Pagar itu masuk akal untuk "ganti password saat sudah
 * masuk", tapi membuatnya mustahil menolong kasus yang justru paling
 * butuh: orang yang LUPA password tidak bisa login, sehingga tidak
 * pernah bisa memanggil endpoint itu.
 *
 * Komentar di endpoint lama menyebut pagar sesi sebagai dua hal
 * sekaligus — pertahanan terhadap penyalahgunaan, dan alasan tidak perlu
 * takut enumerasi akun. Melepas pagar berarti KEDUANYA harus diganti,
 * dan itu yang dikerjakan di sini:
 *
 *   1. ENUMERASI. Respons sukses SELALU identik, baik emailnya terdaftar
 *      maupun tidak. Tidak ada beda pesan, tidak ada beda status code.
 *      Email yang tidak dikenal menempuh jalur yang sama, hanya tidak
 *      ada surat yang benar-benar dikirim.
 *
 *   2. PENYALAHGUNAAN. Throttle bersandar database (tabel
 *      password_reset_requests), bukan Map di memori — Vercel
 *      menjalankan banyak instance serverless yang tidak berbagi memori,
 *      jadi penghitung in-process bisa dilewati hanya dengan menabrak
 *      instance lain.
 *
 * Emailnya sendiri tetap dikirim lewat Resend memakai template yang sama
 * dengan endpoint lama, supaya pengalamannya konsisten dan tidak
 * bergantung pada kuota SMTP bawaan Supabase.
 */

/** Maksimal per alamat email per jam. */
const MAX_PER_EMAIL_HOUR = 3;
/** Maksimal per IP per jam — menahan penyapuan banyak alamat sekaligus. */
const MAX_PER_IP_HOUR = 10;

const hashEmail = (email: string) =>
  createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

/** Jawaban seragam. Dipakai untuk SEMUA hasil non-throttle supaya tidak
 *  ada satu pun sinyal yang membedakan email terdaftar dari yang tidak. */
const uniformOk = () =>
  NextResponse.json({
    ok: true,
    message:
      "Kalau email itu terdaftar, kami sudah mengirim link reset password ke sana. Cek inbox dan folder spam ya.",
  });

export async function POST(req: Request) {
  try {
    let email = "";
    try {
      const body = (await req.json()) as { email?: unknown };
      email = typeof body.email === "string" ? body.email.trim() : "";
    } catch {
      return NextResponse.json({ error: "Body harus JSON" }, { status: 400 });
    }

    // Validasi bentuk saja. Sengaja TIDAK memeriksa domain atau
    // keberadaan akun di sini — itu akan jadi kanal enumerasi.
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Masukkan alamat email yang valid" },
        { status: 400 }
      );
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const resendKey = process.env.RESEND_API_KEY;
    const resendFrom = process.env.RESEND_FROM;
    if (!serviceRoleKey || !supabaseUrl || !appUrl || !resendKey || !resendFrom) {
      console.error("[forgot-password] env belum lengkap", {
        hasServiceRole: !!serviceRoleKey,
        hasSupabaseUrl: !!supabaseUrl,
        hasAppUrl: !!appUrl,
        hasResendKey: !!resendKey,
        hasResendFrom: !!resendFrom,
      });
      return NextResponse.json(
        { error: "Layanan email belum dikonfigurasi." },
        { status: 500 }
      );
    }

    const admin = createAdminClient<Database>(supabaseUrl, serviceRoleKey);
    const emailHash = hashEmail(email);
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // Throttle DULU, sebelum kerja apa pun. Dihitung untuk email apa pun
    // — terdaftar atau tidak — supaya perilakunya tidak membocorkan
    // keberadaan akun.
    // `as never` mengikuti konvensi repo untuk tabel yang belum masuk
    // types.ts hasil generate (lihat tabel cake_*). Me-regenerate file
    // itu di tengah beberapa sesi paralel lebih berisiko daripada cast
    // sempit di tiga query sederhana ini.
    const { count: emailCount } = await admin
      .from("password_reset_requests" as never)
      .select("id", { count: "exact", head: true })
      .eq("email_hash", emailHash)
      .gte("created_at", sinceIso);
    if ((emailCount ?? 0) >= MAX_PER_EMAIL_HOUR) {
      return NextResponse.json(
        {
          error:
            "Sudah beberapa kali diminta untuk email ini. Cek inbox dan spam dulu, atau coba lagi satu jam lagi.",
        },
        { status: 429 }
      );
    }
    if (ip) {
      const { count: ipCount } = await admin
        .from("password_reset_requests" as never)
        .select("id", { count: "exact", head: true })
        .eq("ip", ip)
        .gte("created_at", sinceIso);
      if ((ipCount ?? 0) >= MAX_PER_IP_HOUR) {
        return NextResponse.json(
          { error: "Terlalu banyak permintaan. Coba lagi satu jam lagi." },
          { status: 429 }
        );
      }
    }

    await admin
      .from("password_reset_requests" as never)
      .insert({ email_hash: emailHash, ip } as never);

    // generateLink GAGAL kalau emailnya tidak terdaftar. Itu dipakai
    // sebagai pemeriksaan keberadaan akun — hasilnya TIDAK pernah
    // dibocorkan ke pemanggil, hanya menentukan ada tidaknya surat yang
    // benar-benar dikirim.
    const { data: linkData, error: linkError } =
      await admin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: `${appUrl}/reset-password` },
      });

    if (linkError || !linkData?.properties?.action_link) {
      // Dicatat untuk diagnosis, TIDAK dikembalikan. Email tak dikenal
      // dan gangguan sesaat sama-sama berakhir di sini, dan pemanggil
      // melihat jawaban yang sama persis dengan kasus sukses.
      console.warn(
        "[forgot-password] generateLink gagal (email tak dikenal atau gangguan):",
        linkError?.message ?? "tanpa action_link"
      );
      return uniformOk();
    }

    // Nama depan untuk sapaan. Gagal di sini tidak boleh menggagalkan
    // pengiriman — sapaan generik jauh lebih baik daripada tidak ada
    // email sama sekali.
    let firstName: string | null = null;
    const userId = linkData.user?.id;
    if (userId) {
      const { data: profile } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .maybeSingle();
      firstName = profile?.full_name?.split(" ")[0] ?? null;
    }

    const { subject, html, text } = renderPasswordResetEmail({
      firstName,
      actionLink: linkData.properties.action_link,
      expiresIn: "1 jam",
    });

    const resend = new Resend(resendKey);
    const { error: sendError } = await resend.emails.send({
      from: resendFrom,
      to: email,
      subject,
      html,
      text,
      headers: {
        "X-Entity-Ref-ID": `pwforgot-${emailHash.slice(0, 12)}-${Date.now()}`,
      },
    });

    if (sendError) {
      // Kegagalan kirim DICATAT tapi tidak dibocorkan: membedakan
      // "gagal kirim" dari "email tak dikenal" akan mengembalikan kanal
      // enumerasi yang baru saja ditutup. Log-nya cukup untuk diagnosis.
      console.error("[forgot-password] resend gagal", sendError);
    }

    return uniformOk();
  } catch (err) {
    console.error("[forgot-password] error tak terduga", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan. Coba lagi sebentar lagi." },
      { status: 500 }
    );
  }
}
