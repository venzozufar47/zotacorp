import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton spesifik halaman Keuangan investor — header, 3 kartu
 *  rekening picker, sidebar statement list + detail panel. */
export default function InvestorFinanceLoading() {
  return (
    <div className="space-y-6 animate-fade-up">
      <header className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-96" />
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-2xl" />
        ))}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-4">
        <Skeleton className="h-[440px] rounded-2xl" />
        <Skeleton className="h-[440px] rounded-2xl" />
      </section>
    </div>
  );
}
