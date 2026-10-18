"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Camera, Image as ImageIcon, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRp } from "@/lib/cashflow/format";
import { compressImageFile } from "@/lib/images/compress-image";
import {
  submitCashClosing,
  uploadCashClosingPhoto,
  verifyCashClosing,
  type CashClosingSnapshot,
} from "@/lib/actions/cash-closing.actions";

/** "12.345" (digit saja) → number. Input dibiarkan bebas, parsing toleran. */
function toNumber(s: string): number {
  return parseInt(s.replace(/\D/g, ""), 10) || 0;
}

interface PettyRow {
  key: number;
  amount: string;
  note: string;
  file: File | null;
}

export function CashClosingForm({
  initial,
  isAdmin,
}: {
  initial: CashClosingSnapshot;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const editable =
    initial.status === "not_started" ||
    (initial.status === "pending_verification" && initial.currentUserId === initial.countedBy);
  const canVerify =
    initial.status === "pending_verification" &&
    (initial.currentUserId !== initial.countedBy || isAdmin);
  const locked = initial.status === "verified";

  const [cashPhysical, setCashPhysical] = useState(
    initial.cashPhysical != null ? String(initial.cashPhysical) : ""
  );
  const [qrisReceived, setQrisReceived] = useState(
    initial.qrisReceived != null ? String(initial.qrisReceived) : String(initial.qrisPos)
  );
  const [pettyOpening, setPettyOpening] = useState(
    initial.pettyCashOpening != null ? String(initial.pettyCashOpening) : ""
  );
  const [pettyClosing, setPettyClosing] = useState(
    initial.pettyCashClosing != null ? String(initial.pettyCashClosing) : ""
  );
  const [tokenKwh, setTokenKwh] = useState(
    initial.tokenKwhRemaining != null ? String(initial.tokenKwhRemaining) : ""
  );
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [tokenPhoto, setTokenPhoto] = useState<File | null>(null);
  const [pettyRows, setPettyRows] = useState<PettyRow[]>(
    initial.pettyExpenses.length > 0
      ? initial.pettyExpenses.map((e, i) => ({
          key: i,
          amount: String(e.amount),
          note: e.note ?? "",
          file: null,
        }))
      : []
  );
  const cashPhysicalNum = toNumber(cashPhysical);
  const liveDiff = cashPhysicalNum - initial.cashPos;

  function addPettyRow() {
    setPettyRows((rows) => {
      const key = rows.length > 0 ? Math.max(...rows.map((r) => r.key)) + 1 : 0;
      return [...rows, { key, amount: "", note: "", file: null }];
    });
  }
  function removePettyRow(key: number) {
    setPettyRows((rows) => rows.filter((r) => r.key !== key));
  }
  function updatePettyRow(key: number, patch: Partial<PettyRow>) {
    setPettyRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function handleSubmit() {
    if (!cashPhysical.trim()) {
      toast.error("Isi tunai fisik dulu");
      return;
    }
    for (const r of pettyRows) {
      if (toNumber(r.amount) <= 0) {
        toast.error("Isi nominal setiap pengeluaran kas kecil");
        return;
      }
    }
    setSaving(true);
    try {
      const res = await submitCashClosing({
        branch: initial.branch,
        cashPhysical: cashPhysicalNum,
        qrisReceived: toNumber(qrisReceived),
        pettyCashOpening: toNumber(pettyOpening),
        pettyCashClosing: toNumber(pettyClosing),
        tokenKwhRemaining: tokenKwh.trim() ? toNumber(tokenKwh) : null,
        notes: notes.trim() || null,
        pettyExpenses: pettyRows.map((r) => ({ amount: toNumber(r.amount), note: r.note || null })),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const { closingId, pettyExpenseIds } = res.data!;

      const uploads: Promise<unknown>[] = [];
      if (tokenPhoto) {
        uploads.push(
          (async () => {
            const compressed = await compressImageFile(tokenPhoto, { maxDim: 1280 });
            const fd = new FormData();
            fd.set("kind", "token");
            fd.set("closingId", closingId);
            fd.set("file", compressed);
            const up = await uploadCashClosingPhoto(fd);
            if (!up.ok) toast.error(`Data tersimpan, tapi foto token gagal: ${up.error}`);
          })()
        );
      }
      pettyRows.forEach((r, i) => {
        if (!r.file) return;
        const pettyExpenseId = pettyExpenseIds[i];
        if (!pettyExpenseId) return;
        uploads.push(
          (async () => {
            const compressed = await compressImageFile(r.file as File, { maxDim: 1280 });
            const fd = new FormData();
            fd.set("kind", "petty");
            fd.set("closingId", closingId);
            fd.set("pettyExpenseId", pettyExpenseId);
            fd.set("file", compressed);
            const up = await uploadCashClosingPhoto(fd);
            if (!up.ok) toast.error(`Data tersimpan, tapi nota #${i + 1} gagal: ${up.error}`);
          })()
        );
      });
      await Promise.all(uploads);

      toast.success("Tutup kas tersimpan. Minta rekan untuk verifikasi.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleVerify() {
    if (!initial.id) return;
    setVerifying(true);
    try {
      const res = await verifyCashClosing(initial.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        res.data?.alerted
          ? "Diverifikasi. Selisih di atas ambang — Owner sudah diberi tahu."
          : "Diverifikasi."
      );
      router.refresh();
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Angka POS hari ini (otomatis)</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Tunai POS</p>
            <p className="font-semibold tabular-nums">{formatRp(initial.cashPos)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">QRIS POS</p>
            <p className="font-semibold tabular-nums">{formatRp(initial.qrisPos)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Void</p>
            <p className="font-semibold tabular-nums">
              {initial.voidCount}x · {formatRp(initial.voidTotal)}
            </p>
          </div>
          {initial.cashDiff != null && (
            <div>
              <p className="text-xs text-muted-foreground">Selisih tersimpan</p>
              <p
                className={`font-semibold tabular-nums ${
                  initial.cashDiff !== 0 ? "text-destructive" : "text-success"
                }`}
              >
                {formatRp(initial.cashDiff)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {locked && (
        <Card>
          <CardContent className="pt-5 text-sm text-muted-foreground">
            Sudah diverifikasi oleh {initial.verifiedByName ?? "—"}. Terkunci — hubungi admin untuk
            koreksi.
          </CardContent>
        </Card>
      )}

      {canVerify && (
        <Card>
          <CardHeader>
            <CardTitle>Verifikasi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Dihitung oleh <strong>{initial.countedByName ?? "—"}</strong>. Periksa angka di atas
              lalu konfirmasi sudah benar.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Tunai fisik</p>
                <p className="font-semibold tabular-nums">{formatRp(initial.cashPhysical ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Selisih</p>
                <p
                  className={`font-semibold tabular-nums ${
                    (initial.cashDiff ?? 0) !== 0 ? "text-destructive" : "text-success"
                  }`}
                >
                  {formatRp(initial.cashDiff ?? 0)}
                </p>
              </div>
            </div>
            <Button onClick={handleVerify} loading={verifying} className="w-full">
              Konfirmasi Verifikasi
            </Button>
          </CardContent>
        </Card>
      )}

      {!locked && !editable && !canVerify && (
        <Card>
          <CardContent className="pt-5 text-sm text-muted-foreground">
            Menunggu verifikasi dari rekan lain.
          </CardContent>
        </Card>
      )}

      {editable && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Hitung kas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="cashPhysical">Tunai fisik dihitung</Label>
                <Input
                  id="cashPhysical"
                  inputMode="numeric"
                  value={cashPhysical}
                  onChange={(e) => setCashPhysical(e.target.value)}
                  placeholder="0"
                />
                <p
                  className={`mt-1 text-xs ${
                    liveDiff !== 0 ? "text-destructive font-semibold" : "text-muted-foreground"
                  }`}
                >
                  Selisih: {formatRp(liveDiff)}
                </p>
              </div>
              <div>
                <Label htmlFor="qrisReceived">QRIS masuk (dari notifikasi)</Label>
                <Input
                  id="qrisReceived"
                  inputMode="numeric"
                  value={qrisReceived}
                  onChange={(e) => setQrisReceived(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Kas kecil</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="pettyOpening">Saldo awal</Label>
                  <Input
                    id="pettyOpening"
                    inputMode="numeric"
                    value={pettyOpening}
                    onChange={(e) => setPettyOpening(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="pettyClosing">Saldo akhir</Label>
                  <Input
                    id="pettyClosing"
                    inputMode="numeric"
                    value={pettyClosing}
                    onChange={(e) => setPettyClosing(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label>Pengeluaran (wajib nota)</Label>
                {pettyRows.map((r) => (
                  <div key={r.key} className="rounded-xl border-2 border-border p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        inputMode="numeric"
                        placeholder="Nominal"
                        value={r.amount}
                        onChange={(e) => updatePettyRow(r.key, { amount: e.target.value })}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => removePettyRow(r.key)}
                        aria-label="Hapus"
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                    <Input
                      placeholder="Untuk apa"
                      value={r.note}
                      onChange={(e) => updatePettyRow(r.key, { note: e.target.value })}
                    />
                    <div className="flex items-center gap-2 text-xs">
                      <label className="press-feedback flex h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-input bg-background font-semibold hover:border-primary/50 transition">
                        <Camera size={14} /> Foto nota
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={(e) =>
                            updatePettyRow(r.key, { file: e.target.files?.[0] ?? null })
                          }
                        />
                      </label>
                      {r.file && <span className="truncate text-emerald-600">{r.file.name}</span>}
                    </div>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addPettyRow}>
                  <Plus size={14} /> Tambah pengeluaran
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Token listrik</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="tokenKwh">Sisa token (kWh)</Label>
                <Input
                  id="tokenKwh"
                  inputMode="decimal"
                  value={tokenKwh}
                  onChange={(e) => setTokenKwh(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <label className="press-feedback flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-input bg-background font-semibold hover:border-primary/50 transition">
                  <Camera size={15} /> Foto meteran
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => setTokenPhoto(e.target.files?.[0] ?? null)}
                  />
                </label>
                <label className="press-feedback flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-input bg-background font-semibold hover:border-primary/50 transition">
                  <ImageIcon size={15} /> Dari galeri
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setTokenPhoto(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
              {tokenPhoto && (
                <p className="text-xs text-emerald-600 truncate">{tokenPhoto.name}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Catatan (opsional)</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Mis. sebab selisih kalau sudah tahu"
              />
            </CardContent>
          </Card>

          <Button onClick={handleSubmit} loading={saving} className="w-full" size="lg">
            {initial.status === "not_started" ? "Simpan Tutup Kas" : "Simpan Perubahan"}
          </Button>
        </>
      )}
    </div>
  );
}
