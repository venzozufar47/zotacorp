export interface ExistingItem {
  id: string;
  title: string;
  note: string | null;
  sort_order: number;
}

export interface DraftItemInput {
  id?: string;
  title: string;
  note?: string | null;
}

export type ItemDiff =
  | { ok: false; error: string }
  | {
      ok: true;
      added: DraftItemInput[];
      /** Item lama yang tidak ada lagi di draft. */
      removed: ExistingItem[];
      /** Apakah ada perubahan pada daftar item (tambah/hapus/ubah teks/urutan). */
      changed: boolean;
    };

/**
 * Bandingkan daftar item lama dengan draft hasil edit (murni, tanpa I/O).
 * Item dikenali lewat `id`; tanpa id = item baru; item lama yang tidak ada di
 * draft = dihapus. Menolak id ganda dan id yang bukan milik tugas ini.
 */
export function diffTaskItems(existing: ExistingItem[], draft: DraftItemInput[]): ItemDiff {
  const existingIds = new Set(existing.map((e) => e.id));
  const keptIds = draft.filter((d) => d.id).map((d) => d.id as string);
  if (new Set(keptIds).size !== keptIds.length) {
    return { ok: false, error: "Item duplikat dalam daftar." };
  }
  if (keptIds.some((id) => !existingIds.has(id))) {
    return {
      ok: false,
      error: "Ada item yang bukan bagian dari tugas ini. Muat ulang lalu coba lagi.",
    };
  }

  const added = draft.filter((d) => !d.id);
  const removed = existing.filter((e) => !keptIds.includes(e.id));
  const changed =
    added.length > 0 ||
    removed.length > 0 ||
    draft.some((d, idx) => {
      const old = existing.find((e) => e.id === d.id);
      return (
        !old ||
        old.title !== d.title ||
        (old.note ?? null) !== (d.note || null) ||
        old.sort_order !== idx
      );
    });
  return { ok: true, added, removed, changed };
}
