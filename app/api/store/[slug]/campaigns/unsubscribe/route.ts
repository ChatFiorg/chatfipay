import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { verifyUnsubscribeToken } from "@/lib/emailCampaigns";

// GET /api/store/[slug]/campaigns/unsubscribe?email=...&token=...
// Public link clicked from a campaign email — no auth, verified by HMAC token instead.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email");
  const token = searchParams.get("token");

  if (!email || !token || !verifyUnsubscribeToken(slug, email, token)) {
    return new NextResponse(
      `<html><body style="font-family:sans-serif;text-align:center;padding:60px 20px"><p>Invalid or expired unsubscribe link.</p></body></html>`,
      { status: 400, headers: { "Content-Type": "text/html" } }
    );
  }

  try {
    await db.collection("stores").doc(slug).collection("emailUnsubscribes").doc(email.toLowerCase()).set({
      email: email.toLowerCase(),
      unsubscribedAt: Timestamp.now(),
    });
  } catch (e) {
    console.error(e);
  }

  return new NextResponse(
    `<html><body style="font-family:sans-serif;text-align:center;padding:60px 20px"><h2>You've been unsubscribed</h2><p>You won't receive marketing emails from this store anymore.</p></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}
