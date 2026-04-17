import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Shared loading skeleton for all admin routes. Rendered instantly via
// React Suspense while the destination page's data streams in, so tab
// clicks feel responsive instead of waiting for Supabase roundtrips.
export default function AdminLoading() {
  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-start justify-between mb-6">
        <div>
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-72 mt-2" />
        </div>
      </div>

      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b">
            <Skeleton className="h-5 w-48" />
          </div>
          <div className="divide-y">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="p-4 flex items-center gap-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-40 ml-auto" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
