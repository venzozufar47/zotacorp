import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  STOCK_BRANCH_IDS,
  type StockBranchId,
  checkStockOpnameDone,
  decideCheckoutGate,
  guardCheckoutByStockOpname,
  resolveStockGateBranchFromLocation,
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
 *   GET /api/dev/stock-opname-gate?location=<geofenceId>&role=Manager
 *       → simulasi gate penuh dari lokasi sign-in + jabatan
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
  const location = url.searchParams.get("location");
  const role = url.searchParams.get("role");

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

  // 3) Gate penuh dari lokasi sign-in + jabatan (resolve cabang dari
  //    geofence → cek jabatan → cek opname → keputusan).
  if (location) {
    const branchId = resolveStockGateBranchFromLocation(location);
    const decision = await guardCheckoutByStockOpname({
      matchedLocationId: location,
      businessUnit: "Yeobo Space",
      jobRole: role,
    });
    return NextResponse.json({
      mode: "live-location",
      location,
      role: role ?? null,
      resolvedBranch: branchId,
      gated: branchId !== null,
      decision,
    });
  }

  return NextResponse.json({
    usage: {
      mock: "?mock=false | ?mock=true",
      liveBranch: `?branch=${STOCK_BRANCH_IDS.join("|")}`,
      liveLocation: "?location=<geofence-uuid>&role=Manager",
    },
    branches: STOCK_BRANCH_IDS,
    studioGeofences: {
      tlogosari: "6e0ba10c-b6b7-4c32-b488-8a7f08a1d05b",
      tembalang: "54d9029e-06b4-4967-995a-f4a80125f7b4",
      jebres: "fed542f3-c9a7-4bbd-bdc9-cfc1f6fe2a51",
    },
  });
}
