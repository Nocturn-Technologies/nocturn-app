"use server";

import { cookies } from "next/headers";
import crypto from "crypto";

const COOKIE_NAME = "nocturn_admin";
const COOKIE_MAX_AGE = 60 * 60 * 8; // 8 hours

/**
 * Verify admin secret using timing-safe comparison and set an httpOnly cookie.
 * Secret never appears in URLs, browser history, or logs.
 */
export async function verifyAdminSecret(secret: string): Promise<{ error: string | null }> {
  const cronSecret = process.env.CRON_SECRET ?? "";
  if (!cronSecret) {
    return { error: "Admin access is not configured" };
  }

  if (!secret.trim()) {
    return { error: "Password is required" };
  }

  // Timing-safe comparison to prevent timing attacks
  const secretBuf = Buffer.from(secret);
  const expectedBuf = Buffer.from(cronSecret);

  if (secretBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(secretBuf, expectedBuf)) {
    return { error: "Invalid password" };
  }

  // Set httpOnly cookie — secret stays server-side
  const cookieStore = await cookies();
  const token = crypto.createHmac("sha256", cronSecret).update("nocturn-admin-session").digest("hex");
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: COOKIE_MAX_AGE,
    path: "/admin",
  });

  return { error: null };
}

/**
 * Check if the admin session cookie is valid.
 */
export async function isAdminAuthenticated(): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET ?? "";
  if (!cronSecret) return false;

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return false;

  const expectedToken = crypto.createHmac("sha256", cronSecret).update("nocturn-admin-session").digest("hex");
  const tokenBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(expectedToken);

  if (tokenBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(tokenBuf, expectedBuf);
}
