export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { listBusinessUnits } from "@/lib/actions/business-units.actions";
import { costingBrands, pickActiveBrand, COSTING_BRAND_COOKIE } from "@/lib/costing/brands";
import {
  getCostingDashboard,
  listMaterials,
  listProductsWithHpp,
  listUnits,
} from "@/lib/actions/costing.actions";
import { HubHeader, type HubTab } from "@/components/admin/costing/hub/HubHeader";
import { ProductsTab } from "@/components/admin/costing/hub/ProductsTab";
import { MaterialsManager } from "@/components/admin/costing/MaterialsManager";

const TABS: HubTab[] = [
  { key: "produk", label: "Produk" },
  { key: "bahan", label: "Bahan" },
];

/**
 * Hub HPP & Margin (admin). Dua tab: Produk (HPP, harga jual, margin, tren) dan Bahan
 * (harga beli & konversi). Menggantikan halaman Costing, Dashboard Margin, dan Master Bahan.
 */
export default async function AdminCostingPage({
  searchParams,
}: {
  searchParams: Promise<{ bu?: string; tab?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if ((await getCurrentRole()) !== "admin") redirect("/dashboard");

  const { bu, tab: rawTab } = await searchParams;
  const tab = rawTab === "bahan" ? "bahan" : "produk";
  const units = await listBusinessUnits();
  const brands = costingBrands(units.map((u) => u.name));
  const lastOpened = (await cookies()).get(COSTING_BRAND_COOKIE)?.value;
  const activeBrand = pickActiveBrand(brands, bu, lastOpened);

  return (
    <div className="animate-fade-up">
      <HubHeader
        title="HPP & Margin"
        basePath="/admin/costing"
        tabs={TABS}
        activeTab={tab}
        brands={brands}
        activeBrand={activeBrand ?? null}
      />
      {!activeBrand ? (
        <p className="text-sm text-muted-foreground">
          Belum ada brand. Tambahkan dulu di{" "}
          <Link href="/admin/settings" className="underline">
            Settings
          </Link>
          .
        </p>
      ) : tab === "produk" ? (
        <ProductsTabLoader brand={activeBrand} />
      ) : (
        <MaterialsTabLoader brand={activeBrand} />
      )}
    </div>
  );
}

async function ProductsTabLoader({ brand }: { brand: string }) {
  const res = await getCostingDashboard(brand);
  const data = res.ok
    ? res.data!
    : { rows: [], avgMarginPercent: null, belowTargetCount: 0, hppRoseCount: 0 };
  return <ProductsTab brand={brand} data={data} />;
}

async function MaterialsTabLoader({ brand }: { brand: string }) {
  const [res, prodRes, unitRes] = await Promise.all([
    listMaterials(brand),
    listProductsWithHpp(brand),
    listUnits(),
  ]);
  return (
    <MaterialsManager
      activeBrand={brand}
      rows={res.ok ? (res.data ?? []) : []}
      products={prodRes.ok ? (prodRes.data ?? []) : []}
      units={unitRes.ok ? (unitRes.data ?? []) : []}
    />
  );
}
