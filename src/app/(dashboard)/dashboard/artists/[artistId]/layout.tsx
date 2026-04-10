import { notFound } from "next/navigation";
import { isValidUUID } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";

interface Props {
  params: Promise<{ artistId: string }>;
  children: React.ReactNode;
}

export default async function ArtistIdLayout({ params, children }: Props) {
  const { artistId } = await params;

  if (!isValidUUID(artistId)) {
    notFound();
  }

  // ── Server-side auth check ────────────────────────────────────────────────
  // The `artists` table is intentionally a platform-wide directory — there's
  // no `collective_id` column (see database.types.ts). Any authenticated
  // operator can browse the shared artist directory. We still require the
  // user to be logged in, and RLS on `artists` + `event_artists` prevents
  // them from reading fee/booking data that isn't linked to their collective.
  //
  // TODO(audit): if we ever scope artists to collectives, add a membership
  // check here mirroring the pattern in events/[eventId]/layout.tsx.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }

  return <>{children}</>;
}
