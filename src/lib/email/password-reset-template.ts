/**
 * Password-reset email template for Zota Corp.
 *
 * Design notes:
 *   - Email clients are a jungle: we stick to table layout + inline styles
 *     so Gmail / Outlook / Apple Mail / WhatsApp preview all render the
 *     same. No external CSS, no web fonts (clients strip both).
 *   - Brand palette matches the app (--primary #005a65 tosca).
 *   - Bilingual body (ID primary, EN secondary) since the workforce is
 *     Indonesian but the product ships in both languages. The CTA label
 *     is bilingual on one line so recipients don't have to pick.
 *   - A plain-text version is generated alongside so clients that reject
 *     HTML (or preview apps like WhatsApp link previews) still get a
 *     readable message.
 */

export interface PasswordResetEmailParams {
  /** Pre-filled first name, falls back to "kamu" when unavailable. */
  firstName?: string | null;
  /** Fully-signed Supabase recovery link from `auth.admin.generateLink()`. */
  actionLink: string;
  /** Human-readable expiry hint, e.g. "1 jam". */
  expiresIn?: string;
}

const BRAND_TOSCA = "#005a65";
const BRAND_TOSCA_DARK = "#003d45";
const INK = "#1d1d1f";
const MUTED = "#6e6e73";
const HAIRLINE = "#e5e5e7";

export function renderPasswordResetEmail({
  firstName,
  actionLink,
  expiresIn = "1 jam",
}: PasswordResetEmailParams): { subject: string; html: string; text: string } {
  const who = firstName?.trim() || "kamu";
  const subject = "Reset password Zota Corp — konfirmasi kamu";

  // System-font stack tuned for email clients (no web fonts allowed).
  const fontStack =
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

  const html = /* html */ `<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f5f5f7;font-family:${fontStack};color:${INK};">
    <!-- Hidden preheader (shows as grey preview in inbox list) -->
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;visibility:hidden;mso-hide:all;">
      Halo ${escapeHtml(who)}, kami dengar kamu mau reset password. Klik tombol di dalam untuk lanjut.
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
      style="background-color:#f5f5f7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"
            style="max-width:560px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 1px 2px rgba(0,58,65,0.06),0 12px 32px -16px rgba(0,58,65,0.18);">

            <!-- Tosca gradient header -->
            <tr>
              <td style="background:linear-gradient(135deg,${BRAND_TOSCA_DARK} 0%,${BRAND_TOSCA} 55%,#007785 100%);padding:28px 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.8);">
                      Zota Corp
                    </td>
                    <td align="right" style="font-size:11px;font-weight:600;letter-spacing:0.1em;color:rgba(255,255,255,0.7);text-transform:uppercase;">
                      Password reset
                    </td>
                  </tr>
                </table>
                <div style="margin-top:20px;font-size:24px;line-height:1.2;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">
                  Halo, ${escapeHtml(who)}.
                </div>
                <div style="margin-top:6px;font-size:14px;line-height:1.5;color:rgba(255,255,255,0.85);">
                  Kami dengar kamu mau ganti password.
                </div>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:28px 32px 8px 32px;">
                <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:${INK};">
                  Klik tombol di bawah untuk reset password akun Zota Corp kamu.
                  Link ini cuma aktif selama <strong>${escapeHtml(expiresIn)}</strong> dan
                  cuma bisa kamu pakai sekali.
                </p>
                <p style="margin:0 0 24px 0;font-size:13px;line-height:1.6;color:${MUTED};">
                  <em>Click the button below to reset your Zota Corp password. This link
                  is valid for ${escapeHtml(expiresIn)} and can only be used once.</em>
                </p>

                <!-- CTA -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 8px 0;">
                  <tr>
                    <td align="center" bgcolor="${BRAND_TOSCA}"
                      style="border-radius:14px;box-shadow:0 6px 20px rgba(0,90,101,0.28);">
                      <a href="${escapeAttr(actionLink)}" target="_blank" rel="noopener"
                        style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;letter-spacing:0.01em;color:#ffffff;text-decoration:none;font-family:${fontStack};">
                        Reset password &nbsp;·&nbsp; Reset my password
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="margin:24px 0 6px 0;font-size:12px;line-height:1.6;color:${MUTED};">
                  Tombolnya nggak jalan? Copy-paste link ini ke browser:
                </p>
                <p style="margin:0 0 20px 0;font-size:12px;line-height:1.5;word-break:break-all;">
                  <a href="${escapeAttr(actionLink)}" style="color:${BRAND_TOSCA};text-decoration:underline;">
                    ${escapeHtml(actionLink)}
                  </a>
                </p>
              </td>
            </tr>

            <!-- Hairline + safety note -->
            <tr>
              <td style="padding:0 32px;">
                <div style="height:1px;background:${HAIRLINE};line-height:1px;font-size:0;">&nbsp;</div>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 28px 32px;">
                <p style="margin:0 0 8px 0;font-size:12px;line-height:1.6;color:${MUTED};">
                  <strong style="color:${INK};">Bukan kamu yang minta?</strong>
                  Abaikan aja email ini — password kamu nggak akan berubah selama
                  kamu nggak klik tombol di atas.
                </p>
                <p style="margin:0;font-size:11px;line-height:1.6;color:${MUTED};">
                  <em>Didn't request this? You can safely ignore this email — your
                  password won't change unless you click the button above.</em>
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#fafafa;padding:18px 32px;border-top:1px solid ${HAIRLINE};">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="font-size:11px;color:${MUTED};line-height:1.5;">
                      Zota Corp · Employee operations<br/>
                      Email ini dikirim otomatis, mohon jangan dibalas.
                    </td>
                    <td align="right" style="font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:${BRAND_TOSCA};">
                      Zota
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <div style="margin-top:16px;font-size:11px;color:${MUTED};line-height:1.5;">
            © ${new Date().getFullYear()} Zota Corp
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `Halo ${who},`,
    ``,
    `Kami dengar kamu mau ganti password akun Zota Corp.`,
    `Buka link di bawah buat reset password kamu. Link ini aktif ${expiresIn}`,
    `dan cuma bisa kamu pakai sekali.`,
    ``,
    actionLink,
    ``,
    `Bukan kamu yang minta? Abaikan aja email ini — password kamu nggak`,
    `akan berubah selama kamu nggak buka link di atas.`,
    ``,
    `— Zota Corp`,
  ].join("\n");

  return { subject, html, text };
}

// Minimal HTML escapers — the action link and name are the only untrusted
// inputs; we keep this dependency-free rather than pulling in a library.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}
