import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/config";

const APPROVAL_SECRET = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("user_id");
  const action = searchParams.get("action"); // "approve" or "deny"
  const secret = searchParams.get("secret");

  if (!secret || secret !== APPROVAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!userId) {
    return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
  }

  const admin = createAdminClient();

  if (action === "deny") {
    // Delete the user account
    await admin.auth.admin.deleteUser(userId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin.from("users") as any).delete().eq("id", userId);

    return new NextResponse(
      `<html><body style="background:#09090B;color:#FAFAFA;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;">
        <div><h1 style="color:#FB7185;">Account Denied</h1><p style="color:#A1A1AA;">User ${userId} has been removed.</p></div>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  // Approve: update users table and auth metadata
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin.from("users") as any)
    .update({ is_approved: true })
    .eq("id", userId);

  await admin.auth.admin.updateUserById(userId, {
    user_metadata: { is_approved: true },
  });

  // Get user email to send approval notification
  const { data: userData } = await admin.auth.admin.getUserById(userId);
  const email = userData?.user?.email;
  const name = userData?.user?.user_metadata?.full_name ?? "there";

  // Send approval email
  if (email) {
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            from: "Nocturn <nocturn@trynocturn.com>",
            to: email,
            subject: "You're approved! Welcome to Nocturn",
            html: `
              <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; background: #09090B; color: #FAFAFA;">
                <div style="margin-bottom: 32px;">
                  <span style="color: #7B2FF7; font-weight: 700; font-size: 20px;">nocturn.</span>
                </div>
                <h1 style="font-size: 28px; font-weight: 800; margin: 0 0 16px; line-height: 1.2;">
                  You're in, ${name.split(" ")[0]}!
                </h1>
                <p style="color: #A1A1AA; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
                  Your account has been approved. You now have full access to Nocturn — create events, sell tickets, manage your crew, and grow your collective.
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
        // Non-critical
      }
    }
  }

  return new NextResponse(
    `<html><body style="background:#09090B;color:#FAFAFA;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;">
      <div><h1 style="color:#2DD4BF;">Account Approved!</h1><p style="color:#A1A1AA;">${email ?? userId} now has full access to Nocturn.</p></div>
    </body></html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}
