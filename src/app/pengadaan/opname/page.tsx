export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/cached";
import {
  canOpenProcurement,
  canManageProcurement,
  myProcurementBusinessUnits,
} from "@/lib/procurement/access";
import { startMaterialOpname } from "@/lib/actions/procurement.actions";
import { MaterialOpnameForm } from "@/components/procurement/MaterialOpnameForm";

/**
 * Opname bahan baku. `?bu=` selalu divalidasi ulang terhadap penugasan —
 * brand di luar itu tidak dirender, bukan sekadar disembunyikan.
 */
export default async function OpnameBahanPage({
  searchParams,
}: {
  searchParams: Promise<{ bu?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!(await canOpenProcurement())) redirect("/dashboard");

  const { bu } = await searchParams;
  // Admin boleh brand apa pun; staf hanya yang ditugaskan. Jangan
  // menyimpulkan "admin" dari daftar penugasan kosong — admin yang
  // kebetulan juga ditugaskan akan salah dinilai.
  const isAdmin = await canManageProcurement();
  const brands = await myProcurementBusinessUnits();
  const activeBrand = bu && (isAdmin || brands.includes(bu)) ? bu : brands[0];
  if (!activeBrand) redirect(isAdmin ? "/admin/costing/pengadaan" : "/pengadaan");

  const res = await startMaterialOpname(activeBrand);
  const rows = res.ok ? res.data ?? [] : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href={`/pengadaan?bu=${encodeURIComponent(activeBrand)}`}
          className="rounded-full p-2 hover:bg-muted text-muted-foreground"
          aria-label="Kembali"
        >
          <ArrowLeft size={18} strokeWidth={2.5} />
        </Link>
        <div>
          <h1 className="font-display text-xl font-extrabold tracking-tight leading-none">
            Opname bahan<span className="text-primary">.</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            {activeBrand} — hitung fisik jadi patokan stok berikutnya.
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {res.ok ? "Belum ada bahan untuk brand ini." : res.error}
        </p>
      ) : (
        <MaterialOpnameForm businessUnit={activeBrand} rows={rows} />
      )}
    </div>
  );
}
