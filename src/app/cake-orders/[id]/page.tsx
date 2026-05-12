export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/cached";
import { getMyCakeAccess } from "@/lib/cake-orders/access";
import {
  getCakeOrder,
  listCakeOrderPayments,
} from "@/lib/actions/cake-orders.actions";
import { listCakeOptions } from "@/lib/actions/cake-options.actions";
import { CakeOrderDetail } from "@/components/cake/CakeOrderDetail";

export default async function CakeOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const access = await getMyCakeAccess();
  if (!access.hasOrders && !access.hasProduction) redirect("/dashboard");

  const [orderRes, optionsRes, paymentsRes] = await Promise.all([
    getCakeOrder(id),
    listCakeOptions(),
    listCakeOrderPayments(id),
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
      optionsByKind={optionsRes.ok ? optionsRes.data! : null}
      isAdminView={false}
      canEdit={access.hasOrders}
    />
  );
}
