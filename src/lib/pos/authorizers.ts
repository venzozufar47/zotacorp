/**
 * Otorisasi PIN untuk operasi POS non-penjualan.
 *
 * Modul biasa, BUKAN `"use server"`: file `*.actions.ts` tidak boleh
 * mengekspor apa pun selain fungsi async, dan tiga modul aksi berbeda
 * (stok, cake pickup, void) memakai gerbang yang sama. Satu salinan
 * saja — tiga salinan pasti berbeda perilaku begitu salah satu diubah.
 *
 * KENAPA SERVICE-ROLE. Verifikasi harus membaca `profiles.pos_pin_hash`
 * milik ORANG LAIN, sedangkan RLS `profiles` hanya membuka baris sendiri
 * (plus admin). Versi sebelumnya memakai klien sesi, sehingga untuk kasir
 * non-admin query-nya mengembalikan nol baris dan gerbangnya SELALU
 * menolak dengan "belum set PIN POS" — PIN yang benar pun ditolak. Itu
 * juga sebabnya nama authorizer di modal dulu muncul sebagai "Authorizer".
 *
 * Aman karena setiap pemanggil sudah lewat `requireAdminOrPosAssignee`
 * lebih dulu, dan yang dibaca hanya hash (bukan PIN) untuk rekening yang
 * memang boleh dia sentuh.
 *
 * BEBERAPA AUTHORIZER PER OPERASI (migrasi 132). Satu PIN yang cocok dari
 * daftar sudah cukup. Nol baris = operasi tidak butuh PIN sama sekali —
 * itu default rekening baru dan sengaja dipertahankan.
 */

import { createAdminClient } from "@/lib/actions/_supabase-admin";
import { verifyPin } from "@/lib/pos-pin";
import { isRoleEligible, isStrictOperation } from "@/lib/pos/authorizer-policy";
import {
  authorizerNames,
  emptyPosAuthorizerMap,
  isPosOperation,
  isValidPinFormat,
  POS_OPERATION_LABEL_ID,
  type PosAuthorizerMap,
  type PosAuthorizerRef,
  type PosOperation,
} from "@/lib/pos-pin-format";

type AuthorizerRow = { operation: string; user_id: string };
type ProfileRow = {
  id: string;
  full_name: string | null;
  job_role?: string | null;
  pos_pin_hash: string | null;
};

/** Ref + hash-nya. Hash tidak pernah keluar dari modul ini. */
interface InternalRef extends PosAuthorizerRef {
  pinHash: string | null;
  jobRole: string | null;
}

/**
 * Baris authorizer digabung dengan profilnya, dalam DUA query — bukan
 * satu query per orang. Hash ikut terbawa supaya `verifyOperationPin`
 * tidak perlu membaca `profiles` lagi setelah ini.
 */
async function loadRefs(
  bankAccountId: string,
  operation?: PosOperation
): Promise<Map<PosOperation, InternalRef[]>> {
  const out = new Map<PosOperation, InternalRef[]>();
  if (!bankAccountId) return out;

  const db = createAdminClient();
  let query = db
    .from("pos_operation_authorizers")
    .select("operation, user_id")
    .eq("bank_account_id", bankAccountId);
  if (operation) query = query.eq("operation", operation);
  const { data: rowsRaw } = await query;
  const rows = (rowsRaw ?? []) as unknown as AuthorizerRow[];
  if (rows.length === 0) return out;

  const ids = Array.from(new Set(rows.map((r) => r.user_id)));
  const { data: profsRaw } = await db
    .from("profiles")
    .select("id, full_name, job_role, pos_pin_hash")
    .in("id", ids);
  const byId = new Map(
    ((profsRaw ?? []) as unknown as ProfileRow[]).map((p) => [p.id, p])
  );

  for (const r of rows) {
    // Operasi tak dikenal (sisa data lama) diabaikan diam-diam supaya
    // satu baris rusak tidak menjatuhkan seluruh halaman.
    if (!isPosOperation(r.operation)) continue;
    const p = byId.get(r.user_id);
    // Profil hilang → baris dilewati, BUKAN dihitung sebagai authorizer
    // tanpa PIN: uuid tanpa profil tidak bisa memegang PIN, jadi
    // menampilkannya hanya membingungkan.
    if (!p) continue;
    const list = out.get(r.operation) ?? [];
    list.push({
      userId: p.id,
      fullName: p.full_name?.trim() || "(tanpa nama)",
      hasPin: !!p.pos_pin_hash,
      pinHash: p.pos_pin_hash,
      jobRole: p.job_role ?? null,
    });
    out.set(r.operation, list);
  }
  for (const list of out.values()) {
    list.sort((a, b) => a.fullName.localeCompare(b.fullName, "id"));
  }
  return out;
}

const strip = (r: InternalRef): PosAuthorizerRef => ({
  userId: r.userId,
  fullName: r.fullName,
  hasPin: r.hasPin,
});

/**
 * Semua authorizer satu rekening, dikelompokkan per operasi. Dipakai
 * halaman POS untuk tahu apakah modal PIN perlu dibuka dan nama siapa
 * yang ditampilkan. TIDAK menggerbang akses — pemanggil yang gate.
 */
