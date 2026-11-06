import { redirect } from "next/navigation";

/** Master Bahan kini tab "Bahan" di hub HPP & Margin. Rute lama dipertahankan agar tautan lama tetap jalan. */
export default async function LegacyMaterialsRoute({
  searchParams,
}: {
  searchParams: Promise<{ bu?: string }>;
}) {
  const { bu } = await searchParams;
  redirect(`/admin/costing?tab=bahan${bu ? `&bu=${encodeURIComponent(bu)}` : ""}`);
}
