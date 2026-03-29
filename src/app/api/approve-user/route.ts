import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/config";

const APPROVAL_SECRET = (() => {
  const adminSecret = process.env.ADMIN_APPROVAL_SECRET;
  if (adminSecret) return adminSecret;
  if (process.env.CRON_SECRET) {
    console.warn(
      "[approve-user] ADMIN_APPROVAL_SECRET not set, falling back to CRON_SECRET. " +
      "Set ADMIN_APPROVAL_SECRET to a separate value for better security."
    );
    return process.env.CRON_SECRET;
  }
  return "";
})();

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function GET(request: NextRequest) {
  if (!APPROVAL_SECRET) {
    return NextResponse.json(
      { error: "Server misconfiguration: ADMIN_APPROVAL_SECRET (or CRON_SECRET) not set" },
      { status: 500 }
    );
  }

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

  // Fetch user info to display on the confirmation page
  const admin = createAdminClient();
  const { data: userData } = await admin.auth.admin.getUserById(userId);
  const email = userData?.user?.email ?? "unknown";
  const name = userData?.user?.user_metadata?.full_name ?? "Unknown";
  const userType = userData?.user?.user_metadata?.user_type ?? "unknown";

  const safeUserId = escapeHtml(userId);
  const safeEmail = escapeHtml(email);
  const safeName = escapeHtml(name);
  const safeUserType = escapeHtml(userType);
  const safeSecret = escapeHtml(secret);
  const safeAction = escapeHtml(action ?? "approve");

  // Render an HTML confirmation page — no action is taken on GET
  return new NextResponse(
    `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Nocturn - ${safeAction === "approve" ? "Approve" : "Deny"} User</title></head>
<body style="background:#09090B;color:#FAFAFA;font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <div style="max-width:420px;width:100%;padding:40px 24px;text-align:center;">
    <div style="margin-bottom:32px;">
      <span style="color:#7B2FF7;font-weight:700;font-size:20px;">nocturn.</span>
      <span style="color:#71717A;font-size:14px;margin-left:8px;">Account Review</span>
    </div>
    <div style="background:#18181B;border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:20px;margin-bottom:24px;text-align:left;">
      <p style="color:#FAFAFA;font-size:16px;font-weight:600;margin:0 0 4px;">${safeName}</p>
      <p style="color:#A1A1AA;font-size:14px;margin:0 0 4px;">${safeEmail}</p>
      <p style="color:#71717A;font-size:13px;margin:0;">Type: ${safeUserType}</p>
    </div>
    <p style="color:#A1A1AA;font-size:14px;margin-bottom:24px;">
      Confirm that you want to <strong>${safeAction === "deny" ? "deny" : "approve"}</strong> this account.
    </p>
    <div style="display:flex;gap:12px;justify-content:center;">
      <form method="POST" action="">
        <input type="hidden" name="user_id" value="${safeUserId}" />
        <input type="hidden" name="action" value="approve" />
        <input type="hidden" name="secret" value="${safeSecret}" />
        <button type="submit" style="background:#2DD4BF;color:#09090B;padding:14px 32px;border-radius:12px;border:none;font-weight:700;font-size:15px;cursor:pointer;">
          Approve
        </button>
      </form>
      <form method="POST" action="">
        <input type="hidden" name="user_id" value="${safeUserId}" />
        <input type="hidden" name="action" value="deny" />
        <input type="hidden" name="secret" value="${safeSecret}" />
        <button type="submit" style="background:#FB7185;color:#09090B;padding:14px 32px;border-radius:12px;border:none;font-weight:700;font-size:15px;cursor:pointer;">
          Deny
        </button>
      </form>
    </div>
  </div>
</body>
</html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}

export async function POST(request: NextRequest) {
  if (!APPROVAL_SECRET) {
    return NextResponse.json(
      { error: "Server misconfiguration: ADMIN_APPROVAL_SECRET (or CRON_SECRET) not set" },
      { status: 500 }
    );
  }

  const formData = await request.formData();
  const userId = formData.get("user_id") as string | null;
  const action = formData.get("action") as string | null;
  const secret = formData.get("secret") as string | null;

  if (!secret || secret !== APPROVAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!userId) {
    return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
  }

  const admin = createAdminClient();

  if (action === "deny") {
    // Set is_approved to false in users table and mark as denied in auth metadata
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin.from("users") as any)
      .update({ is_approved: false })
      .eq("id", userId);

    await admin.auth.admin.updateUserById(userId, {
      user_metadata: { is_approved: false, is_denied: true },
    });

    const safeUserId = escapeHtml(userId);

    return new NextResponse(
      `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Account Denied</title></head>
<body style="background:#09090B;color:#FAFAFA;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;">
  <div><h1 style="color:#FB7185;">Account Denied</h1><p style="color:#A1A1AA;">User ${safeUserId} has been denied.</p></div>
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
    user_metadata: { is_approved: true, is_denied: false },
  });

  // Get user email to send approval notification
  const { data: userData } = await admin.auth.admin.getUserById(userId);
  const email = userData?.user?.email;
  const name = userData?.user?.user_metadata?.full_name ?? "there";

  // Send approval email
  if (email) {
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      const safeName = escapeHtml(name.split(" ")[0]);
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
                  You're in, ${safeName}!
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

  const safeEmail = escapeHtml(email ?? userId);

  return new NextResponse(
    `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Account Approved</title></head>
<body style="background:#09090B;color:#FAFAFA;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;">
  <div><h1 style="color:#2DD4BF;">Account Approved!</h1><p style="color:#A1A1AA;">${safeEmail} now has full access to Nocturn.</p></div>
</body></html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}
