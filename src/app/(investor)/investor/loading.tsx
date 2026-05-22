import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton generik untuk semua route /investor/* yang tidak punya
 *  loading.tsx spesifik. Tampil instan via Suspense saat server data
 *  belum siap; mengisi gap antara klik link dan first paint. */
export default function InvestorLoading() {
  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-64 mt-2" />
        <Skeleton className="h-4 w-80 mt-2" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>

      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}
