import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/config";
import AdminGate from "./admin-gate";

export const metadata: Metadata = {
  title: "Admin — Nocturn",
  robots: "noindex, nofollow",
};

// Force dynamic rendering (env var check + DB queries)
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ secret?: string }>;
}

export default async function AdminPage({ searchParams }: Props) {
  const params = await searchParams;
  const secret = params.secret ?? "";
  const cronSecret = process.env.CRON_SECRET ?? "";

  // Gate: if no secret or wrong secret, show password form
  if (!cronSecret || secret !== cronSecret) {
    return <AdminGate />;
  }

  const supabase = createAdminClient();

  // ── Parallel queries ──────────────────────────────────────────────
  const [
    pendingRes,
    totalUsersRes,
    collectivesRes,
    marketplaceRes,
    eventsRes,
    recentUsersRes,
    marketplaceBreakdownRes,
  ] = await Promise.all([
    // Pending approvals
    supabase
      .from("users")
      .select("id, email, user_type, full_name, created_at")
      .eq("is_approved" as any, false)
      .order("created_at", { ascending: false }),
    // Total users count
    supabase.from("users").select("id", { count: "exact", head: true }),
    // Collectives count
    supabase.from("collectives").select("id", { count: "exact", head: true }),
    // Marketplace profiles count
    supabase
      .from("marketplace_profiles")
      .select("id", { count: "exact", head: true }),
    // Events count
    supabase.from("events").select("id", { count: "exact", head: true }),
    // Recent 20 signups
    supabase
      .from("users")
      .select("id, email, user_type, full_name, created_at, is_approved")
      .order("created_at", { ascending: false })
      .limit(20),
    // Marketplace breakdown by user_type
    supabase.from("marketplace_profiles").select("user_type"),
  ]);

  const pendingUsers = (pendingRes.data as any[]) ?? [];
  const totalUsers = totalUsersRes.count ?? 0;
  const totalCollectives = collectivesRes.count ?? 0;
  const totalMarketplace = marketplaceRes.count ?? 0;
  const totalEvents = eventsRes.count ?? 0;
  const recentUsers = (recentUsersRes.data as any[]) ?? [];

  // Fetch auth metadata for pending users (last_sign_in, etc.)
  const authMetaMap: Record<string, any> = {};
  if (pendingUsers.length > 0 || recentUsers.length > 0) {
    const allIds = new Set([
      ...pendingUsers.map((u: any) => u.id),
      ...recentUsers.map((u: any) => u.id),
    ]);
    const { data: authList } = await supabase.auth.admin.listUsers({
      perPage: 1000,
    });
    if (authList?.users) {
      for (const u of authList.users) {
        if (allIds.has(u.id)) {
          authMetaMap[u.id] = {
            full_name: u.user_metadata?.full_name,
            user_type: u.user_metadata?.user_type,
            last_sign_in_at: u.last_sign_in_at,
          };
        }
      }
    }
  }

  // Marketplace breakdown
  const mpBreakdown: Record<string, number> = {};
  if (marketplaceBreakdownRes.data) {
    for (const row of marketplaceBreakdownRes.data as any[]) {
      const t = row.user_type ?? "unknown";
      mpBreakdown[t] = (mpBreakdown[t] ?? 0) + 1;
    }
  }

  function formatDate(d: string | null) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl space-y-10">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold font-[var(--font-heading)]">
              Nocturn Admin
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Internal dashboard &mdash; {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>
          <a
            href="/admin"
            className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Lock
          </a>
        </div>

        {/* ── Section 1: Pending Approvals ─────────────────────────────── */}
        <section>
          <h2 className="text-xl font-semibold mb-4 text-[#7B2FF7]">
            Pending Approvals ({pendingUsers.length})
          </h2>
          {pendingUsers.length === 0 ? (
            <p className="text-zinc-500 text-sm">No pending approvals.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900 text-zinc-400">
                  <tr>
                    <th className="text-left px-4 py-3">Name</th>
                    <th className="text-left px-4 py-3">Email</th>
                    <th className="text-left px-4 py-3">Type</th>
                    <th className="text-left px-4 py-3">Signed Up</th>
                    <th className="text-left px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {pendingUsers.map((user: any) => {
                    const meta = authMetaMap[user.id];
                    const name =
                      user.full_name ?? meta?.full_name ?? "—";
                    const type =
                      user.user_type ?? meta?.user_type ?? "—";
                    return (
                      <tr key={user.id} className="hover:bg-zinc-900/60">
                        <td className="px-4 py-3 font-medium">{name}</td>
                        <td className="px-4 py-3 text-zinc-400">
                          {user.email}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-block rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs capitalize">
                            {type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-zinc-400">
                          {formatDate(user.created_at)}
                        </td>
                        <td className="px-4 py-3 space-x-3">
                          <a
                            href={`/api/approve-user?user_id=${user.id}&action=approve&secret=${encodeURIComponent(secret)}`}
                            className="text-green-400 hover:text-green-300 font-medium transition-colors"
                          >
                            Approve
                          </a>
                          <a
                            href={`/api/approve-user?user_id=${user.id}&action=deny&secret=${encodeURIComponent(secret)}`}
                            className="text-red-400 hover:text-red-300 font-medium transition-colors"
                          >
                            Deny
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Section 2: Quick Stats ───────────────────────────────────── */}
        <section>
          <h2 className="text-xl font-semibold mb-4 text-[#7B2FF7]">
            Quick Stats
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Total Users", value: totalUsers },
              { label: "Collectives", value: totalCollectives },
              { label: "Marketplace Profiles", value: totalMarketplace },
              { label: "Events", value: totalEvents },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5"
              >
                <p className="text-sm text-zinc-400">{stat.label}</p>
                <p className="text-3xl font-bold mt-1">{stat.value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Section 3: Recent Signups ─────────────────────────────────── */}
        <section>
          <h2 className="text-xl font-semibold mb-4 text-[#7B2FF7]">
            Recent Signups
          </h2>
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-zinc-400">
                <tr>
                  <th className="text-left px-4 py-3">Name</th>
                  <th className="text-left px-4 py-3">Email</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-left px-4 py-3">Signed Up</th>
                  <th className="text-left px-4 py-3">Last Sign In</th>
                  <th className="text-left px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {recentUsers.map((user: any) => {
                  const meta = authMetaMap[user.id];
                  const name =
                    user.full_name ?? meta?.full_name ?? "—";
                  const type =
                    user.user_type ?? meta?.user_type ?? "—";
                  const approved = user.is_approved;
                  return (
                    <tr key={user.id} className="hover:bg-zinc-900/60">
                      <td className="px-4 py-3 font-medium">{name}</td>
                      <td className="px-4 py-3 text-zinc-400">
                        {user.email}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs capitalize">
                          {type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-400">
                        {formatDate(user.created_at)}
                      </td>
                      <td className="px-4 py-3 text-zinc-400">
                        {formatDate(meta?.last_sign_in_at ?? null)}
                      </td>
                      <td className="px-4 py-3">
                        {approved ? (
                          <span className="inline-block rounded-full bg-green-900/30 text-green-400 px-2.5 py-0.5 text-xs font-medium">
                            Approved
                          </span>
                        ) : (
                          <span className="inline-block rounded-full bg-yellow-900/30 text-yellow-400 px-2.5 py-0.5 text-xs font-medium">
                            Pending
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {recentUsers.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-6 text-center text-zinc-500"
                    >
                      No users yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Section 4: Marketplace Breakdown ─────────────────────────── */}
        <section>
          <h2 className="text-xl font-semibold mb-4 text-[#7B2FF7]">
            Marketplace Breakdown
          </h2>
          {Object.keys(mpBreakdown).length === 0 ? (
            <p className="text-zinc-500 text-sm">No marketplace profiles yet.</p>
          ) : (
            <div className="rounded-lg border border-zinc-800 divide-y divide-zinc-800">
              {Object.entries(mpBreakdown)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => (
                  <div
                    key={type}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <span className="capitalize text-sm">{type}</span>
                    <span className="text-sm font-semibold text-[#7B2FF7]">
                      {count}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </section>

        {/* ── Section 5: Quick Links ───────────────────────────────────── */}
        <section>
          <h2 className="text-xl font-semibold mb-4 text-[#7B2FF7]">
            Quick Links
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              {
                label: "Vercel",
                href: "https://vercel.com/nocturn-technologies",
              },
              { label: "PostHog", href: "https://us.posthog.com" },
              {
                label: "Supabase",
                href: "https://supabase.com/dashboard/project/zvmslijvdkcnkrjjgaie",
              },
              { label: "Stripe", href: "https://dashboard.stripe.com" },
              {
                label: "GitHub",
                href: "https://github.com/Nocturn-Technologies/nocturn-app",
              },
            ].map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm text-center hover:border-[#7B2FF7] hover:text-[#7B2FF7] transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>
        </section>

        {/* Footer */}
        <p className="text-center text-xs text-zinc-600 pt-4">
          Nocturn Admin &mdash; Internal Use Only
        </p>
      </div>
    </div>
  );
}
