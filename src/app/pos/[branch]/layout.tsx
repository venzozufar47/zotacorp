import { redirect } from "next/navigation";
import { posBranchFromParam } from "@/lib/pos/branch";

/**
 * Guard cabang POS. Segmen `[branch]` hanya boleh `pare` | `semarang`
 * (dari rewrite `/pospare` & `/possemarang`). Deep-link lama seperti
 * `/pos/produk` akan match `[branch]="produk"` → tak valid → redirect ke
 * `/pospare`.
 */
export default async function PosBranchLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ branch: string }>;
}) {
  const { branch } = await params;
  if (!posBranchFromParam(branch)) redirect("/pospare");
  return <>{children}</>;
}
