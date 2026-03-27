import { Skeleton } from "@/components/ui/skeleton";

export default function ChatLoading() {
  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <Skeleton className="h-8 w-32 bg-nocturn/10" />

      {/* Search bar */}
      <Skeleton className="h-10 w-full rounded-md bg-muted" />

      {/* Channel list */}
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-border p-3">
            <Skeleton className="h-10 w-10 rounded-full bg-nocturn/10" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-32 bg-muted" />
              <Skeleton className="h-3 w-48 bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
