import { redirect } from "next/navigation";

export default function FinanceEventRedirect({
  params,
}: {
  params: { eventId: string };
}) {
  redirect(`/dashboard/events/${params.eventId}/financials`);
}
