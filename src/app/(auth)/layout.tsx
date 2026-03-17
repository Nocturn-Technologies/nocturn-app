export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-nocturn">
            nocturn.
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The Agentic Work OS for Nightlife
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
