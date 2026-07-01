export const dynamic = "force-dynamic";

import { CashBranchPage } from "@/components/cash/CashBranchPage";

// Haengbocake Semarang
export default async function CashSemarangPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  return <CashBranchPage slug="cash_semarang" searchParams={await searchParams} />;
}
