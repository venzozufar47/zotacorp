import { myProcurementBusinessUnits } from "@/lib/procurement/access";
import { isCycleCountBrand } from "@/lib/procurement/count-plan";
import { getTodayCountPlan } from "@/lib/actions/procurement-count.actions";
import { OpnameBanner } from "./OpnameBanner";

/** Pengingat opname di beranda karyawan untuk petugas pengadaan cabang yang memakai ritme harian. Kosong bagi yang lain. */
export async function OpnameDashboardCard() {
  const brands = (await myProcurementBusinessUnits()).filter(isCycleCountBrand);
  if (brands.length === 0) return null;
  const plans = await Promise.all(brands.map(async (b) => ({ brand: b, res: await getTodayCountPlan(b) })));
  return (
    <>
      {plans.map(({ brand, res }) => (res.ok && res.data ? <OpnameBanner key={brand} plan={res.data} brand={brand} /> : null))}
    </>
  );
}
