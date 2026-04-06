"use client";

import { Lock } from "lucide-react";

interface ComingSoonGateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
}

export function ComingSoonGate({ title, description, icon }: ComingSoonGateProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center animate-in fade-in duration-500">
      <div className="w-16 h-16 rounded-full bg-nocturn/10 flex items-center justify-center mb-6 transition-colors duration-200">
        {icon || <Lock className="w-8 h-8 text-nocturn" />}
      </div>
      <h1 className="text-2xl font-bold font-heading text-foreground mb-2">
        {title}
      </h1>
      <p className="text-muted-foreground max-w-md mb-6 px-2">
        {description}
      </p>
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-nocturn/10 text-nocturn text-sm font-medium transition-colors duration-200 hover:bg-nocturn/20 active:scale-95">
        Coming Soon
      </div>
    </div>
  );
}
