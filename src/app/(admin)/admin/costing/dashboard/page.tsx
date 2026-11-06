import { redirect } from "next/navigation";

/** Dashboard Margin kini menyatu dengan tab "Produk" di hub HPP & Margin. Rute lama dipertahankan untuk tautan lama. */
export default async function LegacyDashboardRoute({
  searchParams,
}: {
  searchParams: Promise<{ bu?: string }>;
}) {
  const { bu } = await searchParams;
  redirect(`/admin/costing?tab=produk${bu ? `&bu=${encodeURIComponent(bu)}` : ""}`);
}
