export default function Loading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-7 w-32 rounded bg-nocturn/10 animate-pulse" />
        <div className="h-4 w-64 rounded bg-nocturn/5 animate-pulse mt-2" />
      </div>
      <div className="flex gap-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-9 w-20 rounded-lg bg-nocturn/10 animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-card animate-pulse" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-card animate-pulse" />
    </div>
  );
}
