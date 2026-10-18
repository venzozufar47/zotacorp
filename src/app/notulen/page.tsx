export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

/** Default ke Pare — halaman ini tidak scoped akses per-cabang (lihat
 *  catatan modul di `team-minutes.actions.ts`), jadi tidak perlu hub
 *  pemilihan seperti `/tutup-kas` atau `/cash`. */
export default function NotulenHubPage() {
  redirect("/notulen/pare");
}
