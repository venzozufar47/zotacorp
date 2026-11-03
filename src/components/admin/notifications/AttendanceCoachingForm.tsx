"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { getAttendanceCoachingHistory, reviewAttendanceWithCoaching, type AttendanceCoachingHistory } from "@/lib/actions/attendance-coaching.actions";

export function AttendanceCoachingForm({ logId, pending, run }: {
  logId: string;
  pending: boolean;
  run: (action: () => Promise<string | null>, message: string) => void;
}) {
  const [history, setHistory] = useState<AttendanceCoachingHistory | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [note, setNote] = useState("");
  const [level, setLevel] = useState<"coaching" | "teguran">("coaching");
  const [repeatConfirmed, setRepeatConfirmed] = useState(false);

  useEffect(() => {
    let active = true;
    getAttendanceCoachingHistory(logId).then(result => {
      if (!active) return;
      if (result.error || !result.data) setError(result.error ?? "Riwayat tidak tersedia.");
      else { setHistory(result.data); setError(""); }
    }).catch(() => { if (active) setError("Riwayat belum dapat dimuat."); });
    return () => { active = false; };
  }, [logId, retry]);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-background p-3">
      <h3 className="text-sm font-semibold">Tindak lanjut pembinaan</h3>
      <p className="text-xs text-muted-foreground">Penolakan AI perlu diperiksa manusia. Jika foto sudah sesuai, cukup tandai ditinjau tanpa pembinaan.</p>
      {error ? (
        <div role="alert" className="space-y-2 text-xs text-destructive">
          <p>{error}</p>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => setRetry(value => value + 1)}>Coba muat riwayat lagi</Button>
        </div>
      ) : !history ? <p role="status" className="text-xs text-muted-foreground">Memuat riwayat pembinaan absen…</p> : (
        <>
          <details className="text-xs">
            <summary className="cursor-pointer font-medium">Riwayat pembinaan absen: {history.count} catatan</summary>
            <ul className="mt-2 space-y-2">
              {history.notes.map(n => <li key={n.id} className="rounded-lg bg-muted p-2">
                <p className="font-semibold">{n.level === "teguran" ? "Teguran keras" : n.level?.toUpperCase() ?? "Catatan pembinaan"} · {new Date(n.createdAt).toLocaleDateString("id-ID")}</p>
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{n.body}</p>
              </li>)}
            </ul>
          </details>
          <div className="space-y-1">
            <Label htmlFor="attendance-coaching-level">Tingkat tindak lanjut</Label>
            <select id="attendance-coaching-level" value={level} onChange={event => { setLevel(event.target.value as "coaching" | "teguran"); setRepeatConfirmed(false); }} disabled={pending} className="min-h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground">
              <option value="coaching">Catatan pembinaan</option>
              <option value="teguran" disabled={!history.hasCoaching}>Teguran keras — setelah pembinaan</option>
            </select>
          </div>
          {!history.hasCoaching && <p className="text-xs text-muted-foreground">Teguran keras tersedia jika absen ini terjadi setelah catatan pembinaan sebelumnya diterbitkan.</p>}
          {level === "teguran" && <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" className="mt-0.5" checked={repeatConfirmed} onChange={event => setRepeatConfirmed(event.target.checked)} disabled={pending} />
            Saya memastikan ketidaksesuaian yang sama berulang setelah pembinaan sebelumnya, bukan hanya berdasarkan penolakan AI.
          </label>}
          {history.hasWarning && <p className="rounded-lg bg-warning/10 p-2 text-xs text-foreground">Sudah ada teguran keras terkait absen. Jika ketidaksesuaian yang sama kembali berulang, Owner dapat meninjau kelayakan <Link href="/admin/sp" className="font-semibold underline">SP1 di Sistem SP</Link>. SP tidak diterbitkan otomatis.</p>}
        </>
      )}
      <div className="space-y-1">
        <Label htmlFor="attendance-coaching-note">Temuan dan perbaikan yang diminta</Label>
        <Textarea id="attendance-coaching-note" value={note} onChange={event => setNote(event.target.value)} maxLength={1500} disabled={pending} placeholder="Jelaskan temuan yang Anda pastikan dari foto dan penyesuaian yang harus dilakukan pada absen berikutnya." className="min-h-24" />
      </div>
      <p className="text-xs text-muted-foreground">Catatan akan meminta karyawan menyesuaikan absen berikutnya. Apabila SOP dirasa memberatkan atau tidak sesuai, silakan diskusikan dengan atasan langsung.</p>
      <Button className="h-auto min-h-11 w-full whitespace-normal py-2 text-center" disabled={pending || !history || !!error || note.trim().length < 10 || (level === "teguran" && !repeatConfirmed)} loading={pending} onClick={() => run(async () => {
        const result = await reviewAttendanceWithCoaching({ logId, note, level, repeatConfirmed });
        return result.error ?? null;
      }, "Pembinaan tersimpan di beranda karyawan dan absen ditandai ditinjau")}>
        Simpan {level === "teguran" ? "teguran keras" : "pembinaan"} dan tandai ditinjau
      </Button>
    </div>
  );
}
