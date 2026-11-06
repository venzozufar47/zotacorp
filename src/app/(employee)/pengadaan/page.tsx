export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ArrowLeft, ClipboardList } from "lucide-react";
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
import { CashStrip } from "@/components/procurement/CashStrip";
import { getShopeeWallet } from "@/lib/actions/procurement-shopee.actions";
import { MaterialsManager } from "@/components/procurement/MaterialsManager";
import { OpnameBanner } from "@/components/procurement/OpnameBanner";
import { getTodayCountPlan } from "@/lib/actions/procurement-count.actions";
import { pickActiveBrand, COSTING_BRAND_COOKIE } from "@/lib/costing/brands";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { ProcurementBoard } from "@/components/procurement/ProcurementBoard";
import { PengadaanTabs, BrandPills, type PengadaanTab, type BelanjaSection } from "@/components/procurement/PengadaanTabs";
import { PengadaanCatat } from "@/components/procurement/PengadaanCatat";
import { PurchaseHistory, PurchaseSummaryCard } from "@/components/procurement/PurchaseHistory";
import { listOrders } from "@/lib/actions/procurement-orders.actions";
import { OrdersPanel } from "@/components/procurement/OrdersPanel";

const TAB_KEYS: readonly PengadaanTab[] = ["catat", "belanja", "stok", "bahan"];

/**
 * Pengadaan & Pengeluaran untuk petugas cabang: catat nota belanja (bahan baku + pengeluaran lain), lihat
 * riwayat & total bulan ini, dan papan pantau stok bahan.
 *
 * Daftar brand HANYA dari penugasan (`myProcurementBusinessUnits`) â€” `?bu=` yang tak ada di situ diabaikan,
 * bukan dihormati, supaya petugas tidak bisa mengintip cabang lain lewat URL.
 */
