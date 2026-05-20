export const dynamic = "force-dynamic";

import Link from "next/link";
import { Sparkles, TrendingUp, ShieldCheck, ArrowRight, Cake, Building2 } from "lucide-react";
import { getCurrentProfile } from "@/lib/supabase/cached";
import { getMyInvestorAccess } from "@/lib/investor/access";

const BU_VISUAL: Record<
  string,
  { icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>; tagline: string }
> = {
  Haengbocake: {
    icon: Cake,
    tagline:
      "Cake premium handmade — produksi dua cabang (Pare & Semarang).",
  },
  "Yeobo Space": {
    icon: Building2,
    tagline:
      "Co-living + study space terkurasi untuk komunitas mahasiswa & profesional muda.",
  },
};

function greeting() {
  const h = Number(
    new Date().toLocaleString("en-US", {
      timeZone: "Asia/Jakarta",
      hour: "numeric",
      hour12: false,
    })
  );
  if (h >= 5 && h < 12) return "Selamat pagi";
  if (h >= 12 && h < 15) return "Selamat siang";
  if (h >= 15 && h < 18) return "Selamat sore";
  return "Selamat malam";
}

export default async function InvestorHomePage() {
  const profile = await getCurrentProfile();
  const firstName = profile?.full_name?.split(/\s+/)[0] ?? "Investor";
  const { businessUnits } = await getMyInvestorAccess();
  const hasAssignments = businessUnits.length > 0;

  return (
    <div className="space-y-6">
      {/* Hero welcome — selalu tampil, baik state A (pending) maupun B (active) */}
      <section className="animate-fade-up">
        <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-8 relative overflow-hidden">
          <div
            aria-hidden
            className="absolute -right-12 -top-16 size-48 rounded-full bg-primary/10 blur-2xl pointer-events-none"
          />
          <p className="eyebrow text-primary">Investor portal</p>
          <h1 className="mt-2 text-2xl sm:text-3xl font-semibold text-foreground leading-tight">
            {greeting()}, {firstName}.
          </h1>
          <p className="mt-2 text-sm sm:text-base text-muted-foreground max-w-xl">
            Terima kasih sudah menjadi bagian dari perjalanan Zota Corp.
            Portal ini memberi Anda akses transparan ke laporan keuangan
            unit bisnis yang Anda dukung.
          </p>
        </div>
      </section>

      {/* State A — belum di-assign */}
      {!hasAssignments && (
        <section className="animate-fade-up animate-fade-up-delay-1">
          <div className="rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <span className="flex items-center justify-center size-12 rounded-full bg-primary/15 text-primary shrink-0">
                <ShieldCheck size={22} strokeWidth={2.2} />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-foreground">
                  Akun Anda sudah aktif — menunggu aktivasi akses
                </h2>
                <p className="mt-1.5 text-sm text-muted-foreground max-w-2xl">
                  Admin sedang meninjau dan menambahkan unit bisnis
                  tempat Anda berinvestasi. Setelah aktif, halaman ini
                  akan menampilkan ringkasan kinerja keuangan, profit
                  &amp; loss bulanan, dan akses ke ledger transaksi
                  lengkap (mode baca).
                </p>
                <p className="mt-3 text-[12px] text-muted-foreground">
                  Estimasi waktu aktivasi: 1×24 jam kerja. Hubungi tim
                  admin jika perlu bantuan lebih cepat.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* State B — sudah ada assignment */}
      {hasAssignments && (
        <section className="animate-fade-up animate-fade-up-delay-1 space-y-3">
          <div className="flex items-baseline justify-between px-1">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-[0.16em]">
              Unit bisnis Anda
            </h2>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {businessUnits.length} unit
            </span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {businessUnits.map((bu) => {
              const visual = BU_VISUAL[bu] ?? {
                icon: TrendingUp,
                tagline: "Laporan keuangan tersedia untuk unit ini.",
              };
              const Icon = visual.icon;
              return (
                <Link
                  key={bu}
                  href={`/investor/finance?bu=${encodeURIComponent(bu)}`}
                  className="group rounded-2xl border border-border bg-card p-5 hover:border-primary/40 transition-colors flex items-start gap-4"
                >
                  <span className="flex items-center justify-center size-12 rounded-full bg-primary/10 text-primary shrink-0">
                    <Icon size={22} strokeWidth={2.2} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-foreground">
                      {bu}
                    </h3>
                    <p className="mt-0.5 text-[13px] text-muted-foreground">
                      {visual.tagline}
                    </p>
                    <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-primary group-hover:underline">
                      Lihat laporan keuangan
                      <ArrowRight size={12} strokeWidth={2.5} />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Tentang Zota Corp — selalu tampil sebagai identity reinforcer */}
      <section className="animate-fade-up animate-fade-up-delay-2 space-y-3">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-[0.16em]">
            Tentang Zota Corp
          </h2>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles size={18} strokeWidth={2.2} className="text-primary" />
            <p className="text-sm font-semibold text-foreground">
              Membangun bisnis yang berkelanjutan, transparan, dan
              berdampak.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] font-bold text-foreground/70">
                Misi
              </p>
              <p className="mt-1 leading-relaxed">
                Membangun dan mengembangkan unit-unit usaha yang
                memberikan nilai kebaikan kepada komunitas,
                masyarakat, karyawan, dan pemegang saham.
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] font-bold text-foreground/70">
                Komitmen
              </p>
              <p className="mt-1 leading-relaxed">
                Transparansi penuh kepada investor: setiap transaksi
                tercatat, setiap laporan dapat diaudit, setiap
                keputusan dapat ditelusuri.
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] font-bold text-foreground/70">
                Roadmap
              </p>
              <p className="mt-1 leading-relaxed">
                Memperluas brand portfolio dengan tetap menjaga
                kualitas, governance, dan keterlibatan investor di
                tiap babak pertumbuhan.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
