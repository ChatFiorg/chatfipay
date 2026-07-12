import crypto from "crypto";
import { normalizeEmail } from "./buyerAuth";
import { db } from "./firebaseAdmin";

function base64url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(input: string): Buffer {
  let padded = input.replace(/-/g, "+").replace(/_/g, "/");
  while (padded.length % 4) padded += "=";
  return Buffer.from(padded, "base64");
}

function getAuthSecret(): string {
  const secret = process.env.BUYER_AUTH_SECRET;
  if (!secret) throw new Error("BUYER_AUTH_SECRET not configured");
  return secret;
}

export interface StaffPermissions {
  orders: boolean;
  products: boolean;
  analytics: boolean;
}

export interface StaffTokenPayload {
  slug: string;
  email: string;
  permissions: StaffPermissions;
  iat: number;
  exp: number;
  locationId?: string | null;
}

// Reuses the same signing secret as buyer tokens but a distinct payload
// shape (includes permissions), so a buyer token can never be mistaken
// for a staff token or vice versa at verify time.
export function signStaffToken(slug: string, email: string, permissions: StaffPermissions): string {
  const payload: StaffTokenPayload = {
    slug,
    email,
    permissions,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  };
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload)));
  const sig = crypto.createHmac("sha256", getAuthSecret()).update(payloadB64).digest();
  return `${payloadB64}.${base64url(sig)}`;
}

export function verifyStaffToken(token: string | null | undefined): StaffTokenPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  const expectedSig = base64url(
    crypto.createHmac("sha256", getAuthSecret()).update(payloadB64).digest()
  );
  if (expectedSig !== sigB64) return null;
  try {
    const payload: StaffTokenPayload = JSON.parse(base64urlDecode(payloadB64).toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (typeof payload.permissions !== "object") return null;
    return payload;
  } catch {
    return null;
  }
}

// Verifies the token signature/expiry, then checks Firestore to confirm
// the staff doc still exists (not revoked) and returns *live* permissions
// rather than whatever was baked into the token at login time. This makes
// revocation and permission changes take effect immediately instead of
// waiting up to 30 days for the token to expire.
export async function resolveStaffToken(
  token: string | null | undefined,
  slug: string
): Promise<StaffTokenPayload | null> {
  const payload = verifyStaffToken(token);
  if (!payload || payload.slug !== slug) return null;

  try {
    const snap = await db.collection("stores").doc(slug).collection("staff").doc(payload.email).get();
    if (!snap.exists) return null; // revoked

    const data = snap.data()!;
    return {
      ...payload,
      permissions: {
        orders: !!data.permissions?.orders,
        products: !!data.permissions?.products,
        analytics: !!data.permissions?.analytics,
      },
      locationId: data.locationId || null,
    };
  } catch {
    return null;
  }
}

export async function sendStaffInviteEmail(email: string, storeName: string, slug: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM_EMAIL || "ChatFi <onboarding@resend.dev>";
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");

  const loginUrl = `https://store.chatfi.pro/${slug}/login?email=${encodeURIComponent(email)}`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromAddress,
      to: email,
      subject: `You've been invited to join ${storeName} on ChatFi`,
      html: `<div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:24px">
        <h2 style="margin-bottom:4px">Staff Invitation</h2>
        <p style="color:#555">You've been invited to help manage <b>${storeName}</b> on ChatFi.</p>
        <a href="${loginUrl}" style="display:inline-block;margin:20px 0;padding:14px 24px;background:#0a0a0a;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Join ${storeName}</a>
        <p style="color:#999;font-size:12px">If the button doesn't work, visit: ${loginUrl}</p>
      </div>`,
    }),
  });
  if (!res.ok) throw new Error(`Resend send failed: ${await res.text()}`);
}

export async function sendStaffOtpEmail(email: string, otp: string, storeName: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM_EMAIL || "ChatFi <onboarding@resend.dev>";
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromAddress,
      to: email,
      subject: `Staff Login OTP - ${storeName}`,
      html: `<div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:24px">
        <h2 style="margin-bottom:4px">Staff Login OTP</h2>
        <p style="color:#555">Use the code below to log in. It expires in 5 minutes.</p>
        <div style="font-size:32px;font-weight:700;letter-spacing:4px;background:#f5f5f5;padding:16px 20px;border-radius:8px;text-align:center;margin:20px 0">${otp}</div>
      </div>`,
    }),
  });
  if (!res.ok) throw new Error(`Resend send failed: ${await res.text()}`);
}

export { normalizeEmail };
