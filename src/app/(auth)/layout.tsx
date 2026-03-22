import { NocturnLogo } from "@/components/nocturn-logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center">
          <NocturnLogo size="lg" />
          <p className="mt-1 text-sm text-muted-foreground">
            The Agentic Work OS for Nightlife
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
