"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props extends ComponentProps<typeof Link> {
  children: ReactNode;
}

/**
 * `<Link>` plus spinner yang muncul saat navigasi pending.
 *
 * Kasir sering menekan tombol nav lalu mengira tidak tertekan kalau
 * layar belum berpindah — akhirnya double-tap. Next `useLinkStatus`
 * memberikan sinyal `pending` true selama browser masih memuat route
 * tujuan; kita render spinner kecil di dalam link supaya tap terasa
 * "diterima". Pakai API native (bukan `useTransition + router.push`)
 * supaya prefetch, middle-click, Ctrl/Cmd-click tetap berfungsi.
 */
// prefetch dimatikan: semua halaman POS dinamis & tanpa `loading.js`, jadi
// prefetch tidak membawa apa pun yang berguna (lihat docs Next, bagian
// "Prefetching static vs. dynamic routes") tetapi tiap request-nya tetap lewat
// proxy + auth dan tercatat di log. Sesudah setiap aksi kasir (`revalidatePath`
// mengosongkan Router Cache) semua tab yang terlihat di-prefetch ulang sekaligus.
export function PosNavLink(props: Props) {
  return (
    <Link prefetch={false} {...props}>
      <PendingIndicator />
      {props.children}
    </Link>
  );
}

function PendingIndicator() {
  const { pending } = useLinkStatus();
  return (
    <Loader2
      size={12}
      aria-hidden
      className={cn(
        "animate-spin shrink-0 transition-opacity",
        pending ? "opacity-100 w-3" : "opacity-0 w-0"
      )}
    />
  );
}