export default async function PengadaanPage({
  searchParams,
}: {
  searchParams: Promise<{ bu?: string; tab?: string; bahan?: string; bagian?: string }>;
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

  const { bu, tab: tabParam, bahan, bagian } = await searchParams;
  const lastOpened = (await cookies()).get(COSTING_BRAND_COOKIE)?.value;
  // Tanpa ?bu= eksplisit, cabang awal diutamakan di tempat akun ini PETUGAS pengadaan (bukan sekadar kasir),
  // supaya "Uang pengadaan" tidak terkunci hanya karena Pare urut pertama abjad.
  const defaultPool = bu && brands.includes(bu) ? brands : staffBrands.length > 0 ? staffBrands : brands;
  const activeBrand = pickActiveBrand(defaultPool, bu, lastOpened) ?? null;
  const limited = !!activeBrand && !staffBrands.includes(activeBrand);
  // Nama tab lama (?tab=pesanan / ?tab=riwayat) tetap dikenali: keduanya kini bagian dari tab Belanja.
  const legacySection: BelanjaSection | null = tabParam === "pesanan" || tabParam === "riwayat" ? tabParam : null;
  const tab: PengadaanTab = limited
    ? "catat"
    : legacySection
      ? "belanja"
      : (TAB_KEYS.find((k) => k === tabParam) ?? "catat");

  const today = jakartaDateString(new Date());
  // Jumlah pesanan belum tiba untuk badge tab (hanya petugas pengadaan).
  const ordersRes = !limited && activeBrand ? await listOrders(activeBrand) : null;
  const inTransitCount = ordersRes && ordersRes.ok ? (ordersRes.data?.inTransit.length ?? 0) : 0;
  const monthStart = `${today.slice(0, 7)}-01`;
  const section: BelanjaSection =
    legacySection ?? (bagian === "pesanan" || bagian === "riwayat" ? bagian : inTransitCount > 0 ? "pesanan" : "riwayat");

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <Link
          href="/dashboard"
          className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground active:bg-muted"
          aria-label="Kembali"
        >
          <ArrowLeft size={20} />
        </Link>
        <h1 className="font-display text-xl font-bold tracking-tight">Pengadaan</h1>
        <div className="ml-auto">
          <BrandPills
            brands={brands}
            activeBrand={activeBrand}
            href={(b) => `/pengadaan?tab=${tab}&bu=${encodeURIComponent(b)}`}
          />
        </div>
      </div>

      {brands.length === 0 || !activeBrand ? (
        <p className="text-sm text-muted-foreground">
          Kamu belum ditugaskan ke cabang mana pun. Hubungi admin.
        </p>
      ) : (
        <>
          {!limited && <OpnameReminder brand={activeBrand} />}
          {!limited && <PengadaanTabs active={tab} activeBrand={activeBrand} inTransitCount={inTransitCount} />}
          {!limited && tab === "catat" && <PositionBar brand={activeBrand} />}
          {tab === "catat" && <CatatTab brand={activeBrand} initialMaterialId={bahan} />}
          {tab === "belanja" && ordersRes && (
            <BelanjaTab
              brand={activeBrand}
              section={section}
              inTransitCount={inTransitCount}
              ordersRes={ordersRes}
              today={today}
              monthStart={monthStart}
            />
          )}
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

type OrdersResult = NonNullable<Awaited<ReturnType<typeof listOrders>>>;

/** Tab Belanja: pesanan yang masih di jalan dan riwayat nota, dipilih lewat dua tombol kecil. */
async function BelanjaTab({
  brand,
  section,
  inTransitCount,
  ordersRes,
  today,
  monthStart,
}: {
  brand: string;
  section: BelanjaSection;
  inTransitCount: number;
  ordersRes: OrdersResult;
  today: string;
  monthStart: string;
}) {
  const href = (s: BelanjaSection) => `/pengadaan?tab=belanja&bagian=${s}&bu=${encodeURIComponent(brand)}`;
  const opts: { key: BelanjaSection; label: string; count?: number }[] = [
    { key: "pesanan", label: "Pesanan", count: inTransitCount },
    { key: "riwayat", label: "Riwayat nota" },
  ];
  return (
    <div className="mx-auto max-w-xl space-y-3">
      <div role="group" aria-label="Bagian Belanja" className="inline-flex rounded-lg border border-border p-0.5">
        {opts.map((o) => (
          <Link
            key={o.key}
            href={href(o.key)}
            prefetch={false}
            aria-current={section === o.key ? "true" : undefined}
            className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3.5 text-[13px] font-semibold transition-colors ${
              section === o.key ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            {o.label}
            {o.count ? <span className="tabular-nums opacity-80">{o.count}</span> : null}
          </Link>
        ))}
      </div>
      {section === "pesanan" ? (
        ordersRes.ok && ordersRes.data ? (
          <OrdersPanel businessUnit={brand} data={ordersRes.data} />
        ) : (
          <p className="text-sm text-destructive">{ordersRes.ok ? "Gagal memuat pesanan" : ordersRes.error}</p>
        )
      ) : (
        <RiwayatTab brand={brand} today={today} monthStart={monthStart} />
      )}
    </div>
  );
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
    <div className="space-y-3">
      {sumRes.ok && sumRes.data && <PurchaseSummaryCard compact summary={sumRes.data} title={`Pengeluaran ${monthLabel}`} />}
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

/** Saldo uang pengadaan & saldo laci cabang aktif â€” dilihat petugas sebelum mencatat belanja. */
async function PositionBar({ brand }: { brand: string }) {
  const [res, shopee] = await Promise.all([getCashPosition(brand), getShopeeWallet(brand)]);
  if (!res.ok || !res.data) return null;
  return (
    <div className="mx-auto max-w-xl">
      <CashStrip position={res.data} wallet={shopee.ok && shopee.data ? shopee.data : null} />
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
    <div className="space-y-3">
      <Link
        href={`/pengadaan/opname?bu=${encodeURIComponent(brand)}`}
        className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-semibold active:bg-muted"
      >
        <ClipboardList size={16} aria-hidden /> Opname bahan
        <span className="ml-auto text-xs font-normal text-muted-foreground">hitung stok</span>
      </Link>
    <ProcurementBoard
      brands={brands}
      activeBrand={brand}
      basePath="/pengadaan?tab=stok"
      embedded
      rows={boardRes.ok ? (boardRes.data ?? []) : []}
      goodsIn={goodsRes.ok ? (goodsRes.data ?? []) : []}
      brandInfo={brandRes.ok ? brandRes.data : undefined}
    />
    </div>
  );
}
