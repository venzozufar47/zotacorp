export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/cached";
import { getMyCakeAccess } from "@/lib/cake-orders/access";
import {
  listCakeOptions,
  listCakeDiameterOptions,
  listCakeBasePrices,
} from "@/lib/actions/cake-options.actions";
import { NewCakeOrderForm } from "@/components/cake/NewCakeOrderForm";

export default async function NewCakeOrderPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const access = await getMyCakeAccess();
  if (!access.hasOrders) redirect("/dashboard");

  const [optionsRes, diaRes, priceRes] = await Promise.all([
    listCakeOptions(),
    listCakeDiameterOptions({ activeOnly: true }),
    listCakeBasePrices(),
  ]);
  if (!optionsRes.ok) {
    return (
      <div className="max-w-md mx-auto py-12 text-center text-sm text-destructive">
        Gagal memuat opsi: {optionsRes.error}
      </div>
    );
  }
  return (
    <NewCakeOrderForm
      optionsByKind={optionsRes.data!}
      diameters={diaRes.ok ? diaRes.data ?? [] : []}
      prices={priceRes.ok ? priceRes.data ?? [] : []}
    />
  );
}
