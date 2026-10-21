"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, LockKeyhole, X } from "lucide-react";
import { toast } from "sonner";
import type { OpnameFormSku } from "@/lib/actions/pos-stock.actions";
import { listOpnameFormSkus } from "@/lib/actions/pos-stock.actions";
import {
  closeShift,
  getOpeningBriefing,
  getShiftCashiers,
  openShift,
  verifyShiftPin,
  type ShiftExpenseInput,
} from "@/lib/actions/pos-shift.actions";
import { describeCashDiff, type IncidentalReport } from "@/lib/pos/shift-math";
import { PosPinAuthDialog } from "./PosPinAuthDialog";
import { ShiftCashStep } from "./ShiftCashStep";
import { StockOpnameForm } from "./StockOpnameForm";

type Step = "cashier" | "pin" | "briefing" | "opname" | "cash" | "result";

interface Props {
  mode: "open" | "close";
  bankAccountId: string;
  accountName: string;
  basePath: string;
  /** Mode tutup: kasir yang membuka shift — satu-satunya yang boleh menutup. */
  shiftCashier?: { id: string; name: string };
  onClose: () => void;
}

const rp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

/**
 * Alur layar penuh buka/tutup shift:
 *   Buka  : pilih kasir → PIN → (laporan di luar shift) → opname stok → hitung kas → selesai
 *   Tutup : PIN kasir pembuka → opname stok → hitung kas → selesai (POS kembali terkunci)
 * PIN diverifikasi di awal (cepat gagal) dan DIVERIFIKASI ULANG server saat opname & simpan; PIN hanya
 * disimpan di memori komponen ini, tidak pernah ke storage.
 */
