export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { listBusinessUnits } from "@/lib/actions/business-units.actions";
import {
  costingBrands,
  pickActiveBrand,
  COSTING_BRAND_COOKIE,
} from "@/lib/costing/brands";
import { listMaterials, listProductsWithHpp, listUnits } from "@/lib/actions/costing.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { MaterialsManager } from "@/components/admin/costing/MaterialsManager";

export default async function AdminCostingMaterialsPage({
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

  const [res, prodRes, unitRes] = await Promise.all([
    activeBrand ? listMaterials(activeBrand) : null,
    activeBrand ? listProductsWithHpp(activeBrand) : null,
    listUnits(),
  ]);
  const rows = res && res.ok ? res.data ?? [] : [];
  const products = prodRes && prodRes.ok ? prodRes.data ?? [] : [];
  const costingUnits = unitRes.ok ? unitRes.data ?? [] : [];

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Master Bahan"
        subtitle="Harga beli & konversi ke satuan pakai. Ubah harga → semua produk otomatis ter-reprice."
      />
      <MaterialsManager
        brands={brands}
        activeBrand={activeBrand ?? null}
        rows={rows}
        products={products}
        units={costingUnits}
      />
    </div>
  );
}
