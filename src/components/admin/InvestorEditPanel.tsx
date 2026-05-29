"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { X, Mail, Building2, FileText, Wallet, ArrowRight } from "lucide-react";
import { EmployeeAvatar } from "@/components/shared/EmployeeAvatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatIDR } from "@/lib/cashflow/format";
import type {
  InvestorSummary,
  InvestorContract,
} from "@/lib/actions/investor.actions";

interface Props {
  investor: InvestorSummary;
  contracts: InvestorContract[];
  onClose: () => void;
}

/**
 * Investor-appropriate edit panel (NOT the employee ProfileForm). Shown
 * as a slide-in side panel on /admin/investors so the admin never
 * navigates away (no jump to /dashboard or /admin/users). Edits only
 * investor-relevant profile fields via the admin-gated
 * `/api/profile/update` route (targetId). Payout bank details live on
 * contracts — managed in the Kontrak tab, linked from here.
 */
export function InvestorEditPanel({ investor, contracts, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [fullName, setFullName] = useState(investor.fullName ?? "");
  const [nickname, setNickname] = useState(investor.nickname ?? "");
  const [whatsapp, setWhatsapp] = useState(investor.whatsappNumber ?? "");
  const [npwp, setNpwp] = useState(investor.npwp ?? "");
  const [kota, setKota] = useState(investor.domisiliKota ?? "");
  const [alamat, setAlamat] = useState(investor.domisiliAlamat ?? "");

  const myContracts = contracts.filter((c) => c.userId === investor.userId);
  const totalInvest = myContracts.reduce((s, c) => s + c.totalInvestIdr, 0);

  function save() {
    if (!fullName.trim()) {
      toast.error("Nama lengkap wajib diisi");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/profile/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetId: investor.userId,
            full_name: fullName.trim(),
            nickname: nickname.trim(),
            whatsapp_number: whatsapp.trim(),
            npwp: npwp.trim(),
            domisili_kota: kota.trim(),
            domisili_alamat: alamat.trim(),
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          toast.error(json.error ?? "Gagal menyimpan");
          return;
        }
        toast.success("Profil investor tersimpan");
        onClose();
        router.refresh();
      } catch {
        toast.error("Gagal menyimpan — coba lagi");
      }
    });
  }

  const Header = (
    <div className="flex items-center justify-between gap-2 px-4 py-3 border-b-2 border-foreground">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
        Edit Investor
      </h2>
      <button
        type="button"
        onClick={onClose}
        className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Tutup"
      >
        <X size={16} strokeWidth={2.5} />
      </button>
    </div>
  );

  const Body = (
    <div className="px-4 py-4 space-y-5">
      {/* Read-only context */}
      <div className="rounded-2xl border border-border bg-muted/30 p-3 space-y-2">
        <div className="flex items-center gap-2.5">
          <EmployeeAvatar
            size="default"
            id={investor.userId}
            full_name={investor.fullName ?? ""}
            avatar_url={investor.avatarUrl}
            avatar_seed={investor.avatarSeed}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-display font-bold text-sm truncate">
                {investor.fullName || "—"}
              </span>
              <span className="text-[10px] font-display font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border-2 border-foreground bg-primary/15 text-foreground">
                Investor
              </span>
            </div>
            {investor.email && (
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground truncate mt-0.5">
                <Mail size={11} className="shrink-0" />
                <span className="truncate">{investor.email}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <Building2 size={12} className="text-muted-foreground shrink-0" />
          {investor.businessUnits.length === 0 ? (
            <span className="text-[11px] italic text-muted-foreground">
              Belum di-assign ke BU
            </span>
          ) : (
            investor.businessUnits.map((bu) => (
              <span
                key={bu}
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border border-foreground/20 bg-card text-foreground"
              >
                {bu}
              </span>
            ))
          )}
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground pt-1 border-t border-border/60">
          <span className="inline-flex items-center gap-1">
            <FileText size={12} /> {myContracts.length} kontrak
          </span>
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Wallet size={12} /> Rp {formatIDR(totalInvest)}
          </span>
        </div>
        <Link
          href="/admin/investors?tab=contracts"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
        >
          Kelola kontrak & payout <ArrowRight size={12} />
        </Link>
      </div>

      {/* Editable fields — investor-appropriate only */}
      <section className="space-y-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Identitas
        </h3>
        <Field label="Nama lengkap" required>
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Nama lengkap investor"
            disabled={pending}
          />
        </Field>
        <Field label="Panggilan">
          <Input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Nama panggilan"
            disabled={pending}
          />
        </Field>
        <Field label="Email (login)">
          <Input value={investor.email ?? ""} disabled readOnly />
          <p className="text-[10px] text-muted-foreground mt-1">
            Email login tidak bisa diubah dari sini.
          </p>
        </Field>
      </section>

      <section className="space-y-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Kontak &amp; Pajak
        </h3>
        <Field label="Nomor WhatsApp">
          <Input
            type="tel"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="+62 8XX-XXXX-XXXX"
            disabled={pending}
          />
        </Field>
        <Field label="NPWP">
          <Input
            value={npwp}
            onChange={(e) => setNpwp(e.target.value)}
            placeholder="Nomor NPWP"
            disabled={pending}
          />
        </Field>
      </section>

      <section className="space-y-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Alamat (untuk dokumen kontrak)
        </h3>
        <Field label="Kota">
          <Input
            value={kota}
            onChange={(e) => setKota(e.target.value)}
            placeholder="Kota domisili"
            disabled={pending}
          />
        </Field>
        <Field label="Alamat lengkap">
          <textarea
            value={alamat}
            onChange={(e) => setAlamat(e.target.value)}
            rows={3}
            placeholder="Alamat domisili lengkap"
            disabled={pending}
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
        </Field>
      </section>
    </div>
  );

  const Footer = (
    <div className="flex items-center justify-end gap-2 px-4 py-3 border-t-2 border-foreground bg-card">
      <Button variant="outline" onClick={onClose} disabled={pending}>
        Batal
      </Button>
      <Button onClick={save} disabled={pending} loading={pending}>
        Simpan
      </Button>
    </div>
  );

  // Renders just the panel content (header / scrollable body / footer).
  // The positioning shell — an in-flow sticky right column on desktop,
  // a full-screen overlay on mobile — is provided by the parent
  // (InvestorAccountsList) so the panel sits inside the page layout
  // instead of floating over it.
  return (
    <div className="flex flex-col h-full min-h-0">
      {Header}
      <div className="flex-1 overflow-y-auto min-h-0">{Body}</div>
      {Footer}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}
