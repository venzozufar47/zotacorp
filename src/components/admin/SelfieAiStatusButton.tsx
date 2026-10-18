"use client";

import { useState } from "react";
import { Loader2, ScanFace } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getSelfieAiStatus,
  type SelfieAiCounts,
  type SelfieAiStatus,
} from "@/lib/actions/attendance-selfie.actions";

/** Perkiraan biaya Gemini per foto (±440 token masuk, ±25 keluar, diukur pada foto asli). */
const RP_PER_PHOTO = 3;

function Usage({ label, c }: { label: string; c: SelfieAiCounts }) {
  return (
    <div className="rounded-lg border border-border/60 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm">
        <span className="font-semibold tabular-nums">{c.checked}</span> foto diperiksa
        <span className="text-muted-foreground"> · ≈ Rp {(c.checked * RP_PER_PHOTO).toLocaleString("id-ID")}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        {c.ok} acc · {c.reject} ditolak · {c.error} AI gagal · {c.skipped} dilewati (batas harian)
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Tombol + popup baca-saja: apa yang sedang dikerjakan AI di halaman Kehadiran. Data diambil saat
 * dibuka (bukan saat halaman dimuat), langsung dari database — jadi selalu keadaan sebenarnya.
 */
export function SelfieAiStatusButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<SelfieAiStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function openDialog() {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const res = await getSelfieAiStatus();
      if ("error" in res) setError(res.error);
      else setStatus(res);
    } catch {
      setError("Gagal memuat status AI.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={openDialog}>
        <ScanFace size={14} />
        AI Absen
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[520px] max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>AI di halaman Kehadiran</DialogTitle>
            <DialogDescription>
              Pemeriksa selfie check-in. AI hanya menilai foto; tidak pernah memblokir absen.
            </DialogDescription>
          </DialogHeader>

          {loading && !status && (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 size={20} className="animate-spin" />
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}

          {status && (
            <div className="space-y-4 text-sm">
              <Section title="Mesin">
                <p>
                  Gemini <span className="font-mono text-xs">{status.model}</span> ·{" "}
                  {status.keyConfigured ? (
                    <span className="text-success">kunci API terpasang</span>
                  ) : (
                    <span className="text-destructive">kunci API belum diatur (AI tidak jalan)</span>
                  )}
                </p>
              </Section>

              <Section title="Aturan aktif per unit">
                {status.units.length === 0 && <p className="text-muted-foreground">Belum ada aturan.</p>}
                {status.units.map((u) => (
                  <div key={u.unit} className="rounded-lg border border-border/60 px-3 py-2">
                    <p className="font-medium">
                      {u.unit}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        · {u.employees} karyawan aktif · {u.enabled ? "aktif" : "dimatikan"}
                      </span>
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {u.filters.map((f) => (
                        <span key={f} className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium">
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                {status.unitsWithoutRule.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Tanpa pemeriksaan AI: {status.unitsWithoutRule.join(", ")}.
                  </p>
                )}
              </Section>

              {status.userRules.length > 0 && (
                <Section title="Aturan tambahan per orang">
                  {status.userRules.map((u) => (
                    <p key={u.name}>
                      {u.name} <span className="text-muted-foreground">· {u.rules.join(", ")}</span>
                    </p>
                  ))}
                </Section>
              )}

              <Section title="Alur saat foto ditolak">
                <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                  <li>Karyawan memilih Foto ulang atau Tetap absen (jika merasa AI keliru).</li>
                  <li>Tetap absen: masuk Inbox admin + push, sekali per karyawan per hari.</li>
                  <li>Jam check-in memakai foto pertama, jadi foto ulang tidak membuat terlambat.</li>
                  <li>Maks. {status.dailyCap} foto diperiksa AI per orang per hari; setelah itu diterima tanpa AI.</li>
                  <li>AI gagal atau lambat: absen lolos, ditandai &ldquo;AI tidak sempat&rdquo;.</li>
                </ul>
              </Section>

              <Section title="Pemakaian">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Usage label="Hari ini" c={status.today} />
                  <Usage label="7 hari terakhir" c={status.week} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Menunggu tinjauan admin:{" "}
                  <span className={status.pendingReview > 0 ? "font-semibold text-warning" : "font-semibold"}>
                    {status.pendingReview} kasus
                  </span>{" "}
                  (karyawan tetap absen walau ditolak AI; buka fotonya di tabel lalu Tandai sudah ditinjau).
                </p>
              </Section>

              <Section title="Fitur AI lama">
                <p className="text-muted-foreground">
                  Penanda &ldquo;AI: cek foto&rdquo; (deteksi foto tidak biasa) nonaktif sejak 12 Sep 2026.
                </p>
              </Section>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