export async function listOperationAuthorizers(
  bankAccountId: string
): Promise<PosAuthorizerMap> {
  const map = emptyPosAuthorizerMap();
  for (const [op, list] of await loadRefs(bankAccountId)) {
    map[op] = list.map(strip);
  }
  return map;
}

/** Authorizer untuk SATU operasi — sedikit lebih murah dari map penuh. */
export async function listAuthorizersFor(
  bankAccountId: string,
  operation: PosOperation
): Promise<PosAuthorizerRef[]> {
  const refs = await loadRefs(bankAccountId, operation);
  return (refs.get(operation) ?? []).map(strip);
}

/**
 * Owner (profil ber-role admin yang sudah set PIN). Matriks SOP selalu
 * menyertakan Owner di setiap operasi — tanpa ini void/opname hanya bisa
 * jalan kalau Koordinator Toko sedang masuk. Tidak dicentang di kartu
 * admin dan tidak muncul di modal PIN; hanya cadangan di gerbang server.
 */
async function loadOwnerRefs(): Promise<InternalRef[]> {
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id, full_name, pos_pin_hash")
    .eq("role", "admin")
    .not("pos_pin_hash", "is", null);
  return ((data ?? []) as unknown as ProfileRow[]).map((p) => ({
    userId: p.id,
    fullName: p.full_name?.trim() || "Owner",
    hasPin: true,
    pinHash: p.pos_pin_hash,
    jobRole: null,
  }));
}

export type PinVerdict =
  | { ok: true; authorizerId: string | null; authorizerName: string | null }
  | { ok: false; error: string };

/**
 * Gerbang PIN untuk satu operasi.
 *
 * WAJIB dipanggil setelah gerbang akses dan SEBELUM tulisan apa pun —
 * gerbang yang berjalan setengah jalan meninggalkan pembayaran tercatat
 * dengan status yang belum pindah, dan itu lebih buruk daripada ditolak.
 *
 * Identitas yang cocok dikembalikan supaya pemanggil bisa MENCATAT siapa
 * yang mengotorisasi. Ini satu-satunya sumber nama pelaku yang dipercaya
 * di POS: akun login tablet menunjuk perangkat, dan nama ketikan tidak
 * dibuktikan apa pun. Keduanya null berarti operasi ini memang tidak
 * butuh PIN — pemanggil harus menyimpan null, bukan menebak nama.
 */
export async function verifyOperationPin(
  bankAccountId: string,
  operation: PosOperation,
  pin: string | undefined
): Promise<PinVerdict> {
  const refs = (await loadRefs(bankAccountId, operation)).get(operation) ?? [];

  // Operasi KERAS (void): hanya Koordinator Toko, tanpa Owner, dan TIDAK
  // pernah bebas-PIN — kartu admin yang kosong tidak boleh membuka void.
  if (isStrictOperation(operation)) {
    const usable = refs.filter(
      (r) => r.pinHash && isRoleEligible(operation, r.jobRole)
    );
    if (usable.length === 0) {
      return {
        ok: false,
        error: `${POS_OPERATION_LABEL_ID[operation]} hanya bisa disetujui PIN Koordinator Toko — belum ada Koordinator Toko ber-PIN yang terdaftar untuk cabang ini. Minta admin mengaturnya di Otorisasi POS.`,
      };
    }
    return matchPin(usable, operation, pin);
  }

  if (refs.length === 0)
    return { ok: true, authorizerId: null, authorizerName: null };

  // Pemegang PIN yang sah = authorizer terdaftar + Owner. Dimuat sekali
  // di sini, bukan di tiap cabang, supaya urutan cek tetap satu jalur.
  const owners = await loadOwnerRefs();
  const usable = [...refs.filter((r) => r.pinHash), ...owners];
  if (usable.length === 0) {
    // Terdaftar tapi belum satu pun punya PIN: operasinya terkunci sampai
    // admin membereskannya. Sebut namanya — pesan generik membuat kasir
    // menebak-nebak di depan customer.
    const who = authorizerNames(refs.map(strip)).join(", ") || "Authorizer";
    return {
      ok: false,
      error: `${who} belum set PIN POS — minta dia buka halaman profil dulu, atau minta admin menambah authorizer lain.`,
    };
  }

  return matchPin(usable, operation, pin);
}

/** Cocokkan PIN dengan salah satu pemegang yang sah (semuanya ber-hash). */
function matchPin(
  usable: InternalRef[],
  operation: PosOperation,
  pin: string | undefined
): PinVerdict {
  if (!pin) return { ok: false, error: "PIN authorization required" };
  if (!isValidPinFormat(pin)) {
    return { ok: false, error: "PIN harus 4–6 digit angka." };
  }

  // scrypt sengaja mahal, tapi daftar authorizer per operasi berukuran
  // satuan sehingga biaya terburuknya masih jauh di bawah satu detik.
  for (const ref of usable) {
    if (verifyPin(pin, ref.pinHash!)) {
      return {
        ok: true,
        authorizerId: ref.userId,
        authorizerName: ref.fullName,
      };
    }
  }

  return {
    ok: false,
    error: `PIN ${POS_OPERATION_LABEL_ID[operation]} salah.`,
  };
}
