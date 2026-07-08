import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { verifyStoreAccess } from "@/lib/storeAccess";

// GET /api/store/[slug]/giftcards — list all gift cards (owner only)
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const snap = await db.collection("stores").doc(slug).collection("giftCards").orderBy("createdAt", "desc").get();
    const giftCards = snap.docs.map(d => {
      const data = d.data();
      return {
        code: d.id,
        initialValue: data.initialValue,
        balance: data.balance,
        active: data.active !== false,
        expiresAt: data.expiresAt?.toDate?.()?.toISOString() || null,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
      };
    });
    return NextResponse.json({ success: true, giftCards });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST /api/store/[slug]/giftcards — create a gift card (owner only)
// body: { code, value, expiresAt? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const code = String(body.code || "").trim().toUpperCase();
    const value = Number(body.value);

    if (!code) return NextResponse.json({ error: "Code is required" }, { status: 400 });
    if (!value || value <= 0) return NextResponse.json({ error: "Valid value is required" }, { status: 400 });

    const ref = db.collection("stores").doc(slug).collection("giftCards").doc(code);
    const existing = await ref.get();
    if (existing.exists) return NextResponse.json({ error: "A gift card with this code already exists" }, { status: 409 });

    await ref.set({
      initialValue: value,
      balance: value,
      active: true,
      expiresAt: body.expiresAt ? Timestamp.fromDate(new Date(body.expiresAt)) : null,
      createdAt: Timestamp.now(),
    });

    return NextResponse.json({ success: true, code });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
