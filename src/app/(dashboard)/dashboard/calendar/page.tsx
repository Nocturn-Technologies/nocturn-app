import { ComingSoonGate } from "@/components/coming-soon-gate";
import { Calendar } from "lucide-react";

export default function CalendarPage() {
  return (
    <ComingSoonGate
      title="Calendar Heat Map"
      description="See the best nights to throw based on competition and demand. Coming soon."
      icon={<Calendar className="w-8 h-8 text-nocturn" />}
    />
  );
}
