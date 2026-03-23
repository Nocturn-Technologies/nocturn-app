import { Skeleton } from "@/components/ui/skeleton";

export default function ChatLoading() {
  return (
    <div className="flex h-[calc(100vh-120px)] flex-col">
      <div className="border-b border-border p-4">
        <Skeleton className="h-6 w-32 bg-nocturn/10" />
      </div>
      <div className="flex-1 space-y-4 p-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={`flex gap-3 ${i % 2 === 0 ? "justify-end" : ""}`}>
            {i % 2 !== 0 && <Skeleton className="h-8 w-8 rounded-full bg-nocturn/10" />}
            <div className="space-y-1">
              <Skeleton className={`h-4 ${i % 2 === 0 ? "w-48" : "w-64"} bg-muted`} />
              <Skeleton className="h-4 w-32 bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
