export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/cached";
import {
  canOpenProcurement,
  canManageProcurement,
  myProcurementBusinessUnits,
} from "@/lib/procurement/access";
import { listProcurementBoard, listGoodsIn } from "@/lib/actions/procurement.actions";
import {
  getMyDrawerExpenseBrands,
  getPurchaseFormData,
  getPurchaseSummary,
  listPurchases,
} from "@/lib/actions/procurement-purchases.actions";
import { listMaterialDetails } from "@/lib/actions/procurement-materials.actions";
import { getBrandSummaries, listBrandsNeedingInfo } from "@/lib/actions/procurement-brands.actions";
import { getCashPosition } from "@/lib/actions/procurement-wallet.actions";
import { CashPositionCard } from "@/components/procurement/CashPositionCard";
import { getShopeeWallet } from "@/lib/actions/procurement-shopee.actions";
import { ShopeeWalletCard } from "@/components/procurement/ShopeeWalletCard";
import { MaterialsManager } from "@/components/procurement/MaterialsManager";
import { OpnameBanner } from "@/components/procurement/OpnameBanner";
import { getTodayCountPlan } from "@/lib/actions/procurement-count.actions";
import { pickActiveBrand, COSTING_BRAND_COOKIE } from "@/lib/costing/brands";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { ProcurementBoard } from "@/components/procurement/ProcurementBoard";
import { PengadaanTabs, type PengadaanTab } from "@/components/procurement/PengadaanTabs";
import { PengadaanCatat } from "@/components/procurement/PengadaanCatat";
import { PurchaseHistory, PurchaseSummaryCard } from "@/components/procurement/PurchaseHistory";

const TAB_KEYS: readonly PengadaanTab[] = ["catat", "riwayat", "stok", "bahan"];

/**
 * Pengadaan & Pengeluaran untuk petugas cabang: catat nota belanja (bahan baku + pengeluaran lain), lihat
 * riwayat & total bulan ini, dan papan pantau stok bahan.
 *
 * Daftar brand HANYA dari penugasan (`myProcurementBusinessUnits`) — `?bu=` yang tak ada di situ diabaikan,
 * bukan dihormati, supaya petugas tidak bisa mengintip cabang lain lewat URL.
 */
