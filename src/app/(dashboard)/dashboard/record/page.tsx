import { ComingSoonGate } from "@/components/coming-soon-gate";
import { Mic } from "lucide-react";

export default function RecordPage() {
  return (
    <ComingSoonGate
      title="Call Recording"
      description="Record calls with artists and vendors, get AI summaries. Coming soon."
      icon={<Mic className="w-8 h-8 text-nocturn" />}
    />
  );
}
