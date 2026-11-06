import { redirect } from "next/navigation";
import { Brain } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMyDiscState } from "@/lib/actions/disc.actions";
import { DiscTestWizard } from "@/components/disc/DiscTestWizard";
import { DiscResultView } from "@/components/disc/DiscResultView";
import { Disclosure, DisclosureGroup } from "@/components/account/Disclosure";

export const dynamic = "force-dynamic";

/**
 * Halaman Tes Kepribadian DISC karyawan.
 *  - Di-push admin (disc_test_required) → wizard tes (walau punya hasil
 *    lama: push berarti diminta tes ulang).
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

  if (required) {
    return (
      <div className="space-y-4">
        <DiscTestWizard />
        {result && (
          <DisclosureGroup>
            <Disclosure
              title="Hasil tes sebelumnya"
              icon={Brain}
              summary={result.takenAt}
            >
              <DiscResultView result={result} />
            </Disclosure>
          </DisclosureGroup>
        )}
      </div>
    );
  }

  if (result) return <DiscResultView result={result} />;

  return (
    <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
      <span className="mx-auto grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
        <Brain size={20} aria-hidden />
      </span>
      <h2 className="mt-3 font-display text-base font-semibold">Belum ada hasil tes</h2>
      <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
        Tes DISC diambil atas penugasan admin. Kamu akan diberi tahu saat
        diminta mengambilnya.
      </p>
    </div>
  );
}
