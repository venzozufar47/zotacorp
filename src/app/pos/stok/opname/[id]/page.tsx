export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/cached";
import { getStockOpname } from "@/lib/actions/pos-stock.actions";
import { StockOpnameResult } from "@/components/pos/StockOpnameResult";

export default async function PosStockOpnameDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const res = await getStockOpname(id);
  if (!res.ok || !res.data) redirect("/pos/stok");

  return <StockOpnameResult detail={res.data} />;
}
