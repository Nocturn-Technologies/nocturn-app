import { Skeleton } from "@/components/ui/skeleton";

export default function RecordLoading() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-12">
      <Skeleton className="h-8 w-32 bg-nocturn/10" />
      <Skeleton className="h-24 w-24 rounded-full bg-nocturn/10" />
      <Skeleton className="h-4 w-48 bg-muted" />
    </div>
  );
}
