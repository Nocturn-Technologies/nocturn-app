export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 bg-nocturn/10 rounded-lg animate-pulse" />
      <div className="h-4 w-64 bg-nocturn/5 rounded animate-pulse" />
      <div className="grid gap-4 sm:grid-cols-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-32 rounded-xl bg-nocturn/5 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