export default async function PengadaanPage({
  searchParams,
}: {
  searchParams: Promise<{ bu?: string; tab?: string; bahan?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  // Admin bebas ke cabang mana pun (untuk mencoba form atau mencatat nota susulan); petugas hanya cabangnya.
  const isAdmin = await canManageProcurement();
  const staffBrands = isAdmin
    ? ["Haengbocake Pare", "Haengbocake Semarang"]
    : (await canOpenProcurement())
      ? await myProcurementBusinessUnits()
      : [];
  // Akun kasir (asisten POS) yang bukan petugas pengadaan: hanya boleh mencatat pengeluaran uang laci.
  const drawerBrands = await getMyDrawerExpenseBrands();
  const brands = [...new Set([...staffBrands, ...drawerBrands])].sort();
  if (brands.length === 0) redirect("/dashboard");

  const { bu, tab: tabParam, bahan } = await searchParams;
  const lastOpened = (await cookies()).get(COSTING_BRAND_COOKIE)?.value;
  // Tanpa ?bu= eksplisit, cabang awal diutamakan di tempat akun ini PETUGAS pengadaan (bukan sekadar kasir),
  // supaya "Uang pengadaan" tidak terkunci hanya karena Pare urut pertama abjad.
  const defaultPool = bu && brands.includes(bu) ? brands : staffBrands.length > 0 ? staffBrands : brands;
  const activeBrand = pickActiveBrand(defaultPool, bu, lastOpened) ?? null;
  const limited = !!activeBrand && !staffBrands.includes(activeBrand);
  const tab: PengadaanTab = limited ? "catat" : (TAB_KEYS.find((k) => k === tabParam) ?? "catat");

  const today = jakartaDateString(new Date());
  const monthStart = `${today.slice(0, 7)}-01`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href="/dashboard"
          className="rounded-full p-2 text-muted-foreground hover:bg-muted"
          aria-label="Kembali"
        >
          <ArrowLeft size={18} strokeWidth={2.5} />
        </Link>
        <div>
          <h1 className="font-display text-xl font-extrabold leading-none tracking-tight">
            Pengadaan &amp; Pengeluaran<span className="text-primary">.</span>
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Catat belanja dengan foto nota, pantau pengeluaran, dan jaga stok bahan baku.
          </p>
        </div>
      </div>

      {brands.length === 0 || !activeBrand ? (
        <p className="text-sm text-muted-foreground">
          Kamu belum ditugaskan ke cabang mana pun. Hubungi admin.
        </p>
      ) : (
        <>
          {!limited && <OpnameReminder brand={activeBrand} />}
          <PengadaanTabs active={tab} brands={brands} activeBrand={activeBrand} limited={limited} />
          {!limited && tab === "catat" && <PositionBar brand={activeBrand} />}
          {tab === "catat" && <CatatTab brand={activeBrand} initialMaterialId={bahan} />}
          {tab === "riwayat" && <RiwayatTab brand={activeBrand} today={today} monthStart={monthStart} />}
          {tab === "stok" && <StokTab brand={activeBrand} brands={brands} />}
          {tab === "bahan" && <BahanTab brand={activeBrand} />}
        </>
      )}
    </div>
  );
}

async function CatatTab({ brand, initialMaterialId }: { brand: string; initialMaterialId?: string }) {
  const res = await getPurchaseFormData(brand);
  if (!res.ok || !res.data)
    return <p className="text-sm text-destructive">{res.ok ? "Gagal memuat form" : res.error}</p>;
  return <PengadaanCatat data={res.data} initialMaterialId={initialMaterialId} />;
}

async function RiwayatTab({ brand, today, monthStart }: { brand: string; today: string; monthStart: string }) {
  const [listRes, sumRes] = await Promise.all([
    listPurchases(brand, { limit: 60 }),
    getPurchaseSummary(brand, monthStart, today),
  ]);
  const purchases = listRes.ok ? (listRes.data ?? []) : [];
  const monthLabel = new Date(monthStart + "T00:00:00Z").toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return (
    <div className="mx-auto max-w-xl space-y-4">
      {sumRes.ok && sumRes.data && <PurchaseSummaryCard summary={sumRes.data} title={`Pengeluaran ${monthLabel}`} />}
      <PurchaseHistory purchases={purchases} today={today} />
    </div>
  );
}

/** Pengingat opname harian (hanya cabang yang sudah memakai ritme harian). */
async function OpnameReminder({ brand }: { brand: string }) {
  const res = await getTodayCountPlan(brand);
  if (!res.ok || !res.data) return null;
  return <OpnameBanner plan={res.data} brand={brand} />;
}

/** Saldo uang pengadaan & saldo laci cabang aktif — dilihat petugas sebelum mencatat belanja. */
async function PositionBar({ brand }: { brand: string }) {
  const [res, shopee] = await Promise.all([getCashPosition(brand), getShopeeWallet(brand)]);
  if (!res.ok || !res.data) return null;
  return (
    <div className="mx-auto max-w-xl space-y-3">
      <CashPositionCard positions={[res.data]} />
      {shopee.ok && shopee.data && <ShopeeWalletCard wallet={shopee.data} />}
    </div>
  );
}

async function BahanTab({ brand }: { brand: string }) {
  const [res, queue] = await Promise.all([listMaterialDetails(brand), listBrandsNeedingInfo(brand)]);
  if (!res.ok) return <p className="text-sm text-destructive">{res.error}</p>;
  return (
    <MaterialsManager
      businessUnit={brand}
      materials={res.data ?? []}
      queue={queue.ok ? queue.data?.items ?? [] : []}
      queueTotal={queue.ok ? queue.data?.total ?? 0 : 0}
    />
  );
}

async function StokTab({ brand, brands }: { brand: string; brands: string[] }) {
  const [boardRes, goodsRes, brandRes] = await Promise.all([listProcurementBoard(brand), listGoodsIn(brand, 20), getBrandSummaries(brand)]);
  return (
    <ProcurementBoard
      brands={brands}
      activeBrand={brand}
      basePath="/pengadaan?tab=stok"
      rows={boardRes.ok ? (boardRes.data ?? []) : []}
      goodsIn={goodsRes.ok ? (goodsRes.data ?? []) : []}
      brandInfo={brandRes.ok ? brandRes.data : undefined}
    />
  );
}
