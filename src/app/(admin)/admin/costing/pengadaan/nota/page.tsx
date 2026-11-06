import { redirect } from "next/navigation";

/** Nota Belanja kini tab di hub Pengadaan. Rute ini tetap ada karena dipakai tautan notifikasi push. */
export default async function LegacyNotaRoute({
  searchParams,
}: {
  searchParams: Promise<{ bu?: string; m?: string }>;
}) {
  const { bu, m } = await searchParams;
  const q = new URLSearchParams({ tab: "nota" });
  if (bu) q.set("bu", bu);
  if (m) q.set("m", m);
  redirect(`/admin/costing/pengadaan?${q.toString()}`);
}
