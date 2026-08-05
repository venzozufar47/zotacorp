import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./types";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // `getUser()` MELEMPAR (bukan mengembalikan { error }) saat refresh token
  // di cookie tidak dikenal server auth — mis. token sudah dirotasi, sesi
  // dicabut, atau cookie tertinggal dari project Supabase lain. Tanpa
  // tangkapan ini, middleware meneruskan AuthApiError ke Next dan user
  // mendapat 500.
  //
  // Yang membuatnya buntu: cookie basinya TETAP ada, jadi memuat ulang
  // menghasilkan 500 lagi. User tidak punya jalan keluar selain
  // membersihkan cookie sendiri — sesuatu yang tidak bisa diharapkan.
  // Terpantau 20 kali di produksi (17 Jun - 3 Ags 2026), semuanya pada
  // satu user yang berarti memang mentok, bukan sesekali.
  //
  // Ditangani seperti "belum login": lanjut dengan user null, dan cookie
  // auth-nya dihapus supaya percobaan berikutnya bersih.
  let user: Awaited<
    ReturnType<typeof supabase.auth.getUser>
  >["data"]["user"] = null;
  let authCookiesStale = false;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    authCookiesStale = true;
  }

  const { pathname } = request.nextUrl;

  if (authCookiesStale) {
    // Hapus cookie sesi Supabase (`sb-<ref>-auth-token`, bisa terpecah
    // jadi `.0`, `.1`, … untuk token panjang). Dihapus by-name dari yang
    // benar-benar dikirim browser, bukan menebak namanya.
    for (const c of request.cookies.getAll()) {
      if (c.name.startsWith("sb-") && c.name.includes("auth-token")) {
        supabaseResponse.cookies.delete(c.name);
      }
    }
    // Rute publik tetap dilayani — kalau tidak, landing page ikut 500 dan
    // user tetap tidak bisa login.
    const publicish =
      pathname === "/" ||
      pathname === "/privacy" ||
      pathname === "/set-password" ||
      pathname === "/reset-password" ||
      pathname.startsWith("/login") ||
      pathname.startsWith("/register") ||
      pathname.startsWith("/api");
    if (publicish) return supabaseResponse;

    const url = request.nextUrl.clone();
    url.pathname = "/";
    const redirect = NextResponse.redirect(url);
    for (const c of request.cookies.getAll()) {
      if (c.name.startsWith("sb-") && c.name.includes("auth-token")) {
        redirect.cookies.delete(c.name);
      }
    }
    return redirect;
  }

  // Auth-action pages (invite "buat password" + recovery "reset password")
  // menerima token lewat URL hash dan membangun sesi di sisi CLIENT. Saat
  // user mengklik link undangan, sesi BELUM ada di cookie — kalau di-gate
  // seperti rute biasa, middleware menendang ke "/", browser mempertahankan
  // fragment, lalu LoginForm meneruskan lagi ke sini → loop tak henti.
  // Maka: SELALU loloskan, apa pun status sesi (halaman urus token sendiri).
  if (pathname === "/set-password" || pathname === "/reset-password") {
    return supabaseResponse;
  }

  // Privacy policy must be public for Google Play / App Store review (the
  // reviewer is anonymous). Let it through ahead of the auth gate so it's
  // reachable whether signed-in or not — a logged-in user must NOT be
  // bounced to their role home like other public routes are.
  if (pathname === "/privacy") {
    return supabaseResponse;
  }

  // `/` is the new auth landing (login form when anon, role redirect
  // when authed — see app/(auth)/page.tsx). `/login` stays as a 308
  // alias so external bookmarks survive.
  const publicRoutes = ["/", "/login", "/register", "/register-investor"];
  const isPublic =
    pathname === "/" ||
    publicRoutes.some((r) => r !== "/" && pathname.startsWith(r));
  const isApi = pathname.startsWith("/api");

  // Not logged in → force to landing (except public routes and API routes)
  if (!user && !isPublic && !isApi) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Logged in → resolve role once for all guards below
  if (user) {
    const employeeRoutes = ["/dashboard", "/attendance", "/profile", "/assignments"];
    const onEmployeeRoute = employeeRoutes.some(
      (r) => pathname === r || pathname.startsWith(r + "/")
    );
    const onAdminRoute = pathname.startsWith("/admin");
    const onInvestorRoute = pathname.startsWith("/investor");

    // Only query profile when we actually need a role-based decision
    if (isPublic || onAdminRoute || onEmployeeRoute || onInvestorRoute) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, is_active, resigned_at")
        .eq("id", user.id)
        .single();

      // Resign gate: kalau akun di-nonaktifkan admin, force sign-out
      // + redirect ke landing dengan banner notice. Tidak gate /api
      // (sudah kefilter di awal) supaya logout/callback tetap jalan.
      // Akun BARU (registrasi publik) juga nonaktif sampai admin
      // mengaktifkan (audit 2026-07) — bedakan pesannya: belum pernah
      // di-resign (resigned_at null) berarti menunggu aktivasi.
      if (profile && profile.is_active === false) {
        await supabase.auth.signOut();
        const url = request.nextUrl.clone();
        url.pathname = "/";
        url.searchParams.set(
          "error",
          profile.resigned_at ? "account-deactivated" : "pending-activation"
        );
        return NextResponse.redirect(url);
      }

      const isAdmin = profile?.role === "admin";
      const isInvestor = profile?.role === "investor";
      const home = isAdmin
        ? "/admin"
        : isInvestor
          ? "/investor"
          : "/dashboard";

      // Logged-in user on public page → send to their home
      if (isPublic) {
        const url = request.nextUrl.clone();
        url.pathname = home;
        return NextResponse.redirect(url);
      }

      // Investor hanya boleh akses /investor/*. Selain itu redirect.
      if (isInvestor && !onInvestorRoute) {
        const url = request.nextUrl.clone();
        url.pathname = "/investor";
        return NextResponse.redirect(url);
      }

      // Non-investor mencoba akses /investor/* → redirect ke home.
      if (onInvestorRoute && !isInvestor) {
        const url = request.nextUrl.clone();
        url.pathname = home;
        return NextResponse.redirect(url);
      }

      // Non-admin on admin route → send to employee home, EXCEPT
      // finance pages (cash rekening assignees) ATAU yeobo-booth pages
      // (admin Yeobo Booth via `yeobo_booth_admins` membership; lihat
      // migration 063). Page-level gate enforces — middleware hanya
      // let-through agar pages bisa di-load.
      if (onAdminRoute && !isAdmin) {
        const isFinanceAssigneePath =
          pathname === "/admin/finance" ||
          pathname === "/admin/finance/" ||
          pathname.startsWith("/admin/finance/rekening/");
        const isYeoboBoothPath = pathname.startsWith("/admin/yeobo-booth");
        if (!isFinanceAssigneePath && !isYeoboBoothPath) {
          const url = request.nextUrl.clone();
          url.pathname = home;
          return NextResponse.redirect(url);
        }
      }

      // Admin on employee route → send to admin home
      if (onEmployeeRoute && isAdmin) {
        const url = request.nextUrl.clone();
        url.pathname = "/admin";
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}
