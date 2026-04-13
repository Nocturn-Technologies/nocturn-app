export default function EventPageLoading() {
  return (
    <div className="min-h-dvh bg-[#09090B] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#7B2FF7] border-t-transparent" />
        <p className="text-sm text-zinc-500">Loading event...</p>
      </div>
    </div>
  );
}
