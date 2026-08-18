import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Client service-role diarahkan ke schema `yeobo` di project ini.
 *
 * UNTYPED sengaja: tipe `Database` hasil generate hanya mencakup schema
 * `public`, sehingga `.schema("yeobo")` menyempit ke `never` dan menolak
 * setiap nama tabel. Meregenerasi tipe untuk dua schema akan mengubah
 * berkas generate yang besar demi beberapa pemanggil; batasnya dikurung
 * di sini.
 *
 * Sejak database yeobospace.id pindah ke schema `yeobo` (Agustus 2026), ini
 * menggantikan client terpisah yang dulu menunjuk project yeobospace lewat
 * `YEOBOSPACE_SUPABASE_URL`/`YEOBOSPACE_SERVICE_ROLE_KEY`. Project lama sudah
 * berhenti menerima tulisan sejak cutover — query yang masih memanggilnya
 * membaca data yang membeku di titik itu, dan makin basi seiring waktu tanpa
 * ada galat yang menandakannya.
 */
export function yeoboAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: "yeobo" } },
  );
}
