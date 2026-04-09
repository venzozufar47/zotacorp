import { type NextRequest, NextResponse } from "next/server";

// Minimal pass-through proxy — auth is enforced in each Server Component.
// Supabase session refresh happens via individual page data fetches.
export async function proxy(request: NextRequest) {
  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|fonts|images|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
