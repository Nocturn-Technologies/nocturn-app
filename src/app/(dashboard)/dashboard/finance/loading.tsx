import { Skeleton } from "@/components/ui/skeleton";

export default function FinanceLoading() {
  return (
    <div className="space-y-6 p-1">
      <div className="space-y-2">
        <Skeleton className="h-8 w-32 bg-nocturn/10" />
        <Skeleton className="h-4 w-64 bg-muted" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border border-border p-4 space-y-2">
            <Skeleton className="h-4 w-20 bg-muted" />
            <Skeleton className="h-7 w-24 bg-nocturn/10" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="rounded-lg border border-border p-4 space-y-2">
            <Skeleton className="h-5 w-48 bg-muted" />
            <Skeleton className="h-4 w-32 bg-muted" />
            <Skeleton className="h-4 w-24 bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
