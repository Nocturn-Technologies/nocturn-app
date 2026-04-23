import Link from "next/link";

export default function EventNotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#09090B] px-6 text-center overflow-x-hidden">
      <div className="mb-8">
        <span className="text-2xl font-bold tracking-tight text-[#7B2FF7]">
          nocturn.
        </span>
      </div>

      <h1 className="mb-3 font-heading text-4xl font-bold text-white">
        Event Not Found
      </h1>
      <p className="mb-8 max-w-sm text-base text-white/50">
        This event isn&apos;t available. Check the link, or head back to
        Nocturn to find another night.
      </p>

      <Link
        href="/"
        className="inline-flex items-center justify-center rounded-xl bg-[#7B2FF7] px-6 py-3 min-h-[44px] text-sm font-semibold text-white transition-colors hover:bg-[#9D5CFF] active:scale-95"
      >
        Back to Nocturn
      </Link>
    </div>
  );
}
