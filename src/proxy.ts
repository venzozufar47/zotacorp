import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  POS_DEFAULT_BRANCH,
  posBranchFromParam,
  posSubpageFromParam,
} from "@/lib/pos/branch";

/**
 * Selamatkan deep-link POS tanpa cabang: `/pos/insights?from=…&to=…` →
 * `/pospare/insights?from=…&to=…`.
 *
 * Route internalnya `/pos/[branch]/insights`, jadi URL tanpa cabang membuat
 * "insights" terbaca sebagai nama cabang; guard menolaknya dan melempar ke
 * halaman utama POS — query tanggalnya ikut hilang. Ditangani di sini, bukan
 * di layout, karena layout Next tidak menerima searchParams sehingga tidak
 * bisa meneruskan `?from`/`?to`.
 *
 * Hanya segmen yang memang nama sub-halaman yang dialihkan. Segmen ngawur
 * tetap jatuh ke guard `[branch]` (→ halaman utama), bukan 404.
 */
function posLegacyDeepLink(request: NextRequest): URL | null {
  const { pathname } = request.nextUrl;
  const m = /^\/pos\/([^/]+)(\/.*)?$/.exec(pathname);
  if (!m) return null;
  const seg = m[1];
  if (posBranchFromParam(seg)) return null; // sudah menyebut cabang
  if (!posSubpageFromParam(seg)) return null; // biar guard yang tangani
  const url = request.nextUrl.clone();
  url.pathname = `/pos${POS_DEFAULT_BRANCH}/${seg}${m[2] ?? ""}`;
  return url;
}

export async function proxy(request: NextRequest) {
  const posRedirect = posLegacyDeepLink(request);
  if (posRedirect) return NextResponse.redirect(posRedirect);
  return updateSession(request);
}

export const config = {
  matcher: [
    // manifest.webmanifest & sw.js must stay reachable without a session —
    // browsers fetch them outside the page context for PWA install/push.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|sw.js|fonts|images|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
