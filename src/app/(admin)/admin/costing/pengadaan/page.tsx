export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ClipboardList, PackagePlus, Settings } from "lucide-react";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { listBusinessUnits } from "@/lib/actions/business-units.actions";
import { costingBrands, pickActiveBrand, COSTING_BRAND_COOKIE } from "@/lib/costing/brands";
import { listProcurementBoard, listGoodsIn } from "@/lib/actions/procurement.actions";
import {
  getPurchaseSummary,
  listPendingMaterials,
  listPurchases,
} from "@/lib/actions/procurement-purchases.actions";
import { listMaterialChanges } from "@/lib/actions/procurement-materials.actions";
import { getAllCashPositions } from "@/lib/actions/procurement-wallet.actions";
import { getShopeeWallet } from "@/lib/actions/procurement-shopee.actions";
import {
  listProcurementAssignments,
  listEligibleProfiles,
  getProcurementSettings,
} from "@/lib/actions/procurement-admin.actions";
import { PROCUREMENT_DEFAULTS } from "@/lib/procurement/calc";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { HubHeader, type HubTab } from "@/components/admin/costing/hub/HubHeader";
import { ProcurementBoard } from "@/components/procurement/ProcurementBoard";
import { ProcurementAccessManager } from "@/components/admin/costing/ProcurementAccessManager";
import { NotaTab } from "@/components/admin/costing/hub/NotaTab";

type TabKey = "stok" | "nota" | "akses";
/** Cabang yang punya nota belanja. */
const NOTA_BRANDS = ["Haengbocake Pare", "Haengbocake Semarang"];

const outlineBtn =
  "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-semibold transition-colors hover:bg-muted";

/**
 * Hub Pengadaan (admin). Tiga tab: Stok (papan pantau), Nota (belanja + tinjauan), Akses & setelan.
 * Menggantikan halaman Pengadaan, Nota Belanja, dan Akses.
 */
