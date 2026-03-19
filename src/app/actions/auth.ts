"use server";

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";

// Admin client with service role — only use on the server
function createAdminClient() {
  return createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function signUpUser(formData: {
  email: string;
  password: string;
  fullName: string;
}) {
  const supabase = await createServerClient();

  // Use regular signup (sends confirmation email if enabled, or auto-confirms)
  const { data, error: signUpError } = await supabase.auth.signUp({
    email: formData.email,
    password: formData.password,
    options: {
      data: { full_name: formData.fullName },
    },
  });

  if (signUpError) {
    return { error: signUpError.message };
  }

  // If user was created and session exists, insert profile
  if (data.user) {
    // Use admin client for profile insert (bypasses RLS)
    try {
      const admin = createAdminClient();
      await admin.from("users").insert({
        id: data.user.id,
        email: formData.email,
        full_name: formData.fullName,
      });
    } catch {
      // Non-blocking — user is already created in auth
    }
  }

  return { error: null };
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
