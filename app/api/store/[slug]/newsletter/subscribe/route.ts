import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) return null;
  return trimmed;
}

// POST /api/store/[slug]/newsletter/subscribe — public, called from the live storefront.
// Upserts a customer record (CRM) keyed by normalized email, tagged "newsletter",
// so existing bulk email campaigns (segment: 'tag', tag: 'newsletter') can reach them
// without any separate sending system.
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  try {
    const body = await req.json();
    const email = normalizeEmail(body.email);
    if (!email) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    const storeSnap = await db.collection("stores").doc(slug).get();
    if (!storeSnap.exists) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const custRef = db.collection("stores").doc(slug).collection("customers").doc(email);
    const custSnap = await custRef.get();
    const now = Timestamp.now();

    const existingTags: string[] = custSnap.exists ? (custSnap.data()!.tags || []) : [];
    const tags = existingTags.includes("newsletter") ? existingTags : [...existingTags, "newsletter"];

    await custRef.set(
      {
        email,
        tags,
        newsletterSubscribedAt: now,
        ...(custSnap.exists ? {} : { firstOrderAt: null, lastOrderAt: null, orderCount: 0, totalSpent: 0 }),
      },
      { merge: true }
    );

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("newsletter subscribe failed:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
