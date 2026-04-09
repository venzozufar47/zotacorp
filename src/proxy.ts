import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  // Guard: if Supabase env vars are missing, pass through without crashing
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    console.error(
      "[proxy] Missing Supabase env vars — skipping auth middleware"
    );
    return NextResponse.next({ request });
  }

  try {
    return await updateSession(request);
  } catch (err) {
    console.error("[proxy] updateSession threw:", err);
    return NextResponse.next({ request });
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|fonts|images|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
