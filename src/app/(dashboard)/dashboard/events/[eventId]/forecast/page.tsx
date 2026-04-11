import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ eventId: string }>;
}

// Forecast was merged into the unified Financials page. Keep this route alive
// as a permanent redirect so any old bookmarks/links land in the right place.
export default async function EventForecastPage({ params }: Props) {
  const { eventId } = await params;
  redirect(`/dashboard/events/${eventId}/financials`);
}
