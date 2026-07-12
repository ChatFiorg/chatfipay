import crypto from "crypto";

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  return trimmed || null;
}

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

export interface BuyerTokenPayload {
  slug: string;
  email: string;
  iat: number;
  exp: number;
}

// Lightweight HMAC-signed token (no jsonwebtoken dependency needed).
// Format: base64url(payload) + "." + base64url(hmac-sha256 signature)
export function signBuyerToken(slug: string, email: string): string {
  const payload: BuyerTokenPayload = {
    slug,
    email,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
  };
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload)));
  const sig = crypto.createHmac("sha256", getAuthSecret()).update(payloadB64).digest();
  return `${payloadB64}.${base64url(sig)}`;
}

export function verifyBuyerToken(token: string | null | undefined): BuyerTokenPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  const expectedSig = base64url(
    crypto.createHmac("sha256", getAuthSecret()).update(payloadB64).digest()
  );
  if (expectedSig !== sigB64) return null;
  try {
    const payload: BuyerTokenPayload = JSON.parse(base64urlDecode(payloadB64).toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function generateOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

export function hashOtp(otp: string, salt: string): string {
  return crypto.createHmac("sha256", salt).update(otp).digest("hex");
}


export async function sendPasswordResetEmail(email: string, resetLink: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM_EMAIL || "ChatFi <onboarding@resend.dev>";
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress,
      to: email,
      subject: "Reset your ChatFi password",
      html: `<div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:24px">
        <h2 style="margin-bottom:4px">Reset your password</h2>
        <p style="color:#555">Follow the link below to reset your ChatFi password for your ${email} account. This link expires in 1 hour.</p>
        <a href="${resetLink}" style="display:inline-block;margin:20px 0;padding:14px 24px;background:#C7F284;color:#0b0b0f;font-weight:700;border-radius:8px;text-decoration:none">Reset Password</a>
        <p style="color:#999;font-size:12px">If you did not request this, you can safely ignore this email.</p>
        <p style="color:#999;font-size:12px">Your ChatFi team</p>
      </div>`,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend send failed: ${text}`);
  }
}

export async function sendOtpEmail(email: string, otp: string, storeName: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM_EMAIL || "ChatFi <onboarding@resend.dev>";
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress,
      to: email,
      subject: `Login OTP - ${storeName}`,
      html: `<div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:24px">
        <h2 style="margin-bottom:4px">Login OTP</h2>
        <p style="color:#555">Use the code below to complete your login. It expires in 5 minutes.</p>
        <div style="font-size:32px;font-weight:700;letter-spacing:4px;background:#f5f5f5;padding:16px 20px;border-radius:8px;text-align:center;margin:20px 0">${otp}</div>
        <p style="color:#999;font-size:12px">Powered by ChatFi Pay</p>
      </div>`,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend send failed: ${text}`);
  }
}
