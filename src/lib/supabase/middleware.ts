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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // `/` is the new auth landing (login form when anon, role redirect
  // when authed — see app/(auth)/page.tsx). `/login` stays as a 308
  // alias so external bookmarks survive.
  const publicRoutes = ["/", "/login", "/register"];
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
    const employeeRoutes = ["/dashboard", "/attendance", "/profile"];
    const onEmployeeRoute = employeeRoutes.some(
      (r) => pathname === r || pathname.startsWith(r + "/")
    );
    const onAdminRoute = pathname.startsWith("/admin");

    // Only query profile when we actually need a role-based decision
    if (isPublic || onAdminRoute || onEmployeeRoute) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      const isAdmin = profile?.role === "admin";
      const home = isAdmin ? "/admin" : "/dashboard";

      // Logged-in user on public page → send to their home
      if (isPublic) {
        const url = request.nextUrl.clone();
        url.pathname = home;
        return NextResponse.redirect(url);
      }

      // Non-admin on admin route → send to employee home, EXCEPT
      // finance pages. Non-admin assignees of a cash rekening can
      // access the finance landing + their assigned rekening details.
      // The pages themselves enforce per-rekening permission.
      if (onAdminRoute && !isAdmin) {
        const isFinanceAssigneePath =
          pathname === "/admin/finance" ||
          pathname === "/admin/finance/" ||
          pathname.startsWith("/admin/finance/rekening/");
        if (!isFinanceAssigneePath) {
          const url = request.nextUrl.clone();
          url.pathname = "/dashboard";
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
