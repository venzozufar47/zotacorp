"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  X,
  Pencil,
  Archive,
  ArchiveRestore,
  Wallet,
  History,
  Loader2,
  Upload,
} from "lucide-react";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import {
  createSimCard,
  updateSimCard,
  setSimCardArchived,
  recordSimTopup,
  listSimTopups,
  getSimProofSignedUrl,
  type SimCardInput,
} from "@/lib/actions/sim-cards.actions";
import {
  SIM_STATUS_LABELS,
  isSimOverdue,
  simStatus,
  simStatusSummary,
  type SimCard,
  type SimTopup,
} from "@/lib/sim-cards/types";

interface UnitOpt {
  id: string;
  name: string;
}
interface ProfileOpt {
  id: string;
  fullName: string;
  email: string;
  businessUnit: string | null;
}

/**
 * Pengelola nomor kartu SIM. Admin: CRUD penuh + isi pulsa mewakili PIC.
 * PIC (isAdmin=false): hanya lihat nomornya sendiri + tombol Isi pulsa.
 * Upload bukti WAJIB — tombol simpan terkunci sampai file dipilih.
 */
export function SimCardsManager({
  uid,
  isAdmin,
  cards,
  units,
  profiles,
  today,
}: {
  uid: string;
  isAdmin: boolean;
  cards: SimCard[];
  units: UnitOpt[];
  profiles: ProfileOpt[];
  today: string;
}) {
  const [formFor, setFormFor] = useState<SimCard | "new" | null>(null);
  const [topupFor, setTopupFor] = useState<SimCard | null>(null);
  const [historyFor, setHistoryFor] = useState<SimCard | null>(null);

  // Kelompokkan per unit bisnis; yang overdue naik ke atas dalam grup.
  const groups = useMemo(() => {
    const m = new Map<string, SimCard[]>();
    for (const c of cards) {
      const arr = m.get(c.businessUnitName) ?? [];
      arr.push(c);
      m.set(c.businessUnitName, arr);
    }
    for (const [, arr] of m) {
      arr.sort((a, b) => {
        const ao = isSimOverdue(simStatus(a, today)) ? 0 : 1;
        const bo = isSimOverdue(simStatus(b, today)) ? 0 : 1;
        if (ao !== bo) return ao - bo;
        return a.phoneNumber.localeCompare(b.phoneNumber);
      });
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [cards, today]);

  const overdueCount = cards.filter(
    (c) => c.isActive && isSimOverdue(simStatus(c, today))
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {cards.length} nomor
          {overdueCount > 0 && (
            <span className="ml-2 rounded-full bg-destructive/15 text-destructive border border-destructive/30 px-2 py-0.5 text-[11px] font-semibold">
              {overdueCount} lewat tenggat
            </span>
          )}
        </p>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setFormFor("new")}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90"
          >
            <Plus size={14} /> Tambah nomor
          </button>
        )}
      </div>

      {cards.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Belum ada nomor terdaftar.
        </p>
      ) : (
        groups.map(([unitName, list]) => (
          <section key={unitName} className="space-y-2">
            <h2 className="font-display font-bold text-sm text-foreground">
              {unitName}{" "}
              <span className="font-normal text-muted-foreground">
                ({list.length})
              </span>
            </h2>
            <ul className="space-y-2">
              {list.map((c) => (
                <SimRow
                  key={c.id}
                  card={c}
                  today={today}
                  isAdmin={isAdmin}
                  onEdit={() => setFormFor(c)}
                  onTopup={() => setTopupFor(c)}
                  onHistory={() => setHistoryFor(c)}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {formFor && isAdmin && (
        <CardFormDialog
          card={formFor === "new" ? null : formFor}
          units={units}
          profiles={profiles}
          onClose={() => setFormFor(null)}
        />
      )}
      {topupFor && (
        <TopupDialog
          uid={uid}
          card={topupFor}
          onClose={() => setTopupFor(null)}
        />
      )}
      {historyFor && (
        <HistoryDialog card={historyFor} onClose={() => setHistoryFor(null)} />
      )}
    </div>
  );
}

// ─── Row ────────────────────────────────────────────────────────────────
function SimRow({
  card,
  today,
  isAdmin,
  onEdit,
  onTopup,
  onHistory,
}: {
  card: SimCard;
  today: string;
  isAdmin: boolean;
  onEdit: () => void;
  onTopup: () => void;
  onHistory: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const status = simStatus(card, today);
  const overdue = isSimOverdue(status);

  const tone =
    status === "expired"
      ? "bg-destructive/15 text-destructive border-destructive/40"
      : status === "grace"
        ? "bg-warning/20 text-foreground border-warning"
        : status === "unset"
          ? "bg-muted text-muted-foreground border-border"
          : "bg-success/15 text-success border-success/30";

  return (
    <li
      className={`rounded-xl border-2 bg-card p-3 space-y-2 ${
        card.isActive ? "border-foreground" : "border-border opacity-60"
      }`}
    >
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground tabular-nums">
              {card.phoneNumber}
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone}`}
            >
              {overdue ? simStatusSummary(card, today) : SIM_STATUS_LABELS[status]}
            </span>
            {!card.isActive && (
              <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                Arsip
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {card.provider ? `${card.provider} · ` : ""}
            {card.label ?? "tanpa label"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            PJ: <span className="text-foreground">{card.picName ?? "—"}</span>
            {card.picPhone ? ` · ${card.picPhone}` : ""}
            {!card.picIsUser && card.picName ? " (manual)" : ""}
          </p>
        </div>
        <div className="text-right text-[11px] text-muted-foreground tabular-nums shrink-0">
          <div>Aktif s/d: {card.activeUntil ?? "—"}</div>
          <div>Tenggang s/d: {card.graceUntil ?? "—"}</div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          onClick={onTopup}
          className="inline-flex items-center gap-1 rounded-lg bg-primary text-primary-foreground px-2.5 h-8 text-xs font-semibold hover:opacity-90"
        >
          <Wallet size={13} /> Isi pulsa
        </button>
        <button
          type="button"
          onClick={onHistory}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 h-8 text-xs font-medium hover:bg-muted"
        >
          <History size={13} /> Riwayat
        </button>
        {isAdmin && (
          <>
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 h-8 text-xs font-medium hover:bg-muted"
            >
              <Pencil size={13} /> Ubah
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await setSimCardArchived(card.id, card.isActive);
                  if (!res.ok) return void toast.error(res.error);
                  toast.success(card.isActive ? "Diarsipkan" : "Diaktifkan");
                  router.refresh();
                })
              }
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 h-8 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              {card.isActive ? (
                <>
                  <Archive size={13} /> Arsip
                </>
              ) : (
                <>
                  <ArchiveRestore size={13} /> Aktifkan
                </>
              )}
            </button>
          </>
        )}
      </div>
    </li>
  );
}

// ─── Dialog shell ───────────────────────────────────────────────────────
function Shell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-card border-2 border-foreground shadow-[4px_4px_0_0_var(--foreground)] p-4 space-y-3 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display font-bold text-lg">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="size-8 inline-flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputCls =
  "mt-1 w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm";

// ─── Tambah / ubah nomor ────────────────────────────────────────────────
function CardFormDialog({
  card,
  units,
  profiles,
  onClose,
}: {
  card: SimCard | null;
  units: UnitOpt[];
  profiles: ProfileOpt[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [picMode, setPicMode] = useState<"user" | "manual">(
    card && !card.picIsUser && card.picName ? "manual" : "user"
  );
  const [f, setF] = useState({
    businessUnitId: card?.businessUnitId ?? units[0]?.id ?? "",
    phoneNumber: card?.phoneNumber ?? "",
    provider: card?.provider ?? "",
    label: card?.label ?? "",
    picUserId: card?.picUserId ?? "",
    picName: card?.picIsUser ? "" : (card?.picName ?? ""),
    picPhone: card?.picIsUser ? "" : (card?.picPhone ?? ""),
    activeUntil: card?.activeUntil ?? "",
    graceUntil: card?.graceUntil ?? "",
    notes: card?.notes ?? "",
  });

  function submit() {
    const payload: SimCardInput = {
      businessUnitId: f.businessUnitId,
      phoneNumber: f.phoneNumber,
      provider: f.provider || null,
      label: f.label || null,
      picUserId: picMode === "user" ? f.picUserId || null : null,
      picName: picMode === "manual" ? f.picName || null : null,
      picPhone: picMode === "manual" ? f.picPhone || null : null,
      activeUntil: f.activeUntil || null,
      graceUntil: f.graceUntil || null,
      notes: f.notes || null,
    };
    start(async () => {
      const res = card
        ? await updateSimCard(card.id, payload)
        : await createSimCard(payload);
      if (!res.ok) return void toast.error(res.error);
      toast.success(card ? "Nomor diperbarui" : "Nomor ditambahkan");
      onClose();
      router.refresh();
    });
  }

  return (
    <Shell title={card ? "Ubah nomor" : "Tambah nomor"} onClose={onClose}>
      <label className="block">
        <span className="text-xs font-medium">Unit bisnis</span>
        <select
          className={inputCls}
          value={f.businessUnitId}
          onChange={(e) => setF({ ...f, businessUnitId: e.target.value })}
        >
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-xs font-medium">Nomor HP</span>
          <input
            className={inputCls}
            inputMode="numeric"
            placeholder="0812…"
            value={f.phoneNumber}
            onChange={(e) => setF({ ...f, phoneNumber: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium">Provider</span>
          <input
            className={inputCls}
            placeholder="Telkomsel…"
            value={f.provider}
            onChange={(e) => setF({ ...f, provider: e.target.value })}
          />
        </label>
      </div>

      <label className="block">
        <span className="text-xs font-medium">Label / kegunaan</span>
        <input
          className={inputCls}
          placeholder="WA Booth Tlogosari"
          value={f.label}
          onChange={(e) => setF({ ...f, label: e.target.value })}
        />
      </label>

      {/* PIC: karyawan terdaftar atau manual */}
      <div className="rounded-xl border border-border p-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold">Penanggung jawab</span>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(["user", "manual"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPicMode(m)}
                className={`px-2 py-1 text-[11px] font-semibold ${
                  picMode === m
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {m === "user" ? "Karyawan" : "Manual"}
              </button>
            ))}
          </div>
        </div>
        {picMode === "user" ? (
          <select
            className={inputCls}
            value={f.picUserId}
            onChange={(e) => setF({ ...f, picUserId: e.target.value })}
          >
            <option value="">— Pilih karyawan —</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName} {p.businessUnit ? `· ${p.businessUnit}` : ""}
              </option>
            ))}
          </select>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <input
              className={inputCls}
              placeholder="Nama PJ"
              value={f.picName}
              onChange={(e) => setF({ ...f, picName: e.target.value })}
            />
            <input
              className={inputCls}
              placeholder="Nomor WA"
              inputMode="numeric"
              value={f.picPhone}
              onChange={(e) => setF({ ...f, picPhone: e.target.value })}
            />
          </div>
        )}
        {picMode === "manual" && (
          <p className="text-[11px] text-muted-foreground">
            PJ manual tidak bisa login — hanya admin yang bisa update tenggat.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-xs font-medium">Masa aktif s/d</span>
          <input
            type="date"
            className={inputCls}
            value={f.activeUntil}
            onChange={(e) => setF({ ...f, activeUntil: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium">Masa tenggang s/d</span>
          <input
            type="date"
            className={inputCls}
            value={f.graceUntil}
            onChange={(e) => setF({ ...f, graceUntil: e.target.value })}
          />
        </label>
      </div>

      <label className="block">
        <span className="text-xs font-medium">Catatan</span>
        <textarea
          className={inputCls}
          rows={2}
          value={f.notes}
          onChange={(e) => setF({ ...f, notes: e.target.value })}
        />
      </label>

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
      >
        {pending && <Loader2 size={14} className="animate-spin" />}
        Simpan
      </button>
    </Shell>
  );
}

// ─── Isi pulsa (bukti WAJIB) ────────────────────────────────────────────
function TopupDialog({
  uid,
  card,
  onClose,
}: {
  uid: string;
  card: SimCard;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [activeUntil, setActiveUntil] = useState("");
  const [graceUntil, setGraceUntil] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  async function submit() {
    if (!file) return void toast.error("Bukti screenshot wajib diunggah");
    if (!activeUntil) return void toast.error("Isi masa aktif yang baru");
    setBusy(true);
    const supabase = createSupabaseClient();
    const ext = (file.name.split(".").pop() ?? "jpg")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const path = `${uid}/${crypto.randomUUID()}.${ext || "jpg"}`;
    const { error: upErr } = await supabase.storage
      .from("sim-topup-proofs")
      .upload(path, file, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });
    if (upErr) {
      setBusy(false);
      return void toast.error(upErr.message);
    }
    const res = await recordSimTopup({
      simCardId: card.id,
      proofPath: path,
      newActiveUntil: activeUntil,
      newGraceUntil: graceUntil || null,
      amountIdr: amount ? Number(amount) : null,
      note: note || null,
    });
    if (!res.ok) {
      // Rollback bukti supaya tidak jadi file yatim.
      void supabase.storage.from("sim-topup-proofs").remove([path]);
      setBusy(false);
      return void toast.error(res.error);
    }
    toast.success("Isi pulsa tercatat — reminder berhenti");
    onClose();
    router.refresh();
  }

  return (
    <Shell title={`Isi pulsa · ${card.phoneNumber}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-xs font-medium">
            Masa aktif baru <span className="text-destructive">*</span>
          </span>
          <input
            type="date"
            className={inputCls}
            value={activeUntil}
            onChange={(e) => setActiveUntil(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium">Masa tenggang baru</span>
          <input
            type="date"
            className={inputCls}
            value={graceUntil}
            onChange={(e) => setGraceUntil(e.target.value)}
          />
        </label>
      </div>

      <label className="block">
        <span className="text-xs font-medium">Nominal (opsional)</span>
        <input
          className={inputCls}
          inputMode="numeric"
          placeholder="50000"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
        />
      </label>

      <div>
        <span className="text-xs font-medium">
          Bukti screenshot <span className="text-destructive">*</span>
        </span>
        <label
          className={`mt-1 flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 cursor-pointer transition ${
            file
              ? "border-success/50 bg-success/10"
              : "border-dashed border-border bg-muted/30 hover:bg-muted"
          }`}
        >
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              if (f && f.size > 5 * 1024 * 1024) {
                toast.error("Maksimal 5MB");
                e.target.value = "";
                return;
              }
              setFile(f);
            }}
          />
          <Upload size={16} className="shrink-0" />
          <span className="text-sm truncate flex-1">
            {file ? file.name : "Pilih / ambil foto bukti"}
          </span>
        </label>
      </div>

      <label className="block">
        <span className="text-xs font-medium">Catatan</span>
        <input
          className={inputCls}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      <button
        type="button"
        onClick={submit}
        disabled={busy || !file || !activeUntil}
        className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
      >
        {busy && <Loader2 size={14} className="animate-spin" />}
        Simpan & hentikan reminder
      </button>
    </Shell>
  );
}

// ─── Riwayat ────────────────────────────────────────────────────────────
function HistoryDialog({
  card,
  onClose,
}: {
  card: SimCard;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<SimTopup[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await listSimTopups(card.id);
      if (!alive) return;
      setRows(res.ok ? (res.data ?? []) : []);
      if (!res.ok) toast.error(res.error);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [card.id]);

  async function openProof(path: string) {
    const res = await getSimProofSignedUrl(path);
    if (!res.ok) return void toast.error(res.error);
    if (!res.data) return void toast.error("Gagal membuat URL bukti");
    window.open(res.data.url, "_blank", "noopener");
  }

  return (
    <Shell title={`Riwayat · ${card.phoneNumber}`} onClose={onClose}>
      {loading ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Memuat…</p>
      ) : !rows || rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          Belum ada catatan isi pulsa.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((t) => (
            <li
              key={t.id}
              className="rounded-xl border border-border bg-background p-2.5 text-xs space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-foreground">
                  {t.createdAt.slice(0, 10)}
                </span>
                <button
                  type="button"
                  onClick={() => openProof(t.proofPath)}
                  className="text-primary underline underline-offset-2"
                >
                  Lihat bukti
                </button>
              </div>
              <div className="text-muted-foreground">
                Aktif s/d {t.newActiveUntil ?? "—"}
                {t.newGraceUntil ? ` · tenggang s/d ${t.newGraceUntil}` : ""}
                {t.amountIdr
                  ? ` · Rp ${t.amountIdr.toLocaleString("id-ID")}`
                  : ""}
              </div>
              {t.toppedUpByName && (
                <div className="text-muted-foreground">
                  oleh {t.toppedUpByName}
                </div>
              )}
              {t.note && <div className="text-foreground">{t.note}</div>}
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
