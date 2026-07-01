export const dynamic = "force-dynamic";

import { CashBranchPage } from "@/components/cash/CashBranchPage";

// Yeosol = Yeobo Space Jebres
export default async function CashYeosolPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  return <CashBranchPage slug="cash_yeosol" searchParams={await searchParams} />;
}
