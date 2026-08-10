export const dynamic = "force-dynamic";

import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { listMyMeetingNotes } from "@/lib/actions/yeobo-mom.actions";
import { getMyConnectedYeoboBranches } from "@/lib/investor/access";
import { MeetingNoteBody } from "@/components/investor/MeetingNoteBody";

/**
 * Minutes of Meeting — riwayat hasil rapat yang menyinggung cabang tempat
 * investor ini punya kontrak.
 *
 * Penyaringan per cabang dikerjakan RLS di database, bukan di sini; halaman
 * ini hanya menampilkan apa pun yang dikembalikan. Filter `?cabang=` di
 * bawah murni kenyamanan tampilan dan bukan batas keamanan.
 */

const fmtDate = (ymd: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${ymd}T00:00:00+07:00`));

export default async function InvestorMomPage({
  searchParams,
}: {
  searchParams: Promise<{ cabang?: string }>;
}) {
  const sp = await searchParams;
  const [notes, myBranches] = await Promise.all([
    listMyMeetingNotes(),
    getMyConnectedYeoboBranches(),
  ]);

  const active = sp.cabang && myBranches.includes(sp.cabang) ? sp.cabang : null;
  const shown = active ? notes.filter((n) => n.branches.includes(active)) : notes;

  return (
    <div className="space-y-5 animate-fade-up">
      <header>
        <p className="eyebrow text-muted-foreground">Minutes of Meeting</p>
        <h1 className="mt-1 text-xl sm:text-2xl font-semibold text-foreground">
          Catatan hasil rapat
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Keputusan dan pokok bahasan dari setiap rapat, tersusun dari yang
          terbaru.
        </p>
      </header>

      {/* Filter cabang hanya berguna kalau investor memang terhubung ke lebih
          dari satu cabang. */}
      {myBranches.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Link
            href="/investor/mom"
            className={`press-feedback px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              active === null
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            Semua
          </Link>
          {myBranches.map((b) => (
            <Link
              key={b}
              href={`/investor/mom?cabang=${encodeURIComponent(b)}`}
              className={`press-feedback px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                active === b
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {b}
            </Link>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm font-medium text-foreground">
            Belum ada catatan rapat
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {active
              ? `Belum ada notulen yang membahas cabang ${active}.`
              : "Notulen akan muncul di sini setelah rapat berikutnya dicatat."}
          </p>
        </div>
      ) : (
        <ol className="space-y-4">
          {shown.map((n) => (
            <li
              key={n.id}
              className="rounded-2xl border border-border bg-card p-5 space-y-3"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <CalendarDays size={14} strokeWidth={2} />
                  {fmtDate(n.meetingDate)}
                </span>
                {n.branches.map((b) => (
                  <span
                    key={b}
                    className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-[11px] font-semibold text-muted-foreground"
                  >
                    {b}
                  </span>
                ))}
              </div>

              <h2 className="text-base font-semibold text-foreground">
                {n.title}
              </h2>

              {n.summary && (
                <p className="text-sm text-muted-foreground italic">
                  {n.summary}
                </p>
              )}

              <MeetingNoteBody body={n.body} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