export function PosShiftWizard({ mode, bankAccountId, accountName, basePath, shiftCashier, onClose }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(mode === "open" ? "cashier" : "pin");
  const [cashiers, setCashiers] = useState<Array<{ id: string; name: string; hasPin: boolean }> | null>(null);
  const [cashier, setCashier] = useState<{ id: string; name: string } | null>(shiftCashier ?? null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [report, setReport] = useState<IncidentalReport | null>(null);
  const [skus, setSkus] = useState<OpnameFormSku[] | null>(null);
  const [opnameId, setOpnameId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [result, setResult] = useState<{ diff: number | null } | null>(null);

  const isOpen = mode === "open";
  const verb = isOpen ? "Buka shift" : "Tutup shift";

  // Daftar kasir (mode buka). Di mode tutup, kasirnya sudah ditentukan.
  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    getShiftCashiers(bankAccountId).then((res) => {
      if (!alive) return;
      if (res.ok && res.data) setCashiers(res.data.cashiers);
      else toast.error(res.ok ? "Gagal memuat daftar kasir" : res.error);
    });
    return () => {
      alive = false;
    };
  }, [isOpen, bankAccountId]);

  // SKU untuk opname dimuat saat langkah opname dimulai.
  useEffect(() => {
    if (step !== "opname" || skus) return;
    let alive = true;
    listOpnameFormSkus(bankAccountId)
      .then((s) => alive && setSkus(s))
      .catch(() => alive && toast.error("Gagal memuat daftar produk untuk opname"));
    return () => {
      alive = false;
    };
  }, [step, skus, bankAccountId]);

  async function submitPin(entered: string) {
    if (!cashier) return;
    setChecking(true);
    setPinError(null);
    const res = await verifyShiftPin({ bankAccountId, cashierId: cashier.id, pin: entered });
    if (!res.ok) {
      setChecking(false);
      setPinError(res.error);
      return;
    }
    setPin(entered);
    if (isOpen) {
      const brief = await getOpeningBriefing(bankAccountId);
      setChecking(false);
      if (brief.ok && brief.data?.hasContent) {
        setReport(brief.data.report);
        setStep("briefing");
        return;
      }
    } else {
      setChecking(false);
    }
    setStep("opname");
  }

  async function submitCash(v: {
    cashCounted: number;
    cashWithdrawn: number;
    expenses: ShiftExpenseInput[];
    notes: string;
  }) {
    if (!cashier || !opnameId) return;
    setSaving(true);
    setSaveError(null);
    const res = isOpen
      ? await openShift({
          bankAccountId,
          cashierId: cashier.id,
          pin,
          opnameId,
          cashCounted: v.cashCounted,
          expenses: v.expenses,
          notes: v.notes,
        })
      : await closeShift({
          bankAccountId,
          pin,
          opnameId,
          cashCounted: v.cashCounted,
          cashWithdrawn: v.cashWithdrawn,
          expenses: v.expenses,
          notes: v.notes,
        });
    setSaving(false);
    if (!res.ok) {
      setSaveError(res.error);
      return;
    }
    setResult({ diff: res.data?.diff ?? null });
    setStep("result");
  }

  function finish() {
    // Gerbang kunci dihitung di server: refresh membuka POS (buka) atau mengembalikan layar kunci (tutup).
    router.refresh();
    onClose();
  }

  const canDismiss = step !== "result" && !saving && !checking;

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-background" role="dialog" aria-modal="true" aria-label={verb}>
      <div className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border bg-card px-4">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {verb}
            {cashier ? ` · ${cashier.name}` : ""}
          </p>
          <p className="truncate text-sm font-semibold text-foreground">{accountName}</p>
        </div>
        {canDismiss && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="grid size-9 place-items-center rounded-full border border-border hover:bg-muted"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {step === "cashier" && (
        <div className="mx-auto max-w-md space-y-3 px-4 py-6">
          <h1 className="text-base font-semibold text-foreground">Siapa yang bertugas?</h1>
          <p className="text-xs text-muted-foreground">
            Pilih namamu, lalu masukkan PIN. Kasir yang membuka shift juga yang harus menutupnya.
          </p>
          {cashiers === null ? (
            <div className="flex justify-center py-8 text-muted-foreground">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : cashiers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada kasir yang ditugaskan untuk cabang ini.</p>
          ) : (
            <div className="grid gap-2">
              {cashiers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={!c.hasPin}
                  onClick={() => {
                    setCashier({ id: c.id, name: c.name });
                    setPinError(null);
                    setStep("pin");
                  }}
                  className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-left transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="font-medium text-foreground">{c.name}</span>
                  {!c.hasPin && <span className="text-[11px] text-muted-foreground">belum punya PIN</span>}
                </button>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Belum punya PIN? Atur di halaman Profil. Tanpa PIN, gunakan &ldquo;Pakai tanpa shift&rdquo; di layar
            awal.
          </p>
        </div>
      )}

      {step === "briefing" && report && (
        <BriefingStep report={report} onContinue={() => setStep("opname")} />
      )}

      {step === "opname" && cashier && (
        <>
          {skus === null ? (
            <div className="flex justify-center py-16 text-muted-foreground">
              <Loader2 size={22} className="animate-spin" />
            </div>
          ) : (
            <StockOpnameForm
              bankAccountId={bankAccountId}
              accountName={accountName}
              basePath={basePath}
              skus={skus}
              authorizers={[]}
              shift={{
                cashierId: cashier.id,
                pin,
                title: isOpen ? "Opname stok — buka shift" : "Opname stok — tutup shift",
                onDone: (id) => {
                  setOpnameId(id);
                  setStep("cash");
                },
              }}
            />
          )}
        </>
      )}

      {step === "cash" && (
        <ShiftCashStep
          bankAccountId={bankAccountId}
          phase={mode}
          title={isOpen ? "Hitung kas — buka shift" : "Hitung kas — tutup shift"}
          submitLabel={isOpen ? "Mulai shift" : "Tutup shift"}
          busy={saving}
          error={saveError}
          onSubmit={submitCash}
        />
      )}

      {step === "result" && result && (
        <div className="mx-auto max-w-md space-y-4 px-4 py-10 text-center">
          <CheckCircle2 size={44} className="mx-auto text-success" />
          <h1 className="text-lg font-semibold text-foreground">
            {isOpen ? "Shift dibuka" : "Shift ditutup"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isOpen ? "Selamat bertugas, " : "Terima kasih, "}
            {cashier?.name}.
          </p>
          <div
            className={`rounded-xl border px-4 py-3 text-sm font-medium ${
              result.diff === null || result.diff === 0
                ? "border-success/40 bg-success/10 text-foreground"
                : "border-warning/50 bg-warning/10 text-foreground"
            }`}
          >
            {isOpen && result.diff === null
              ? "Hitungan kas awal tercatat."
              : `Hitungan kas: ${describeCashDiff(result.diff)}`}
          </div>
          <button
            type="button"
            onClick={finish}
            className="h-12 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            {isOpen ? "Mulai berjualan" : "Selesai"}
          </button>
        </div>
      )}

      <PosPinAuthDialog
        open={step === "pin"}
        authorizerNames={cashier ? [cashier.name] : []}
        operationLabel={verb}
        preview={isOpen ? `Buka shift atas nama ${cashier?.name ?? ""}` : `Tutup shift ${cashier?.name ?? ""}`}
        pending={checking}
        error={pinError}
        onSubmit={submitPin}
        onClose={() => {
          if (checking) return;
          if (isOpen) {
            setCashier(null);
            setPinError(null);
            setStep("cashier");
          } else {
            onClose();
          }
        }}
      />
    </div>
  );
}

function BriefingStep({ report, onContinue }: { report: IncidentalReport; onContinue: () => void }) {
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <LockKeyhole size={16} /> Aktivitas di luar shift
        </h1>
        <p className="text-xs text-muted-foreground">
          POS dipakai tanpa kasir shift sejak shift terakhir ditutup. Baca dulu supaya hitungan kas dan stokmu tidak
          membingungkan.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Transaksi" value={String(report.salesCount)} />
        <Stat label="Tunai masuk" value={rp(report.cashIn)} />
        <Stat label="QRIS masuk" value={rp(report.qrisIn)} />
        <Stat label="Perubahan kas laci" value={`${report.cashNet >= 0 ? "+" : "−"}${rp(Math.abs(report.cashNet))}`} />
      </div>
      {(report.voidCount > 0 || report.pendingCount > 0) && (
        <p className="text-xs text-muted-foreground">
          {report.voidCount > 0 && <>Dibatalkan: {report.voidCount} transaksi ({rp(report.voidTotal)}). </>}
          {report.pendingCount > 0 && <>Pesanan belum lunas: {report.pendingCount}.</>}
        </p>
      )}

      {report.byUser.length > 0 && (
        <Section title="Dilayani oleh">
          {report.byUser.map((u) => (
            <Row key={u.name} left={u.name} right={`${u.count} transaksi · ${rp(u.total)}`} />
          ))}
        </Section>
      )}
      {report.soldItems.length > 0 && (
        <Section title="Stok keluar (terjual)">
          {report.soldItems.map((i) => (
            <Row key={i.name} left={i.name} right={`−${i.qty}`} />
          ))}
        </Section>
      )}
      {report.movements.length > 0 && (
        <Section title="Produksi & penarikan stok">
          {report.movements.map((m, i) => (
            <Row
              key={`${m.name}-${i}`}
              left={`${m.type === "production" ? "Produksi" : "Penarikan"} · ${m.name}${m.by ? ` (${m.by})` : ""}`}
              right={`${m.type === "production" ? "+" : "−"}${m.qty}`}
            />
          ))}
        </Section>
      )}

      <button
        type="button"
        onClick={onContinue}
        className="h-12 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90"
      >
        Saya sudah baca — lanjut ke opname
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      <div className="divide-y divide-border rounded-xl border border-border bg-card">{children}</div>
    </section>
  );
}

function Row({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
      <span className="min-w-0 truncate text-foreground">{left}</span>
      <span className="shrink-0 tabular-nums text-muted-foreground">{right}</span>
    </div>
  );
}
