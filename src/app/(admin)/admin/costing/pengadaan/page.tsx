export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Users } from "lucide-react";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { listBusinessUnits } from "@/lib/actions/business-units.actions";
import {
  costingBrands,
  pickActiveBrand,
  COSTING_BRAND_COOKIE,
} from "@/lib/costing/brands";
import {
  listProcurementBoard,
  listGoodsIn,
} from "@/lib/actions/procurement.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { ProcurementBoard } from "@/components/procurement/ProcurementBoard";

/** Papan pantau pengadaan versi admin — bebas memilih brand mana pun. */
export default async function AdminProcurementPage({
  searchParams,
}: {
  searchParams: Promise<{ bu?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const { bu } = await searchParams;
  const units = await listBusinessUnits();
  const brands = costingBrands(units.map((u) => u.name));
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
      <PageHeader
        title="Pengadaan"
        subtitle="Stok bahan baku, titik pesan, dan barang masuk"
        action={
          <Link
            href="/admin/costing/pengadaan/akses"
            className="inline-flex items-center gap-1.5 h-9 rounded-xl border-2 border-foreground bg-card px-3 text-sm font-semibold hover:bg-muted transition"
          >
            <Users size={15} /> Akses &amp; setelan
          </Link>
        }
      />
      {brands.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada brand.</p>
      ) : (
        <ProcurementBoard
          brands={brands}
          activeBrand={activeBrand ?? null}
          rows={rows}
          goodsIn={goodsIn}
          basePath="/admin/costing/pengadaan"
        />
      )}
    </div>
  );
}
