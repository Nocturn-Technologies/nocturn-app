import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ eventId: string }>;
}

export default async function PlaybookPage({ params }: Props) {
  const { eventId } = await params;
  redirect(`/dashboard/events/${eventId}/tasks?tab=content`);
}
