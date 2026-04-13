"use client";

import { useEffect } from "react";

export default function EventPageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[event-page-error]", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#09090B] p-6 text-center text-white">
      <h1 className="text-2xl font-bold text-[#7B2FF7]">nocturn.</h1>
      <h2 className="text-lg font-semibold">Event not found</h2>
      <p className="max-w-sm text-sm text-gray-400">
        This event may have been removed or the link might be incorrect.
      </p>
      <button
        onClick={reset}
        className="rounded-lg bg-[#7B2FF7] px-6 py-3 text-sm font-semibold text-white hover:bg-[#9D5CFF]"
      >
        Try again
      </button>
    </div>
  );
}
