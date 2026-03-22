import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { DashboardShell } from "@/components/dashboard-shell";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";

// Admin client for bypassing RLS on membership check
function createAdminClient() {
  return createSupabaseClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Use admin client to check memberships (bypasses RLS chicken-and-egg issue)
  const admin = createAdminClient();

  const { count } = await admin
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (!count || count === 0) {
    redirect("/onboarding");
  }

  // Fetch user profile (admin to bypass RLS)
  const { data: profile } = await admin
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  // Fetch user's collectives (admin to bypass RLS)
  const { data: memberships } = await admin
    .from("collective_members")
    .select("collective_id, role, collectives(id, name, slug, logo_url)")
    .eq("user_id", user.id)
    .is("deleted_at", null);

  const collectives =
    memberships?.map((m) => {
      const c = m.collectives as unknown as { id: string; name: string; slug: string; logo_url: string | null };
      return { ...c, role: m.role };
    }) ?? [];

  return (
    <DashboardShell
      user={{ id: user.id, email: user.email ?? "", fullName: profile?.full_name ?? "" }}
      collectives={collectives}
    >
      {children}
    </DashboardShell>
  );
}
