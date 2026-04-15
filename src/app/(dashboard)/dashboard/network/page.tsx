import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { NetworkCRM } from "./network-crm";

export const dynamic = "force-dynamic";

export default async function NetworkPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let collectiveId: string | undefined;

  if (user) {
    const sb = createAdminClient();
    const { data: membership } = await sb
      .from("collective_members")
      .select("collective_id")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    collectiveId = (membership as { collective_id?: string } | null)?.collective_id ?? undefined;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4 overflow-x-hidden px-4 md:px-0">
      <div>
        <h1 className="text-2xl font-bold font-heading">Network</h1>
        <p className="text-xs text-muted-foreground">
          Your contacts, booked artists, and saved profiles — all in one place
        </p>
      </div>
      <NetworkCRM collectiveId={collectiveId} />
    </div>
  );
}
