"use client";

import { Lock } from "lucide-react";

interface ComingSoonGateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
}

export function ComingSoonGate({ title, description, icon }: ComingSoonGateProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-nocturn/10 flex items-center justify-center mb-6">
        {icon || <Lock className="w-8 h-8 text-nocturn" />}
      </div>
      <h2 className="text-2xl font-bold font-heading text-foreground mb-2">
        {title}
      </h2>
      <p className="text-muted-foreground max-w-md mb-6">
        {description}
      </p>
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-nocturn/10 text-nocturn text-sm font-medium">
        Coming Soon
      </div>
    </div>
  );
}
