"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";

function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email");

  return (
    <div className="min-h-dvh bg-black flex items-center justify-center px-4 overflow-x-hidden">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-[#7B2FF7]/10">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-7 w-7 text-[#7B2FF7]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        <h1 className="text-xl font-semibold text-white mb-2">
          You&apos;ve been unsubscribed
        </h1>

        <p className="text-zinc-400 text-sm leading-relaxed mb-1">
          You will no longer receive event reminder emails from Nocturn.
        </p>

        {email && (
          <p className="text-zinc-500 text-xs mb-6">
            {email}
          </p>
        )}

        {!email && <div className="mb-6" />}

        <Link
          href="/"
          className="min-h-[44px] inline-flex items-center rounded-lg bg-[#7B2FF7] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#9D5CFF]"
        >
          Back to Nocturn
        </Link>
      </div>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-black flex items-center justify-center overflow-x-hidden">
          <div className="text-zinc-400 text-sm">Loading...</div>
        </div>
      }
    >
      <UnsubscribeContent />
    </Suspense>
  );
}
