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

  // Create user with auto-confirm via admin API (no email confirmation needed)
  const { data: newUser, error: createError } = await admin.auth.admin.createUser({
    email: formData.email,
    password: formData.password,
    email_confirm: true,
    user_metadata: { full_name: formData.fullName, user_type: userType },
  });

  if (createError) {
    console.error("[signup] createUser failed:", createError.message);
    return { error: createError.message };
  }

  const userId = newUser.user.id;

  // Insert public.users row (without user_type — PostgREST schema cache is stale for that column).
  // The user_type defaults to 'collective' in DB. Auth metadata stores the real type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: usersInsertError } = await (admin.from("users") as any)
    .upsert(
      {
        id: userId,
        email: formData.email,
        full_name: formData.fullName,
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
