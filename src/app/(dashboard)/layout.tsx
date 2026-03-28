import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { SessionTimeout } from "@/components/session-timeout";
import { createAdminClient } from "@/lib/supabase/config";

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

  // Promoters auto-get a collective on signup, but if somehow they don't have one,
  // check user_type before redirecting to onboarding
  if (!count || count === 0) {
    const { data: userRow } = await admin
      .from("users")
      .select("user_type")
      .eq("id", user.id)
      .maybeSingle();
    const userType = (userRow as { user_type?: string } | null)?.user_type;
    const skipOnboarding = ["promoter", "artist", "venue", "photographer", "videographer", "sound_production", "lighting_production", "sponsor"];
    if (!skipOnboarding.includes(userType ?? "")) {
      redirect("/onboarding");
    }
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
    ((memberships ?? []) as unknown as { collective_id: string; role: string; collectives: { id: string; name: string; slug: string; logo_url: string | null } | null }[]).map((m) => {
      const c = m.collectives ?? { id: m.collective_id, name: "", slug: "", logo_url: null };
      return { ...c, role: m.role };
    });

  return (
    <>
    <SessionTimeout />
    <DashboardShell
      user={{ id: user.id, email: user.email ?? "", fullName: (profile as { full_name?: string } | null)?.full_name ?? "" }}
      collectives={collectives}
    >
      {children}
    </DashboardShell>
    </>
  );
}
