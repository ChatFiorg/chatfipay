import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { auth } from "@/lib/firebaseAdminAuth";
import { signOwnerToken, normalizeEmail } from "@/lib/ownerAuth";

// POST /api/owner-auth/session
// body: { idToken } — a Firebase Auth ID token from the client, obtained via
// either Google sign-in or email/password sign-in/sign-up (both go through
// Firebase Auth client-side; this endpoint doesn't care which method was used
// under the hood, it just verifies the resulting token).
// Checks storeEmails for an existing store owned by this email, and issues a
// signed owner session token either way.
export async function POST(req: NextRequest) {
  try {
    const { idToken } = await req.json();
    if (!idToken) return NextResponse.json({ error: "Missing idToken" }, { status: 400 });

    const decoded = await auth.verifyIdToken(idToken);
    const email = decoded.email;
    if (!email) return NextResponse.json({ error: "No email on this account" }, { status: 400 });

    const normalizedEmail = normalizeEmail(email);
    const method = decoded.firebase?.sign_in_provider === "google.com" ? "google" : "email";

    const emailSnap = await db.collection("storeEmails").doc(normalizedEmail).get();
    const hasStore = emailSnap.exists && Array.isArray(emailSnap.data()?.usernames) && emailSnap.data()!.usernames.length > 0;
    const activeUsername = hasStore ? emailSnap.data()!.activeUsername : null;
    const usernames = hasStore ? emailSnap.data()!.usernames : [];

    const token = signOwnerToken(`email:${normalizedEmail}`, method);

    return NextResponse.json({ success: true, token, hasStore, activeUsername, usernames, email: normalizedEmail });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Invalid or expired sign-in" }, { status: 401 });
  }
}
