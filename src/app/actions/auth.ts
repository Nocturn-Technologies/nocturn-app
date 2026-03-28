"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

export async function signUpUser(formData: {
  email: string;
  password: string;
  fullName: string;
  userType?: "collective" | "promoter" | "artist" | "venue" | "photographer" | "videographer" | "sound_production" | "lighting_production" | "sponsor" | "artist_manager" | "tour_manager" | "booking_agent" | "event_staff" | "mc_host" | "graphic_designer" | "pr_publicist";
}) {
  const admin = createAdminClient();
  const userType = formData.userType ?? "collective";

  // Collectives and promoters require manual approval
  const requiresApproval = userType === "collective" || userType === "promoter";
  const isApproved = !requiresApproval;

  // Create user with auto-confirm via admin API (no email confirmation needed)
  const { data: newUser, error: createError } = await admin.auth.admin.createUser({
    email: formData.email,
    password: formData.password,
    email_confirm: true,
    user_metadata: { full_name: formData.fullName, user_type: userType, is_approved: isApproved },
  });

  if (createError) {
    console.error("[signup] createUser failed:", createError.message);
    return { error: createError.message };
  }

  const userId = newUser.user.id;

  // Insert public.users row
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: usersInsertError } = await (admin.from("users") as any)
    .upsert(
      {
        id: userId,
        email: formData.email,
        full_name: formData.fullName,
        is_approved: isApproved,
      },
      { onConflict: "id" }
    );
  if (usersInsertError) {
    console.error("[signup] users insert failed:", usersInsertError.message);
  }

  // For all non-collective types: auto-create a personal collective so they satisfy the
  // dashboard layout's "must have ≥1 collective membership" requirement
  if (userType !== "collective") {
    const firstName = formData.fullName.split(" ")[0] || "My";
    const collectiveName = `${firstName}'s ${userType === "promoter" ? "Promos" : "Profile"}`;
    // Use 12 chars of UUID to reduce slug collision risk
    const slug = `${firstName.toLowerCase().replace(/[^a-z0-9]/g, "")}-${userType.replace("_", "-")}-${userId.replace(/-/g, "").slice(0, 12)}`;
    const { data: collective, error: collectiveError } = await admin
      .from("collectives")
      .insert({
        name: collectiveName,
        slug,
        description: null,
        metadata: { auto_created: true, [userType]: true },
      })
      .select("id")
      .single();

    if (collectiveError) {
      console.error(`[signup] Failed to create ${userType} collective:`, collectiveError.message);
      // Non-fatal — user can still use the app, dashboard layout handles missing collective
    }

    if (collective) {
      const { error: memberError } = await admin.from("collective_members").insert({
        collective_id: collective.id,
        user_id: userId,
        role: userType === "promoter" ? "promoter" : "admin",
      });
      if (memberError) {
        console.error(`[signup] Failed to add ${userType} as collective member:`, memberError.message);
      }
    }
  }

  // Send welcome email (non-blocking)
  sendWelcomeEmail(formData.email, formData.fullName, userType).catch(() => {});

  // If requires approval, notify admin (Shawn)
  if (requiresApproval) {
    sendApprovalRequestEmail(userId, formData.email, formData.fullName, userType).catch(() => {});
  }

  // Sign in the user so they get a session cookie
  const supabase = await createServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: formData.email,
    password: formData.password,
  });

  if (signInError) {
    return { error: signInError.message };
  }

  return { error: null };
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function sendWelcomeEmail(email: string, name: string, userType: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const safeName = escapeHtml(name.split(" ")[0]);

  const typeMessages: Record<string, string> = {
    collective: "You're all set to create events, sell tickets, and grow your collective. Start by creating your first event — our AI will help you set everything up.",
    promoter: "You're ready to start promoting. Find events, grab your link, and share it with your network. Every ticket sold through your link is tracked automatically.",
    artist: "Your profile is live on the Nocturn directory. Collectives in your city can now discover and book you. Fill out your SoundCloud and Spotify to stand out.",
    venue: "Your venue is listed on Nocturn. Promoters can now find your space and reach out for bookings. Add your capacity and pricing to attract the right events.",
  };

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: "Nocturn <nocturn@trynocturn.com>",
        to: email,
        subject: `Welcome to Nocturn, ${safeName}`,
        html: `
          <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; background: #09090B; color: #FAFAFA;">
            <div style="margin-bottom: 32px;">
              <span style="color: #7B2FF7; font-weight: 700; font-size: 20px;">nocturn.</span>
            </div>
            <h1 style="font-size: 28px; font-weight: 800; margin: 0 0 16px; line-height: 1.2;">
              Welcome, ${safeName}.
            </h1>
            <p style="color: #A1A1AA; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
              ${typeMessages[userType] || typeMessages.collective}
            </p>
            <a href="https://app.trynocturn.com/dashboard" style="display: inline-block; background: #7B2FF7; color: white; padding: 12px 28px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 14px;">
              Open Nocturn
            </a>
            <p style="color: #71717A; font-size: 12px; margin-top: 40px; line-height: 1.5;">
              You run the night. Nocturn runs the business.<br>
              <a href="https://trynocturn.com" style="color: #7B2FF7; text-decoration: none;">trynocturn.com</a>
            </p>
          </div>
        `,
      }),
    });
  } catch {
    // Non-critical — don't block signup
  }
}

