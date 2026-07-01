export const dynamic = "force-dynamic";

import { CashBranchPage } from "@/components/cash/CashBranchPage";

// Yeotem = Yeobo Space Tembalang
export default async function CashYeotemPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  return <CashBranchPage slug="cash_yeotem" searchParams={await searchParams} />;
}
