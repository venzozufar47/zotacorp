export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { ClipboardCheck, ArrowRight, Check } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/cached";
import { getMyPending360Evaluations } from "@/lib/actions/evaluation-360.actions";

/**
 * Worklist Evaluasi 360° karyawan: daftar peer yang perlu dinilai di
 * round aktif manapun. Hasil (skor & alasan) tidak pernah ditampilkan
 * balik ke karyawan — halaman ini murni untuk mengisi, bukan melihat.
 */
export default async function Evaluasi360Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const { items } = await getMyPending360Evaluations();
  const pending = items.filter((i) => !i.submitted);
  const done = items.filter((i) => i.submitted);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">
          Evaluasi 360°<span className="text-primary">.</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Nilai rekan satu timmu secara jujur & objektif — sertakan alasan dan
          contoh kasus konkret.
        </p>
      </div>

      {items.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Belum ada evaluasi yang perlu kamu isi saat ini.
        </div>
      )}

      {pending.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Perlu diisi ({pending.length})
          </p>
          {pending.map((item) => (
            <Link
              key={`${item.roundId}-${item.subjectId}`}
              href={`/evaluasi/${item.roundId}/${item.subjectId}`}
              className="flex items-center gap-3 rounded-2xl border-2 border-foreground bg-card p-4 shadow-hard-sm hover:-translate-y-0.5 transition"
            >
              <span className="grid place-items-center size-10 rounded-full border-2 border-foreground bg-warning/40 shrink-0">
                <ClipboardCheck size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-tight truncate">
                  Evaluasi untuk {item.subjectName}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {item.roundTitle}
                </p>
              </div>
              <ArrowRight size={18} className="text-muted-foreground shrink-0" />
            </Link>
          ))}
        </div>
      )}

      {done.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sudah diisi ({done.length})
          </p>
          {done.map((item) => (
            <Link
              key={`${item.roundId}-${item.subjectId}`}
              href={`/evaluasi/${item.roundId}/${item.subjectId}`}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card/60 p-4 opacity-70 hover:opacity-100 transition"
            >
              <span className="grid place-items-center size-10 rounded-full border-2 border-success bg-success/15 shrink-0">
                <Check size={18} className="text-success" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-tight truncate">
                  Evaluasi untuk {item.subjectName}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {item.roundTitle}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
