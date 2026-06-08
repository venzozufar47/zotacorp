/**
 * Investor invite email for Zota Corp.
 *
 * Sent when an admin invites an investor from /admin/investors. Mirrors
 * the password-reset template (table layout + inline styles, brand teal,
 * bilingual ID/EN, plain-text fallback) so it renders consistently across
 * email clients. The CTA opens the set-password page where the invitee
 * creates their password and lands in the investor dashboard.
 */

export interface InviteInvestorEmailParams {
  /** Pre-filled name, falls back to "Anda" when unavailable. */
  fullName?: string | null;
  /** Fully-signed Supabase invite link from `auth.admin.generateLink()`. */
  actionLink: string;
  /** Human-readable expiry hint, e.g. "24 jam". */
  expiresIn?: string;
}

const BRAND_TOSCA = "#117a8c";
const BRAND_TOSCA_DARK = "#0c5d6c";
const INK = "#1d1d1f";
const MUTED = "#6e6e73";
const HAIRLINE = "#e5e5e7";

export function renderInviteInvestorEmail({
  fullName,
  actionLink,
  expiresIn = "24 jam",
}: InviteInvestorEmailParams): { subject: string; html: string; text: string } {
  const who = fullName?.trim() || "Anda";
  const subject = "Undangan Investor Zota Corp — buat password Anda";

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
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;visibility:hidden;mso-hide:all;">
      Halo ${escapeHtml(who)}, Anda diundang sebagai investor Zota Corp. Klik untuk buat password & masuk dashboard.
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
      style="background-color:#f5f5f7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"
            style="max-width:560px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 1px 2px rgba(0,58,65,0.06),0 12px 32px -16px rgba(0,58,65,0.18);">

            <tr>
              <td style="background:linear-gradient(135deg,${BRAND_TOSCA_DARK} 0%,${BRAND_TOSCA} 55%,#007785 100%);padding:28px 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.8);">
                      Zota Corp
                    </td>
                    <td align="right" style="font-size:11px;font-weight:600;letter-spacing:0.1em;color:rgba(255,255,255,0.7);text-transform:uppercase;">
                      Investor invite
                    </td>
                  </tr>
                </table>
                <div style="margin-top:20px;font-size:24px;line-height:1.2;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">
                  Selamat datang, ${escapeHtml(who)}.
                </div>
                <div style="margin-top:6px;font-size:14px;line-height:1.5;color:rgba(255,255,255,0.85);">
                  Anda diundang ke portal investor Zota Corp.
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:28px 32px 8px 32px;">
                <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:${INK};">
                  Klik tombol di bawah untuk <strong>membuat password</strong> dan
                  mengaktifkan akun investor Anda. Setelah itu Anda bisa langsung masuk
                  ke dashboard. Link ini aktif selama <strong>${escapeHtml(expiresIn)}</strong>.
                </p>
                <p style="margin:0 0 24px 0;font-size:13px;line-height:1.6;color:${MUTED};">
                  <em>Click the button below to set your password and activate your
                  investor account, then sign in to your dashboard. This link is valid
                  for ${escapeHtml(expiresIn)}.</em>
                </p>

                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 8px 0;">
                  <tr>
                    <td align="center" bgcolor="${BRAND_TOSCA}"
                      style="border-radius:14px;box-shadow:0 6px 20px rgba(0,90,101,0.28);">
                      <a href="${escapeAttr(actionLink)}" target="_blank" rel="noopener"
                        style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;letter-spacing:0.01em;color:#ffffff;text-decoration:none;font-family:${fontStack};">
                        Buat password &nbsp;·&nbsp; Set my password
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

            <tr>
              <td style="padding:0 32px;">
                <div style="height:1px;background:${HAIRLINE};line-height:1px;font-size:0;">&nbsp;</div>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 28px 32px;">
                <p style="margin:0 0 8px 0;font-size:12px;line-height:1.6;color:${MUTED};">
                  <strong style="color:${INK};">Tidak merasa diundang?</strong>
                  Abaikan saja email ini — tidak ada akun yang aktif sampai Anda
                  membuat password lewat tombol di atas.
                </p>
                <p style="margin:0;font-size:11px;line-height:1.6;color:${MUTED};">
                  <em>Not expecting this? You can safely ignore this email.</em>
                </p>
              </td>
            </tr>

            <tr>
              <td style="background:#fafafa;padding:18px 32px;border-top:1px solid ${HAIRLINE};">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="font-size:11px;color:${MUTED};line-height:1.5;">
                      Zota Corp · Investor relations<br/>
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
    `Anda diundang sebagai investor Zota Corp.`,
    `Buka link di bawah untuk membuat password dan mengaktifkan akun Anda,`,
    `lalu masuk ke dashboard investor. Link ini aktif ${expiresIn}.`,
    ``,
    actionLink,
    ``,
    `Tidak merasa diundang? Abaikan saja email ini.`,
    ``,
    `— Zota Corp`,
  ].join("\n");

  return { subject, html, text };
}

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
