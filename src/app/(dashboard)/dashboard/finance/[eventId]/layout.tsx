import { notFound } from "next/navigation";
import { isValidUUID } from "@/lib/utils";

interface Props {
  params: Promise<{ eventId: string }>;
  children: React.ReactNode;
}

export default async function FinanceEventIdLayout({ params, children }: Props) {
  const { eventId } = await params;

  if (!isValidUUID(eventId)) {
    notFound();
  }

  return <>{children}</>;
}
