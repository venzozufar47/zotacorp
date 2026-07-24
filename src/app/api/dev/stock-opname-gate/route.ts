import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  STOCK_BRANCH_IDS,
  type StockBranchId,
  checkStockOpnameDone,
  decideCheckoutGate,
  guardCheckoutByStockOpname,
  resolveStockGateBranch,
} from "@/lib/attendance/stock-opname-gate";

/**
 * Harness uji manual gate "absen pulang" — DEV/ADMIN ONLY.
 *
 * Dinonaktifkan di production (404) supaya tidak jadi permukaan serang.
 * Hanya admin login yang boleh memanggil. Tidak pernah membocorkan
 * STOCK_STATUS_API_KEY — hanya mengembalikan status/keputusan.
 *
 * Contoh:
 *   GET /api/dev/stock-opname-gate?mock=false   → { decision: blokir }  (opname belum selesai)
 *   GET /api/dev/stock-opname-gate?mock=true    → { decision: lolos }
 *   GET /api/dev/stock-opname-gate?branch=jebres        → panggil API asli utk 1 cabang
 *   GET /api/dev/stock-opname-gate?profile=<uuid>       → jalankan gate penuh utk 1 karyawan
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { data: prof } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (prof?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const mock = url.searchParams.get("mock");
  const branch = url.searchParams.get("branch");
  const profile = url.searchParams.get("profile");

  // 1) Mock murni — buktikan keputusan gate utk submitted=false lalu true,
  //    tanpa menyentuh API eksternal.
  if (mock === "true" || mock === "false") {
    const submitted = mock === "true";
    const decision = decideCheckoutGate({ ok: true, submitted });
    return NextResponse.json({ mode: "mock", submitted, decision });
  }

  // 2) Probe API asli utk satu cabang (butuh STOCK_STATUS_API_KEY di-set).
  if (branch) {
    if (!STOCK_BRANCH_IDS.includes(branch as StockBranchId)) {
      return NextResponse.json(
        { error: `branch tidak valid; pilih ${STOCK_BRANCH_IDS.join(" | ")}` },
        { status: 400 },
      );
    }
    const status = await checkStockOpnameDone(branch as StockBranchId);
    return NextResponse.json({ mode: "live-branch", branch, status });
  }

  // 3) Gate penuh utk satu karyawan (resolve cabang → cek → keputusan).
  if (profile) {
    const branchId = resolveStockGateBranch(profile);
    const decision = await guardCheckoutByStockOpname(profile);
    return NextResponse.json({
      mode: "live-profile",
      profile,
      resolvedBranch: branchId,
      gated: branchId !== null,
      decision,
    });
  }

  return NextResponse.json({
    usage: {
      mock: "?mock=false | ?mock=true",
      liveBranch: `?branch=${STOCK_BRANCH_IDS.join("|")}`,
      liveProfile: "?profile=<profile-uuid>",
    },
    branches: STOCK_BRANCH_IDS,
  });
}
