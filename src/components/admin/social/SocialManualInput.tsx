"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Upload, UserPlus, Info, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PLATFORM_LABELS, type SocialAccount } from "@/lib/social/types";
import {
  importManualPosts,
  saveManualAccountSnapshot,
  type ManualImportSummary,
} from "@/lib/actions/social.actions";

/**
 * Jalur input manual — dipakai sampai app review Meta/TikTok lolos.
 *
 * Dibuat berbasis TEMPEL dari spreadsheet, bukan form satu-per-satu, karena
 * yang akan terjadi di lapangan adalah orang menyalin sekaligus seminggu dari
 * Insights bawaan platform. Form per postingan akan ditinggalkan setelah hari
 * ketiga.
 */

const CONTOH = `Tanggal\tWaktu\tCaption\tLink\tTipe\tViews\tLikes\tKomentar\tShare\tSimpan\tJangkauan
2026-07-20\t19:30\tPromo cake ulang tahun\thttps://instagram.com/p/abc123\treel\t12,3 rb\t845\t37\t22\t61\t9.870
2026-07-22\t11:00\tBehind the scene studio\t\treel\t8.420\t512\t19\t8\t34\t7.110`;

export function SocialManualInput({ accounts }: { accounts: SocialAccount[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [text, setText] = useState("");
  const [summary, setSummary] = useState<ManualImportSummary | null>(null);

  const [snapAccountId, setSnapAccountId] = useState(accounts[0]?.id ?? "");
  const [snapDate, setSnapDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [followers, setFollowers] = useState("");
  const [profileViews, setProfileViews] = useState("");

  function runImport() {
    if (!accountId) {
      toast.error("Pilih akunnya dulu.");
      return;
    }
    if (!text.trim()) {
      toast.error("Tempel dulu datanya.");
      return;
    }
    startTransition(async () => {
      const res = await importManualPosts({ accountId, text });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setSummary(res);
      if (res.inserted + res.updated > 0) {
        toast.success(`${res.inserted} konten baru, ${res.updated} diperbarui.`);
        router.refresh();
      } else if (res.errors.length) {
        toast.error("Tidak ada baris yang bisa dibaca.");
      }
    });
  }

  function saveSnapshot() {
    if (!snapAccountId) {
      toast.error("Pilih akunnya dulu.");
      return;
    }
    const f = followers.trim() === "" ? null : Number(followers.replace(/[^\d]/g, ""));
    const pv = profileViews.trim() === "" ? null : Number(profileViews.replace(/[^\d]/g, ""));
    if (f == null && pv == null) {
      toast.error("Isi minimal satu angka.");
      return;
    }
    startTransition(async () => {
      const res = await saveManualAccountSnapshot({
        accountId: snapAccountId,
        capturedDate: snapDate,
        followerCount: f,
        profileViews: pv,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Tersimpan.");
      setFollowers("");
      setProfileViews("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-xl border border-border bg-card px-3 py-2 text-[12.5px] text-muted-foreground">
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>
          Jalur sementara sampai API resmi Instagram &amp; TikTok disetujui. Data yang
          diinput di sini <strong>tidak akan tertimpa</strong> saat sinkronisasi otomatis
          mulai jalan — keduanya hidup berdampingan.
        </span>
      </p>

      {/* Tempel konten */}
      <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-hard space-y-3">
        <div>
          <h3 className="font-display font-bold text-[15px]">Tempel data konten</h3>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Salin langsung dari spreadsheet (baris pertama = judul kolom). Angka ringkas
            gaya Instagram seperti <code>12,3 rb</code> dan format ribuan{" "}
            <code>9.870</code> keduanya terbaca.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
              Akun
            </span>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="mt-1 w-full h-10 rounded-xl border border-border bg-card px-3 text-[13px]"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {PLATFORM_LABELS[a.platform]} · @{a.handle} ({a.businessUnitName})
                </option>
              ))}
            </select>
          </label>
        </div>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={CONTOH}
          className="font-mono text-[11.5px]"
        />

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={runImport} disabled={pending}>
            {pending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Upload size={14} />
            )}
            Impor
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setText(CONTOH)}
            disabled={pending}
          >
            Isi contoh
          </Button>
        </div>

        {summary && (
          <div className="rounded-xl border border-border bg-muted/40 p-3 text-[12.5px] space-y-1">
            <div>
              <strong>{summary.parsed}</strong> baris terbaca ·{" "}
              <strong>{summary.inserted}</strong> konten baru ·{" "}
              <strong>{summary.updated}</strong> diperbarui ·{" "}
              <strong>{summary.metricRows}</strong> titik metrik tersimpan
            </div>
            {summary.errors.length > 0 && (
              <ul className="space-y-0.5">
                {summary.errors.slice(0, 8).map((e, i) => (
                  <li key={i} className="flex items-start gap-1 text-destructive">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                    <span>
                      {e.line > 0 ? `Baris ${e.line}: ` : ""}
                      {e.message}
                    </span>
                  </li>
                ))}
                {summary.errors.length > 8 && (
                  <li className="text-muted-foreground">
                    …dan {summary.errors.length - 8} galat lain
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Snapshot follower */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div>
          <h3 className="font-display font-bold text-[15px]">Catat jumlah follower</h3>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Satu angka per akun per tanggal. Ini satu-satunya sumber grafik pertumbuhan
            follower — catat rutin (mis. tiap Senin) supaya trennya terbentuk.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
              Akun
            </span>
            <select
              value={snapAccountId}
              onChange={(e) => setSnapAccountId(e.target.value)}
              className="mt-1 w-full h-10 rounded-xl border border-border bg-card px-3 text-[13px]"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {PLATFORM_LABELS[a.platform]} · @{a.handle}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
              Tanggal
            </span>
            <Input
              type="date"
              value={snapDate}
              onChange={(e) => setSnapDate(e.target.value)}
              className="mt-1"
            />
          </label>
          <label className="block">
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
              Follower
            </span>
            <Input
              value={followers}
              onChange={(e) => setFollowers(e.target.value)}
              placeholder="12480"
              inputMode="numeric"
              className="mt-1"
            />
          </label>
          <label className="block">
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
              Kunjungan profil (opsional)
            </span>
            <Input
              value={profileViews}
              onChange={(e) => setProfileViews(e.target.value)}
              placeholder="—"
              inputMode="numeric"
              className="mt-1"
            />
          </label>
        </div>
        <Button size="sm" onClick={saveSnapshot} disabled={pending}>
          {pending ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
          Simpan
        </Button>
      </div>
    </div>
  );
}
