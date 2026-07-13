import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { verifyStoreAccess } from "@/lib/storeAccess";

// GET /api/store/[slug]/sms/settings — owner only
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const storeSnap = await db.collection("stores").doc(slug).get();
    const senderId = storeSnap.exists ? (storeSnap.data()!.sms?.senderId || "") : "";

    const keySnap = await db.collection("storeKeys").doc(slug).get();
    const hasApiKey = keySnap.exists && !!keySnap.data()!.termiiApiKey;

    return NextResponse.json({ success: true, senderId, hasApiKey });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST /api/store/[slug]/sms/settings — owner only
// body: { senderId?, apiKey? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();

    if (body.senderId !== undefined) {
      await db.collection("stores").doc(slug).set({ sms: { senderId: String(body.senderId).trim() } }, { merge: true });
    }

    if (body.apiKey) {
      await db.collection("storeKeys").doc(slug).set({ termiiApiKey: String(body.apiKey).trim() }, { merge: true });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
