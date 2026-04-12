import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Shared loading skeleton for all employee routes. With no loading.tsx
// file, Next.js keeps the previous page visible until the new page's
// data resolves — tabs feel frozen on click. This file is streamed as
// a Suspense fallback so navigation is instant.
export default function EmployeeLoading() {
  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-32 mt-2" />
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-5 space-y-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-11 w-full rounded-xl" />
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-5 space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
        </CardContent>
      </Card>
    </div>
  );
}