export default async function AdminProcurementHubPage({
  searchParams,
}: {
  searchParams: Promise<{ bu?: string; tab?: string; m?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if ((await getCurrentRole()) !== "admin") redirect("/dashboard");

  const { bu, tab: rawTab, m } = await searchParams;
  const tab: TabKey = rawTab === "nota" || rawTab === "akses" ? rawTab : "stok";
  const units = await listBusinessUnits();
  const brands = costingBrands(units.map((u) => u.name));
  const lastOpened = (await cookies()).get(COSTING_BRAND_COOKIE)?.value;

  // Angka penanda di tab Nota: bahan menunggu tinjauan + perubahan daftar bahan yang belum dilihat.
  const [pendRes, changesRes] = await Promise.all([listPendingMaterials(), listMaterialChanges({ limit: 15 })]);
  const pending = pendRes.ok ? (pendRes.data ?? []) : [];
  const changes = changesRes.ok ? (changesRes.data ?? []) : [];
  const reviewCount = pending.length + changes.filter((c) => !c.ackedAt).length;

  const tabs: HubTab[] = [
    { key: "stok", label: "Stok" },
    { key: "nota", label: "Nota belanja", count: reviewCount },
    { key: "akses", label: "Akses & setelan", icon: <Settings size={14} aria-hidden />, secondary: true },
  ];

  const base = "/admin/costing/pengadaan";

  if (tab === "akses") {
    const [staffRes, candRes, settingsRes] = await Promise.all([
      listProcurementAssignments(),
      listEligibleProfiles(),
      getProcurementSettings(),
    ]);
    return (
      <div className="animate-fade-up">
        <HubHeader title="Pengadaan" basePath={base} tabs={tabs} activeTab={tab} brands={[]} activeBrand={null} />
        <ProcurementAccessManager
          brands={brands}
          staff={staffRes.ok ? (staffRes.data ?? []) : []}
          candidates={candRes.ok ? (candRes.data ?? []) : []}
          settings={settingsRes.ok && settingsRes.data ? settingsRes.data : { ...PROCUREMENT_DEFAULTS }}
        />
      </div>
    );
  }

  if (tab === "nota") {
    const notaBrands = NOTA_BRANDS.filter((b) => brands.includes(b));
    const brand = notaBrands.find((b) => b === bu) ?? null;
    const today = jakartaDateString(new Date());
    const month = /^\d{4}-\d{2}$/.test(m ?? "") ? (m as string) : today.slice(0, 7);
    const y = Number(month.slice(0, 4));
    const mo = Number(month.slice(5, 7));
    const from = `${month}-01`;
    const to = `${month}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, "0")}`;
    const monthLabel = new Date(`${from}T00:00:00Z`).toLocaleDateString("id-ID", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    const prev = new Date(Date.UTC(y, mo - 2, 1)).toISOString().slice(0, 7);
    const next = new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 7);
    const q = (mm: string) => `${base}?tab=nota&m=${mm}${brand ? `&bu=${encodeURIComponent(brand)}` : ""}`;

    const [listRes, sumRes, cashRes, walletRes] = await Promise.all([
      listPurchases(brand, { from, to, limit: 200 }),
      getPurchaseSummary(brand, from, to),
      getAllCashPositions(),
      // Saldo belanja online (Shopee / Seabank) per cabang: kas pengadaan selain uang tunai.
      Promise.all((brand ? [brand] : notaBrands).map((b) => getShopeeWallet(b))),
    ]);

    return (
      <div className="animate-fade-up">
        <HubHeader
          title="Pengadaan"
          basePath={base}
          tabs={tabs}
          activeTab={tab}
          brands={notaBrands}
          activeBrand={brand}
          allBrandsValue="semua"
          actions={
            <Link href={`/pengadaan?tab=catat${brand ? `&bu=${encodeURIComponent(brand)}` : ""}`} className={outlineBtn}>
              <PackagePlus size={15} aria-hidden /> Catat nota
            </Link>
          }
        />
        <NotaTab
          pending={pending}
          changes={changes}
          positions={cashRes.ok && cashRes.data ? cashRes.data.filter((p) => !brand || p.businessUnit === brand) : []}
          wallets={walletRes.flatMap((w) => (w.ok && w.data ? [w.data] : []))}
          summary={sumRes.ok ? (sumRes.data ?? null) : null}
          purchases={listRes.ok ? (listRes.data ?? []) : []}
          today={today}
          monthLabel={monthLabel}
          prevHref={q(prev)}
          nextHref={next <= today.slice(0, 7) ? q(next) : null}
        />
      </div>
    );
  }

  // Tab Stok
  const activeBrand = pickActiveBrand(brands, bu, lastOpened);
  const [boardRes, goodsRes] = await Promise.all([
    activeBrand ? listProcurementBoard(activeBrand) : Promise.resolve(null),
    activeBrand ? listGoodsIn(activeBrand, 20) : Promise.resolve(null),
  ]);
  const rows = boardRes && boardRes.ok ? (boardRes.data ?? []) : [];
  const goodsIn = goodsRes && goodsRes.ok ? (goodsRes.data ?? []) : [];

  return (
    <div className="animate-fade-up">
      <HubHeader
        title="Pengadaan"
        basePath={base}
        tabs={tabs}
        activeTab={tab}
        brands={brands}
        activeBrand={activeBrand ?? null}
        actions={
          activeBrand ? (
            <Link href={`/pengadaan/opname?bu=${encodeURIComponent(activeBrand)}`} className={outlineBtn}>
              <ClipboardList size={15} aria-hidden /> Opname bahan
            </Link>
          ) : null
        }
      />
      {brands.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada brand.</p>
      ) : (
        <ProcurementBoard
          brands={brands}
          activeBrand={activeBrand ?? null}
          rows={rows}
          goodsIn={goodsIn}
          basePath={base}
          embedded
        />
      )}
    </div>
  );
}
