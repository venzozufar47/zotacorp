import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { renderPasswordResetEmail } from "@/lib/email/password-reset-template";
import type { Database } from "@/lib/supabase/types";

/**
 * POST /api/auth/request-password-reset
 *
 * Sends a password-reset email to the currently signed-in user's registered
 * email address. The flow is deliberately "sign-in gated": the employee has
 * to already be authenticated in the app (they trigger this from /settings),
 * which means we don't need to enumerate accounts from an email input and we
 * get a free layer of defense-in-depth against abuse.
 *
 * Why we generate the link server-side instead of calling
 * `supabase.auth.resetPasswordForEmail()`:
 *   - That built-in uses Supabase's own SMTP, which by default is the shared
 *     dev SMTP with a very low daily quota and generic branding.
 *   - We want a branded email sent via Resend with a tone that matches the
 *     rest of the product, so we use the admin SDK to mint the recovery
 *     `action_link` and deliver it ourselves.
 */
export async function POST() {
  try {
    // 1. Identify the caller from their session cookie.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !user.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // 2. Look up first name for a warmer greeting in the email body.
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();
    const firstName = profile?.full_name?.split(" ")[0] ?? null;

    // 3. Require the Resend + service-role env so misconfigurations fail
    //    loudly instead of silently dropping emails.
    const resendKey = process.env.RESEND_API_KEY;
    const resendFrom = process.env.RESEND_FROM;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!resendKey || !resendFrom || !serviceRoleKey || !supabaseUrl || !appUrl) {
      console.error("Password reset: missing env config", {
        hasResendKey: !!resendKey,
        hasResendFrom: !!resendFrom,
        hasServiceRole: !!serviceRoleKey,
        hasSupabaseUrl: !!supabaseUrl,
        hasAppUrl: !!appUrl,
      });
      return NextResponse.json(
        { error: "Email service is not configured." },
        { status: 500 }
      );
    }

    // 4. Mint the recovery link via the admin SDK.
    const admin = createAdminClient<Database>(supabaseUrl, serviceRoleKey);
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: user.email,
      options: {
        redirectTo: `${appUrl}/reset-password`,
      },
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error("Password reset: generateLink failed", linkError);
      return NextResponse.json(
        { error: "Could not generate reset link." },
        { status: 500 }
      );
    }

    const actionLink = linkData.properties.action_link;

    // 5. Render + send via Resend. Supabase recovery links default to 1-hour
    //    expiry; keep the copy in sync if you change the project-level JWT
    //    expiry in the Supabase dashboard.
    const { subject, html, text } = renderPasswordResetEmail({
      firstName,
      actionLink,
      expiresIn: "1 jam",
    });

    const resend = new Resend(resendKey);
    const { error: sendError } = await resend.emails.send({
      from: resendFrom,
      to: user.email,
      subject,
      html,
      text,
      headers: {
        // Let inbox providers know this is a one-off transactional send.
        "X-Entity-Ref-ID": `pwreset-${user.id}-${Date.now()}`,
      },
    });

    if (sendError) {
      console.error("Password reset: resend send failed", sendError);
      return NextResponse.json(
        { error: "Could not send email. Try again in a moment." },
        { status: 502 }
      );
    }

    // Return the masked email so the UI can confirm which address received it
    // without the client having to fetch the user object separately.
    return NextResponse.json({
      ok: true,
      email: maskEmail(user.email),
    });
  } catch (err) {
    console.error("Password reset: unexpected error", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/** `jane.doe@zotacorp.com` → `j***e@zotacorp.com`. Defense-in-depth so logs
 *  and toasts don't leak full addresses when the email is echoed back. */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  return `${local[0]}${"*".repeat(Math.max(1, local.length - 2))}${local.slice(-1)}@${domain}`;
}
