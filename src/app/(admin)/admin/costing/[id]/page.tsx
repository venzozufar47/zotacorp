export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import {
  getProduct,
  listMaterials,
  listUnits,
  listPosOptions,
} from "@/lib/actions/costing.actions";
import { RecipeBuilder } from "@/components/admin/costing/RecipeBuilder";

export default async function AdminCostingProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const res = await getProduct(id);
  if (!res.ok) {
    return (
      <div className="max-w-md mx-auto py-12 text-center text-sm text-destructive">
        {res.error}
      </div>
    );
  }
  const { product, items } = res.data!;
  const [matsRes, unitsRes, posRes] = await Promise.all([
    listMaterials(product.business_unit),
    listUnits(),
    listPosOptions(product.business_unit),
  ]);

  return (
    <div className="animate-fade-up">
      <RecipeBuilder
        product={product}
        initialItems={items}
        materials={matsRes.ok ? matsRes.data ?? [] : []}
        units={unitsRes.ok ? unitsRes.data ?? [] : []}
        posOptions={posRes.ok ? posRes.data ?? [] : []}
      />
    </div>
  );
}
