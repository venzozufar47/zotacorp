import { redirect } from "next/navigation";
import { posBranchFromParam } from "@/lib/pos/branch";

/**
 * Guard cabang. Segmen `[branch]` hanya boleh `pare` | `semarang` — sama
 * daftar cabang dengan POS (lihat `src/app/pos/[branch]/layout.tsx`).
 */
export default async function TutupKasBranchLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ branch: string }>;
}) {
  const { branch } = await params;
  if (!posBranchFromParam(branch)) redirect("/tutup-kas");
  return <>{children}</>;
}
