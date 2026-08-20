"use client";

/**
 * Kartu pengambilan custom cake untuk kasir cabang.
 *
 * Kasir yang menandai penyerahan — bukan staf cake di kota lain — jadi
 * kartu ini harus memuat semua yang dibutuhkan untuk memastikan kotak
 * yang benar diserahkan ke orang yang benar: nama pemesan, spesifikasi
 * kue, dan status pembayaran.
 *
 * Idiom mengikuti `PesananList.tsx` (kartu neo-brutalist, overlay
 * buatan sendiri, useTransition + sonner + router.refresh) supaya satu
 * halaman tidak terasa seperti dua aplikasi.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, CakeSlice, Loader2, Phone, TriangleAlert, X } from "lucide-react";
import { formatRp } from "@/lib/cashflow/format";
import {
  markCakePickedUpAtPos,
  uploadCakePickupPaymentProof,
} from "@/lib/actions/pos-cake-pickup.actions";
import type {
  CakePickupOrder,
  CakePickupPaymentMethod,
} from "@/lib/actions/pos-cake-pickup.actions";
import { classifyPaymentMethod } from "@/lib/cake-orders/payment-method";
import {
  authorizerNames,
  POS_OPERATION_LABEL_ID,
  type PosAuthorizerRef,
} from "@/lib/pos-pin-format";
import { PosPinAuthDialog } from "./PosPinAuthDialog";
import { jakartaDateString, jakartaHHMM } from "@/lib/utils/jakarta";

const CARD =
  "rounded-2xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--foreground)]";
const EYEBROW =
  "text-[10px] uppercase tracking-wider text-muted-foreground font-semibold";

/** Dibangun sekali di module scope: konstruksi Intl (resolve locale +
 *  timezone) jauh lebih mahal daripada `.format()`, dan tiap membuka
 *  atau menutup dialog me-render ulang SEMUA kartu. */
const DAY_FMT = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "numeric",
  month: "short",
});

/** `todayWib` dihitung sekali per render di induk, bukan per kartu. */
function scheduleLabel(iso: string, todayWib: string): string {
  const d = new Date(iso);
  const time = jakartaHHMM(d);
  if (jakartaDateString(d) === todayWib) return `Hari ini · ${time}`;
  return `${DAY_FMT.format(d)} · ${time}`;
}

function specLine(o: CakePickupOrder): string {
  const parts: string[] = [o.baseLabel];
  const shape = o.shapeCustom?.trim() || o.shapeLabel;
  if (shape && shape !== "—") parts.push(shape);
  if (o.fillingLabel) parts.push(o.fillingLabel);
  return parts.filter(Boolean).join(" · ");
}

export function CakePickupList({
  pickups,
  paymentMethods,
  authorizers,
}: {
  pickups: CakePickupOrder[];
  paymentMethods: CakePickupPaymentMethod[];
  /** Kosong = serah terima tidak butuh PIN. */
  authorizers: PosAuthorizerRef[];
}) {
  const [active, setActive] = useState<CakePickupOrder | null>(null);
  const todayWib = useMemo(() => jakartaDateString(new Date()), []);

  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <CakeSlice size={15} className="text-foreground" />
        <h2 className="text-sm font-bold text-foreground">
          Custom cake siap diambil
        </h2>
        {pickups.length > 0 && (
          <span className="ml-auto text-[11px] font-semibold text-muted-foreground tabular-nums">
            {pickups.length}
          </span>
        )}
      </div>

      {pickups.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          Belum ada kue yang menunggu diambil.
        </div>
      ) : (
        <div className="space-y-3">
          {pickups.map((o) => (
            <PickupCard
              key={o.id}
              order={o}
              todayWib={todayWib}
              onOpen={() => setActive(o)}
            />
          ))}
        </div>
      )}

      {active && (
        <PickupDialog
          order={active}
          paymentMethods={paymentMethods}
          authorizers={authorizers}
          onClose={() => setActive(null)}
        />
      )}
    </section>
  );
}

