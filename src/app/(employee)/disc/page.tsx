import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyDiscState } from "@/lib/actions/disc.actions";
import { DiscTestWizard } from "@/components/disc/DiscTestWizard";
import { DiscResultView } from "@/components/disc/DiscResultView";

export const dynamic = "force-dynamic";

/**
 * Halaman Tes Kepribadian DISC karyawan.
 *  - Di-push admin (disc_test_required) → wizard tes (walau punya hasil
 *    lama — push berarti diminta tes ulang).
 *  - Punya hasil → tampilkan hasil + insight.
 *  - Tidak di-push & belum punya hasil → info bahwa tes berbasis
 *    penugasan admin.
 */
export default async function DiscPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { required, result } = await getMyDiscState();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">
          Tes Kepribadian DISC<span className="text-primary">.</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Kenali gaya kerjamu — kekuatan, cara berkomunikasi, dan hal yang bisa
          dikembangkan.
        </p>
      </div>

      {required ? (
        <>
          <div className="rounded-xl border-2 border-warning bg-warning/15 px-4 py-3 text-sm">
            <p className="font-semibold">Kamu diminta mengambil tes ini oleh admin.</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Slip gaji kamu terkunci sampai tes selesai. Hasilnya langsung muncul
              setelah submit — cuma butuh ±10 menit.
            </p>
          </div>
          <DiscTestWizard />
          {result && (
            <details className="rounded-xl border border-border bg-card px-4 py-3">
              <summary className="text-sm font-semibold cursor-pointer">
                Lihat hasil tes sebelumnya ({result.takenAt})
              </summary>
              <div className="pt-4">
                <DiscResultView result={result} />
              </div>
            </details>
          )}
        </>
      ) : result ? (
        <DiscResultView result={result} />
      ) : (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Belum ada hasil tes untukmu. Tes DISC diambil berdasarkan penugasan dari
          admin — nanti kamu akan diberi tahu kalau diminta mengambilnya.
        </div>
      )}
    </div>
  );
}
