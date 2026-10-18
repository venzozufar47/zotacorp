/**
 * Logika murni struktur organisasi (tabel `team_members`: leader_id → member_id).
 * Dipakai bersama oleh papan seret-lepas (klien) dan aksi simpan (server) supaya
 * aturan siklusnya satu.
 *
 * Owner TIDAK disimpan di tabel: orang tanpa atasan otomatis berada di bawah
 * Owner — persis aturan routing izin (`leave-requests.actions.ts`, jatuh ke
 * admin kalau tak ada leader). Satu anggota boleh punya beberapa atasan.
 */

export interface OrgLink {
  leaderId: string;
  memberId: string;
}

/** leaderId → daftar memberId. */
export function childrenIndex(links: OrgLink[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const l of links) {
    const list = out.get(l.leaderId) ?? [];
    list.push(l.memberId);
    out.set(l.leaderId, list);
  }
  return out;
}

/** Semua bawahan langsung dan tidak langsung dari `id` (tanpa `id` itu sendiri). */
export function descendantsOf(id: string, links: OrgLink[]): Set<string> {
  const kids = childrenIndex(links);
  const seen = new Set<string>();
  const stack = [...(kids.get(id) ?? [])];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (seen.has(cur) || cur === id) continue;
    seen.add(cur);
    stack.push(...(kids.get(cur) ?? []));
  }
  return seen;
}

/** Atasan langsung `memberId` saat ini. */
export function leadersOfMember(memberId: string, links: OrgLink[]): string[] {
  return links.filter((l) => l.memberId === memberId).map((l) => l.leaderId);
}

/**
 * Apakah menjadikan `leaderId` atasan `memberId` membuat siklus? Ya kalau dia
 * orang yang sama, atau dia sendiri bawahan (langsung/tidak) dari `memberId`.
 */
export function wouldCreateCycle(
  memberId: string,
  leaderId: string,
  links: OrgLink[]
): boolean {
  return leaderId === memberId || descendantsOf(memberId, links).has(leaderId);
}

/**
 * Daftar atasan baru setelah `memberId` diseret dari `fromLeaderId` ke
 * `toLeaderId`.
 *  - `fromLeaderId` null  = diseret dari "tanpa atasan" (di bawah Owner).
 *  - `toLeaderId` null    = dilepas ke Owner: hanya link dari `fromLeaderId`
 *    dicabut (kalau masih ada atasan lain, tetap dimiliki).
 *  - `copy` true          = tambahkan atasan baru TANPA melepas yang lama.
 */
export function nextLeaders(args: {
  current: string[];
  fromLeaderId: string | null;
  toLeaderId: string | null;
  copy: boolean;
}): string[] {
  const { current, fromLeaderId, toLeaderId, copy } = args;
  const set = new Set(current);
  if (!copy && fromLeaderId) set.delete(fromLeaderId);
  if (toLeaderId) set.add(toLeaderId);
  return [...set];
}

/** Sama persis (tanpa memandang urutan)? */
export function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}