function PickupCard({
  order,
  todayWib,
  onOpen,
}: {
  order: CakePickupOrder;
  todayWib: string;
  onOpen: () => void;
}) {
  const outstanding = order.remainingIdr > 0;
  return (
    <div className={CARD}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={EYEBROW}>
            {scheduleLabel(order.scheduledAt, todayWib)}
          </div>
          <h3 className="text-base font-bold text-foreground truncate">
            {order.customerName}
          </h3>
        </div>
        <div className="text-right shrink-0">
          <div className="text-base font-bold tabular-nums text-foreground">
            {formatRp(order.totalIdr)}
          </div>
        </div>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        {specLine(order)}
        {order.dimensionCm ? (
          <span className="ml-1.5 inline-block rounded-full border border-border px-1.5 text-[10px] font-semibold text-foreground">
            {order.dimensionCm} cm
          </span>
        ) : null}
      </p>

      {order.greetingCard?.trim() ? (
        <p className="mt-1.5 text-xs italic text-foreground/80 line-clamp-2">
          “{order.greetingCard.trim()}”
        </p>
      ) : null}

      {order.customerPhone ? (
        <a
          href={`tel:${order.customerPhone}`}
          className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-foreground underline underline-offset-2"
        >
          <Phone size={12} /> {order.customerPhone}
        </a>
      ) : null}

      {/* Status bayar: kurang bayar dibuat mencolok — kasir harus
          melihatnya sebelum kue keluar, bukan setelah. */}
      <div className="mt-3">
        {order.freeClaim ? (
          <span className="inline-flex items-center rounded-full bg-tertiary/40 border border-foreground px-2 py-0.5 text-[11px] font-semibold">
            GRATIS (klaim karyawan)
          </span>
        ) : outstanding ? (
          <div className="flex items-center gap-1.5 rounded-lg border-2 border-foreground bg-destructive/15 px-2.5 py-1.5 text-[12px] font-bold text-foreground">
            <TriangleAlert size={13} />
            KURANG BAYAR {formatRp(order.remainingIdr)}
          </div>
        ) : (
          <span className="inline-flex items-center rounded-full bg-pop-emerald/20 border border-foreground px-2 py-0.5 text-[11px] font-semibold">
            ● LUNAS
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="mt-3 w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
      >
        Tandai sudah diambil
      </button>
    </div>
  );
}

function PickupDialog({
  order,
  paymentMethods,
  authorizers,
  onClose,
}: {
  order: CakePickupOrder;
  paymentMethods: CakePickupPaymentMethod[];
  authorizers: PosAuthorizerRef[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const outstanding = order.remainingIdr > 0;
  const [takeSettlement, setTakeSettlement] = useState(outstanding);
  const [amountRaw, setAmountRaw] = useState(String(order.remainingIdr));
  const [methodId, setMethodId] = useState(paymentMethods[0]?.id ?? "");
  const [acknowledged, setAcknowledged] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  // Verifikasi per metode — supaya kasir tidak "asal tekan" chip Cash/
  // QRIS. Sama prinsip dengan checkout POS biasa: cash wajib mengetik
  // uang diterima (bukan menerima nominal bawaan begitu saja), QRIS
  // wajib foto nota sebagai bukti. Direset tiap ganti metode supaya
  // nilai dari metode sebelumnya tidak nyangkut dan mengelabui gerbang.
  const [cashReceived, setCashReceived] = useState<number | null>(null);
  const [proof, setProof] = useState<{
    path: string;
    mimeType: string;
    sizeBytes: number;
    previewUrl: string;
    fileName: string;
  } | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);

  const amount = useMemo(() => {
    const n = Math.round(Number(amountRaw.replace(/[^\d]/g, "")) || 0);
    return Math.min(Math.max(0, n), order.remainingIdr);
  }, [amountRaw, order.remainingIdr]);

  // `amount` sudah dibatasi <= remainingIdr oleh memo di atas, jadi
  // selisihnya tidak pernah negatif.
  const willRecord = takeSettlement && amount > 0;
  const remainingAfter = order.remainingIdr - (willRecord ? amount : 0);
  const needsAck = remainingAfter > 0;

  const methodKind = methodId
    ? classifyPaymentMethod(
        paymentMethods.find((m) => m.id === methodId)?.label ?? ""
      )
    : null;
  const cashVerified =
    methodKind !== "cash" || (cashReceived != null && cashReceived >= amount);
  const qrisVerified = methodKind !== "qris" || proof != null;

  function selectMethod(id: string) {
    setMethodId(id);
    setCashReceived(null);
    if (proof) URL.revokeObjectURL(proof.previewUrl);
    setProof(null);
  }

  async function handleProofPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!f) return;
    setUploadingProof(true);
    try {
      const { compressImageFile } = await import(
        "@/lib/images/compress-image"
      );
      const toUpload = await compressImageFile(f);
      const fd = new FormData();
      fd.append("orderId", order.id);
      fd.append("file", toUpload);
      const res = await uploadCakePickupPaymentProof(fd);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (proof) URL.revokeObjectURL(proof.previewUrl);
      setProof({
        path: res.data!.path,
        mimeType: res.data!.mimeType,
        sizeBytes: res.data!.sizeBytes,
        previewUrl: URL.createObjectURL(f),
        fileName: f.name,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal upload foto");
    } finally {
      setUploadingProof(false);
    }
  }

  const submit = (pin?: string) => {
    startTransition(async () => {
      const res = await markCakePickedUpAtPos({
        orderId: order.id,
        settlement: willRecord
          ? {
              amountIdr: amount,
              paymentOptionId: methodId,
              proofPath: proof?.path ?? null,
              proofMimeType: proof?.mimeType ?? null,
              proofSizeBytes: proof?.sizeBytes ?? null,
            }
          : null,
        acknowledgeUnpaid: acknowledged,
        pin,
      });
      if (!res.ok) {
        // Kegagalan PIN dibiarkan di dalam modal PIN (goyang + pesan);
        // kegagalan lain jadi toast supaya modalnya bisa ditutup.
        if (pin !== undefined) setPinError(res.error);
        else toast.error(res.error);
        return;
      }
      setPinOpen(false);
      if (res.data?.alreadyPickedUp) {
        toast.info(`${order.customerName} — sudah ditandai perangkat lain`);
      } else {
        toast.success(
          `${order.customerName} — kue diserahkan` +
            (res.data && res.data.recordedIdr > 0
              ? ` · pelunasan ${formatRp(res.data.recordedIdr)} tercatat`
              : "")
        );
      }
      onClose();
      router.refresh();
    });
  };

  /** Tombol utama: buka modal PIN dulu kalau cabang ini punya authorizer. */
  const start = () => {
    if (authorizers.length > 0) {
      setPinError(null);
      setPinOpen(true);
      return;
    }
    submit();
  };

  // Ringkasan untuk modal PIN — authorizer harus tahu apa yang dia
  // setujui, terutama kalau kue dilepas sementara tagihannya kurang.
  const pinPreview = [
    order.customerName,
    willRecord ? `pelunasan ${formatRp(amount)}` : null,
    remainingAfter > 0 ? `SISA KURANG ${formatRp(remainingAfter)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-card border-2 border-foreground shadow-[4px_4px_0_0_var(--foreground)] p-4">
        <div className={EYEBROW}>Serah terima kue</div>
        <h3 className="text-lg font-bold text-foreground">
          {order.customerName}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {specLine(order)} · {formatRp(order.totalIdr)}
        </p>

        {outstanding && (
          <div className="mt-3 rounded-lg border-2 border-foreground bg-destructive/15 p-2.5">
            <div className="flex items-center gap-1.5 text-[13px] font-bold text-foreground">
              <TriangleAlert size={14} />
              Sisa tagihan {formatRp(order.remainingIdr)} belum dibayar
            </div>

            <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-foreground">
              <input
                type="checkbox"
                checked={takeSettlement}
                onChange={(e) => setTakeSettlement(e.target.checked)}
                className="h-4 w-4 accent-[var(--foreground)]"
              />
              Terima pelunasan sekarang
            </label>

            {takeSettlement && (
              <div className="mt-2 space-y-2">
                <input
                  inputMode="numeric"
                  value={amountRaw}
                  onChange={(e) => setAmountRaw(e.target.value)}
                  className="w-full h-10 rounded-xl border-2 border-foreground bg-background px-3 text-sm font-semibold tabular-nums"
                  placeholder="Nominal diterima"
                />
                <div className="flex flex-wrap gap-1.5">
                  {paymentMethods.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => selectMethod(m.id)}
                      className={`h-8 px-3 rounded-lg border-2 border-foreground text-xs font-semibold ${
                        methodId === m.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-foreground"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {/* Verifikasi per metode — mengetik uang tunai / memotret
                    nota QRIS adalah tindakan sadar, bukan satu ketukan
                    yang bisa salah pencet tanpa disadari. */}
                {methodKind === "cash" && (
                  <CashVerifyField
                    amount={amount}
                    value={cashReceived}
                    onChange={setCashReceived}
                  />
                )}
                {methodKind === "qris" && (
                  <QrisProofField
                    proof={proof}
                    uploading={uploadingProof}
                    onPick={handleProofPick}
                    onRemove={() => {
                      if (proof) URL.revokeObjectURL(proof.previewUrl);
                      setProof(null);
                    }}
                  />
                )}

                {amount > 0 && amount < order.remainingIdr && (
                  <p className="text-[11px] text-muted-foreground">
                    Sisa setelah ini: {formatRp(remainingAfter)}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {needsAck && (
          <label className="mt-3 flex items-start gap-2 text-xs font-semibold text-foreground">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--foreground)]"
            />
            Saya konfirmasi kue diserahkan meski masih kurang{" "}
            {formatRp(remainingAfter)}
          </label>
        )}

        <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
          <button
            type="button"
            disabled={
              pending ||
              uploadingProof ||
              (needsAck && !acknowledged) ||
              (willRecord &&
                (!methodId || !cashVerified || !qrisVerified))
            }
            onClick={start}
            className="h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-40"
          >
            {pending
              ? "Menyimpan…"
              : needsAck
                ? `Tandai diambil — TETAP KURANG ${formatRp(remainingAfter)}`
                : "Tandai sudah diambil"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="h-11 px-4 rounded-xl border-2 border-foreground bg-background text-sm font-semibold"
          >
            Batal
          </button>
        </div>
      </div>

      <PosPinAuthDialog
        open={pinOpen}
        authorizerNames={authorizerNames(authorizers)}
        operationLabel={POS_OPERATION_LABEL_ID.cake_pickup}
        preview={pinPreview}
        pending={pending}
        error={pinError}
        onSubmit={(pin) => submit(pin)}
        onClose={() => {
          if (!pending) {
            setPinOpen(false);
            setPinError(null);
          }
        }}
      />
    </div>
  );
}

/**
 * Verifikasi cash: kasir mengetik nominal yang BENAR-BENAR diterima
 * (bukan menerima nominal tagihan begitu saja), sama seperti
 * `CashReceivedField` di checkout POS biasa. Kembaliannya murni info —
 * yang dikirim ke server tetap `amount` (nominal yang mengurangi
 * tagihan), bukan nilai di sini.
 */
function CashVerifyField({
  amount,
  value,
  onChange,
}: {
  amount: number;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const change = value == null ? null : value - amount;
  const bumps = [20_000, 50_000, 100_000];
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-2 space-y-1.5">
      <label className="block">
        <span className="text-[11px] font-medium text-foreground">
          Uang tunai diterima <span className="text-destructive">*</span>
        </span>
        <div className="mt-1 flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5">
          <span className="text-xs font-semibold text-muted-foreground">
            Rp
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={value == null ? "" : String(value)}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^\d]/g, "");
              onChange(raw === "" ? null : Math.round(Number(raw)));
            }}
            placeholder="0"
            className="flex-1 min-w-0 bg-transparent text-sm font-semibold tabular-nums focus:outline-none"
          />
        </div>
      </label>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onChange(amount)}
          className="h-7 px-2 rounded-lg border border-foreground text-[11px] font-semibold bg-card hover:bg-muted"
        >
          Uang pas
        </button>
        {bumps.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => onChange((value ?? 0) + b)}
            className="h-7 px-2 rounded-lg border border-foreground text-[11px] font-semibold bg-card hover:bg-muted"
          >
            +{formatRp(b)}
          </button>
        ))}
      </div>
      {value != null && change != null && (
        <p
          className={`text-[11px] font-medium ${
            change < 0 ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {change < 0
            ? `Kurang ${formatRp(-change)}`
            : `Kembalian: ${formatRp(change)}`}
        </p>
      )}
    </div>
  );
}

/**
 * Verifikasi QRIS: foto nota WAJIB sebelum tombol "Tandai sudah diambil"
 * aktif — meniru satu-per-satu perilaku `QRIS_RECEIPT_AT_CHECKOUT` di
 * checkout POS biasa (bukti audit, dan memaksa kasir benar-benar
 * melihat layar customer alih-alih menekan chip QRIS secara refleks).
 */
function QrisProofField({
  proof,
  uploading,
  onPick,
  onRemove,
}: {
  proof: { previewUrl: string; fileName: string } | null;
  uploading: boolean;
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium text-foreground mb-1">
        Foto nota QRIS dari customer{" "}
        <span className="text-destructive">*</span>
      </p>
      <label
        className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 cursor-pointer transition ${
          proof
            ? "border-success/50 bg-success/10"
            : "border-dashed border-border bg-background hover:bg-muted"
        } ${uploading ? "opacity-50 pointer-events-none" : ""}`}
      >
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPick}
        />
        {uploading ? (
          <Loader2 size={14} className="text-foreground shrink-0 animate-spin" />
        ) : (
          <Camera size={14} className="text-foreground shrink-0" />
        )}
        <span className="text-xs text-foreground truncate flex-1">
          {uploading
            ? "Mengunggah…"
            : proof
              ? proof.fileName
              : "Ambil foto / pilih gambar"}
        </span>
        {proof && !uploading && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onRemove();
            }}
            className="shrink-0 text-muted-foreground hover:text-destructive"
            aria-label="Hapus foto"
          >
            <X size={13} />
          </button>
        )}
      </label>
      <p className="mt-1 text-[10.5px] text-muted-foreground">
        Wajib sebagai bukti audit.
      </p>
    </div>
  );
}
