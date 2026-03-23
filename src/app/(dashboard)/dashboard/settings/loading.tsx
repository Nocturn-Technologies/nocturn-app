import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="space-y-6 p-1">
      <Skeleton className="h-8 w-28 bg-nocturn/10" />
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border border-border p-4 space-y-3">
            <Skeleton className="h-5 w-32 bg-muted" />
            <Skeleton className="h-10 w-full bg-muted" />
            <Skeleton className="h-10 w-full bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
