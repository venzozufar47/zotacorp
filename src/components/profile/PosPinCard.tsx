"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, ShieldCheck, ShieldOff } from "lucide-react";
import { setPosPin, clearPosPin } from "@/lib/actions/pos-pin.actions";
import { isValidPinFormat } from "@/lib/pos-pin-format";
import { Button } from "@/components/ui/button";
import { Disclosure, DisclosureGroup } from "@/components/account/Disclosure";

interface Props {
  hasPin: boolean;
}

type Mode = null | "set" | "change" | "clear";

/**
 * Kelola PIN POS sendiri di halaman Profil. Dipakai siapa pun yang mungkin
 * ditunjuk sebagai pemberi otorisasi operasi POS (produksi, penarikan,
 * opname). PIN 4–6 digit.
 */
export function PosPinCard({ hasPin }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);

  function done() {
    setMode(null);
    router.refresh();
  }

  return (
    <DisclosureGroup>
      <Disclosure
        title="PIN POS"
        icon={hasPin ? ShieldCheck : ShieldOff}
        summary={hasPin ? "Aktif" : "Belum diatur"}
      >
        <p className="text-xs text-muted-foreground">
          PIN 4–6 digit untuk mengotorisasi operasi POS (produksi, penarikan,
          opname). Admin menunjuk penanggung jawab tiap operasi per rekening.
        </p>

        {mode === null && (
          <div className="flex flex-wrap items-center gap-2">
            {hasPin ? (
              <>
                <Button size="sm" className="min-h-11" onClick={() => setMode("change")}>
                  Ganti PIN
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-11 text-muted-foreground hover:text-destructive"
                  onClick={() => setMode("clear")}
                >
                  Hapus PIN
                </Button>
              </>
            ) : (
              <Button size="sm" className="min-h-11" onClick={() => setMode("set")}>
                Atur PIN
              </Button>
            )}
          </div>
        )}

        {mode === "set" && (
          <SetPinForm requireCurrent={false} onCancel={() => setMode(null)} onSuccess={done} />
        )}
        {mode === "change" && (
          <SetPinForm requireCurrent onCancel={() => setMode(null)} onSuccess={done} />
        )}
        {mode === "clear" && (
          <ClearPinForm onCancel={() => setMode(null)} onSuccess={done} />
        )}
      </Disclosure>
    </DisclosureGroup>
  );
}

function SetPinForm({
  requireCurrent,
  onCancel,
  onSuccess,
}: {
  requireCurrent: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [currentPin, setCurrentPin] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValidPinFormat(pin)) {
      setError("PIN baru harus 4–6 digit angka.");
      return;
    }
    if (pin !== confirm) {
      setError("Konfirmasi PIN tidak cocok.");
      return;
    }
    startTransition(async () => {
      const res = await setPosPin({
        pin,
        currentPin: requireCurrent ? currentPin : undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("PIN POS tersimpan.");
      onSuccess();
    });
  }

  return (
    <form onSubmit={submit} className="max-w-sm space-y-3">
      {requireCurrent && (
        <PinField label="PIN saat ini" value={currentPin} onChange={setCurrentPin} autoFocus />
      )}
      <PinField label="PIN baru" value={pin} onChange={setPin} autoFocus={!requireCurrent} />
      <PinField label="Konfirmasi PIN baru" value={confirm} onChange={setConfirm} />
      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" size="sm" className="min-h-11 px-5" loading={pending}>
          Simpan
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11 text-muted-foreground"
          onClick={onCancel}
          disabled={pending}
        >
          Batal
        </Button>
      </div>
    </form>
  );
}

function ClearPinForm({
  onCancel,
  onSuccess,
}: {
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [currentPin, setCurrentPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await clearPosPin({ currentPin });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("PIN POS dihapus.");
      onSuccess();
    });
  }

  return (
    <form onSubmit={submit} className="max-w-sm space-y-3">
      <p className="text-xs text-muted-foreground">
        Setelah dihapus, kamu tidak bisa jadi pemberi otorisasi sampai
        mengatur PIN baru.
      </p>
      <PinField label="PIN saat ini" value={currentPin} onChange={setCurrentPin} autoFocus />
      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2 pt-1">
        <Button
          type="submit"
          size="sm"
          variant="destructive"
          className="min-h-11 px-5"
          loading={pending}
        >
          Hapus PIN
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11 text-muted-foreground"
          onClick={onCancel}
          disabled={pending}
        >
          Batal
        </Button>
      </div>
    </form>
  );
}

function PinField({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="relative mt-1">
        <input
          type={show ? "text" : "password"}
          inputMode="numeric"
          autoComplete="off"
          autoFocus={autoFocus}
          maxLength={6}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
          className="h-11 w-full rounded-lg border border-border bg-background px-3 pr-11 text-base tabular-nums tracking-[0.5em] focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
          aria-label={show ? "Sembunyikan PIN" : "Lihat PIN"}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </label>
  );
}