export async function createCollective(formData: {
  name: string;
  slug: string;
  description: string | null;
  city: string;
  instagram: string | null;
  website: string | null;
}) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.error("createCollective: No user session found");
    return { error: "You must be logged in. Please refresh the page and try again." };
  }

  // Use admin client to bypass RLS for initial collective + member creation
  const admin = createAdminClient();

  // Ensure user record exists in users table (FK requirement)
  const { data: existingUser } = await admin
    .from("users")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!existingUser) {
    await admin.from("users").insert({
      id: user.id,
      email: user.email!,
      full_name: user.user_metadata?.full_name ?? user.email!.split("@")[0],
    });
  }

  // Create collective
  const { data: collective, error: collectiveError } = await admin
    .from("collectives")
    .insert({
      name: formData.name,
      slug: formData.slug,
      description: formData.description,
      instagram: formData.instagram,
      website: formData.website,
      metadata: { city: formData.city },
    })
    .select("id")
    .single();

  if (collectiveError) {
    return { error: collectiveError.message };
  }

  // Add user as admin
  const { error: memberError } = await admin
    .from("collective_members")
    .insert({
      collective_id: collective.id,
      user_id: user.id,
      role: "admin",
    });

  if (memberError) {
    return { error: memberError.message };
  }

  return { error: null };
}

async function sendApprovalRequestEmail(userId: string, email: string, name: string, userType: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const approvalSecret = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";
  const approveUrl = `${baseUrl}/api/approve-user?user_id=${userId}&action=approve&secret=${encodeURIComponent(approvalSecret)}`;
  const denyUrl = `${baseUrl}/api/approve-user?user_id=${userId}&action=deny&secret=${encodeURIComponent(approvalSecret)}`;
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);

  const adminEmail = process.env.ADMIN_EMAIL || "shawn@trynocturn.com";

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: "Nocturn <nocturn@trynocturn.com>",
        to: adminEmail,
        subject: `New ${userType} signup needs approval: ${name}`,
        html: `
          <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 24px; background: #09090B; color: #FAFAFA;">
            <div style="margin-bottom: 32px;">
              <span style="color: #7B2FF7; font-weight: 700; font-size: 20px;">nocturn.</span>
              <span style="color: #71717A; font-size: 14px; margin-left: 8px;">Account Approval</span>
            </div>
            <h1 style="font-size: 24px; font-weight: 800; margin: 0 0 16px;">
              New ${userType} signup
            </h1>
            <div style="background: #18181B; border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
              <p style="color: #FAFAFA; font-size: 16px; font-weight: 600; margin: 0 0 4px;">${safeName}</p>
              <p style="color: #A1A1AA; font-size: 14px; margin: 0 0 4px;">${safeEmail}</p>
              <p style="color: #71717A; font-size: 13px; margin: 0;">Type: ${userType}</p>
            </div>
            <div style="display: flex; gap: 12px;">
              <a href="${approveUrl}" style="display: inline-block; background: #2DD4BF; color: #09090B; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 15px;">
                Approve
              </a>
              <a href="${denyUrl}" style="display: inline-block; background: #FB7185; color: #09090B; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 15px;">
                Deny
              </a>
            </div>
            <p style="color: #71717A; font-size: 12px; margin-top: 32px;">
              Click Approve to give them full access. Click Deny to remove their account.
            </p>
          </div>
        `,
      }),
    });
  } catch {
    // Non-critical
  }
}
