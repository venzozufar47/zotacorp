"use client";

/**
 * Kontrol arsip bersama untuk dua panel alokasi di halaman PnL (gaji bulk
 * & revenue per cabang). Keduanya butuh perilaku identik — sembunyikan
 * baris yang sudah selesai, dan bisa dimunculkan lagi — jadi tombolnya
 * dipusatkan di sini alih-alih disalin dua kali.
 *
 * Arsip ini murni preferensi tampilan; angka yang diarsipkan TETAP dihitung
 * di PnL. Karena itu tulisannya "arsip", bukan "hapus".
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Eye, EyeOff } from "lucide-react";
import {
  setAllocationArchived,
  type AllocationArchiveKind,
} from "@/lib/actions/allocation-archives.actions";

/** Tombol arsip/kembalikan untuk SATU baris. */
export function ArchiveRowButton({
  kind,
  refKey,
  businessUnit,
  archived,
}: {
  kind: AllocationArchiveKind;
  refKey: string;
  businessUnit: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      title={archived ? "Kembalikan dari arsip" : "Arsipkan baris ini"}
      aria-label={archived ? "Kembalikan dari arsip" : "Arsipkan baris ini"}
      disabled={pending}
      onClick={(e) => {
        // Baris induknya sendiri sebuah tombol expand — tanpa ini, mengarsip
        // ikut membuka/menutup detailnya.
        e.stopPropagation();
        e.preventDefault();
        start(async () => {
          const res = await setAllocationArchived({
            kind,
            refKey,
            businessUnit,
            archived: !archived,
          });
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success(archived ? "Dikembalikan dari arsip" : "Diarsipkan");
          router.refresh();
        });
      }}
      className="shrink-0 rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-40"
    >
      {archived ? (
        <ArchiveRestore className="size-3.5" />
      ) : (
        <Archive className="size-3.5" />
      )}
    </button>
  );
}

/**
 * Toggle "tampilkan arsip" di header panel. Tidak dirender sama sekali
 * kalau belum ada yang diarsipkan — supaya panel tidak menampilkan kontrol
 * yang tak berguna sebelum fiturnya dipakai.
 */
export function ArchiveVisibilityToggle({
  archivedCount,
  showArchived,
  onToggle,
}: {
  archivedCount: number;
  showArchived: boolean;
  onToggle: () => void;
}) {
  if (archivedCount === 0) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition hover:text-foreground"
    >
      {showArchived ? (
        <>
          <EyeOff className="size-3" /> Sembunyikan arsip
        </>
      ) : (
        <>
          <Eye className="size-3" /> Tampilkan arsip ({archivedCount})
        </>
      )}
    </button>
  );
}
