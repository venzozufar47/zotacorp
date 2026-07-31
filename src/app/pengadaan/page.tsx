export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/cached";
import {
  canOpenProcurement,
  canManageProcurement,
  myProcurementBusinessUnits,
} from "@/lib/procurement/access";
import {
  listProcurementBoard,
  listGoodsIn,
} from "@/lib/actions/procurement.actions";
import { pickActiveBrand, COSTING_BRAND_COOKIE } from "@/lib/costing/brands";
import { ProcurementBoard } from "@/components/procurement/ProcurementBoard";

/**
 * Papan pantau stok bahan baku untuk staf pengadaan.
 *
 * Daftar brand HANYA dari penugasan (`myProcurementBusinessUnits`) —
 * `?bu=` yang tak ada di situ diabaikan, bukan dihormati, supaya staf
 * tidak bisa mengintip brand lain lewat URL.
 */
export default async function PengadaanPage({
  searchParams,
}: {
  searchParams: Promise<{ bu?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!(await canOpenProcurement())) redirect("/dashboard");
  if (await canManageProcurement()) redirect("/admin/costing/pengadaan");

  const { bu } = await searchParams;
  const brands = await myProcurementBusinessUnits();
  const lastOpened = (await cookies()).get(COSTING_BRAND_COOKIE)?.value;
  const activeBrand = pickActiveBrand(brands, bu, lastOpened);

  const [boardRes, goodsRes] = await Promise.all([
    activeBrand ? listProcurementBoard(activeBrand) : Promise.resolve(null),
    activeBrand ? listGoodsIn(activeBrand, 20) : Promise.resolve(null),
  ]);
  const rows = boardRes && boardRes.ok ? boardRes.data ?? [] : [];
  const goodsIn = goodsRes && goodsRes.ok ? goodsRes.data ?? [] : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href="/dashboard"
          className="rounded-full p-2 hover:bg-muted text-muted-foreground"
          aria-label="Kembali"
        >
          <ArrowLeft size={18} strokeWidth={2.5} />
        </Link>
        <div>
          <h1 className="font-display text-xl font-extrabold tracking-tight leading-none">
            Pengadaan<span className="text-primary">.</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Pantau stok bahan baku, hitung titik pesan &amp; jumlah beli, catat
            barang masuk.
          </p>
        </div>
      </div>

      {brands.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Kamu belum ditugaskan ke unit bisnis mana pun. Hubungi admin.
        </p>
      ) : (
        <ProcurementBoard
          brands={brands}
          activeBrand={activeBrand ?? null}
          rows={rows}
          goodsIn={goodsIn}
        />
      )}
    </div>
  );
}
