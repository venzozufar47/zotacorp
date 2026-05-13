export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import {
  getCakeOrder,
  listCakeOrderPayments,
} from "@/lib/actions/cake-orders.actions";
import {
  listCakeOptions,
  listCakeDiameterOptions,
  listCakeBasePrices,
} from "@/lib/actions/cake-options.actions";
import { CakeOrderDetail } from "@/components/cake/CakeOrderDetail";

export default async function AdminCakeOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const [orderRes, optsRes, paymentsRes, diaRes, priceRes] = await Promise.all([
    getCakeOrder(id),
    listCakeOptions(),
    listCakeOrderPayments(id),
    listCakeDiameterOptions({ activeOnly: true }),
    listCakeBasePrices(),
  ]);
  if (!orderRes.ok) {
    return (
      <div className="max-w-md mx-auto py-12 text-center text-sm text-destructive">
        {orderRes.error}
      </div>
    );
  }
  return (
    <CakeOrderDetail
      order={orderRes.data!.order}
      attachments={orderRes.data!.attachments}
      payments={paymentsRes.ok ? paymentsRes.data ?? [] : []}
      slipLock={orderRes.data!.slipLock}
      optionsByKind={optsRes.ok ? optsRes.data! : null}
      diameters={diaRes.ok ? diaRes.data ?? [] : []}
      prices={priceRes.ok ? priceRes.data ?? [] : []}
      isAdminView={true}
      canEdit={false}
    />
  );
}
