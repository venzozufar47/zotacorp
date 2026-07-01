export const dynamic = "force-dynamic";

import { CashBranchPage } from "@/components/cash/CashBranchPage";

// Yeosari = Yeobo Space Tlogosari
export default async function CashYeosariPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  return <CashBranchPage slug="cash_yeosari" searchParams={await searchParams} />;
}
