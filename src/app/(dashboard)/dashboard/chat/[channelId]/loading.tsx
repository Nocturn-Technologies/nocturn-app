export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-7 w-40 rounded bg-nocturn/10 animate-pulse" />
      <div className="h-4 w-56 rounded bg-nocturn/5 animate-pulse" />
      <div className="h-48 rounded-xl bg-card animate-pulse" />
      <div className="h-32 rounded-xl bg-card animate-pulse" />
    </div>
  );
}
