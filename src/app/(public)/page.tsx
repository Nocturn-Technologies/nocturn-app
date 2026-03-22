import Link from "next/link";
import { NocturnLogo } from "@/components/nocturn-logo";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <NocturnLogo size="xl" className="justify-center" />
      <p className="mt-4 max-w-md text-lg text-muted-foreground">
        You run the night. Nocturn runs the business.
      </p>
      <div className="mt-8 flex gap-4">
        <Link
          href="/signup"
          className="inline-flex h-9 items-center justify-center rounded-lg bg-nocturn px-4 text-sm font-medium text-white hover:bg-nocturn-light transition-colors"
        >
          Get Started
        </Link>
        <Link
          href="/login"
          className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium hover:bg-muted transition-colors"
        >
          Sign In
        </Link>
      </div>
    </div>
  );
}
