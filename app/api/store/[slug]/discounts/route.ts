import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

async function getStoreByApiKey(apiKey: string | null, slug: string) {
  if (!apiKey) return null;
  const snap = await db.collection("storeKeys").doc(slug).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  if (data.apiKey !== apiKey) return null;
  return data;
}

// GET /api/store/[slug]/discounts — list all discount codes (owner only)
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const apiKey = req.headers.get("x-api-key");
  const storeKey = await getStoreByApiKey(apiKey, slug);
  if (!storeKey) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });

  try {
    const snap = await db.collection("stores").doc(slug).collection("discounts").orderBy("createdAt", "desc").get();
    const discounts = snap.docs.map(d => {
      const data = d.data();
      return {
        code: d.id,
        type: data.type,
        value: data.value,
        active: data.active !== false,
        usageLimit: data.usageLimit ?? null,
        usageCount: data.usageCount || 0,
        minOrderAmount: data.minOrderAmount ?? null,
        expiresAt: data.expiresAt?.toDate?.()?.toISOString() || null,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
      };
    });
    return NextResponse.json({ success: true, discounts });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST /api/store/[slug]/discounts — create a discount code (owner only)
// body: { code, type: 'percent'|'fixed', value, usageLimit?, minOrderAmount?, expiresAt? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const apiKey = req.headers.get("x-api-key");
  const storeKey = await getStoreByApiKey(apiKey, slug);
  if (!storeKey) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });

  try {
    const body = await req.json();
    const code = String(body.code || "").trim().toUpperCase();
    const type = body.type === "fixed" ? "fixed" : "percent";
    const value = Number(body.value);

    if (!code) return NextResponse.json({ error: "Code is required" }, { status: 400 });
    if (!value || value <= 0) return NextResponse.json({ error: "Valid value is required" }, { status: 400 });
    if (type === "percent" && value > 100) return NextResponse.json({ error: "Percent discount cannot exceed 100" }, { status: 400 });

    const ref = db.collection("stores").doc(slug).collection("discounts").doc(code);
    const existing = await ref.get();
    if (existing.exists) return NextResponse.json({ error: "A discount with this code already exists" }, { status: 409 });

    await ref.set({
      type,
      value,
      active: true,
      usageLimit: body.usageLimit ? Number(body.usageLimit) : null,
      usageCount: 0,
      minOrderAmount: body.minOrderAmount ? Number(body.minOrderAmount) : null,
      expiresAt: body.expiresAt ? Timestamp.fromDate(new Date(body.expiresAt)) : null,
      createdAt: Timestamp.now(),
    });

    return NextResponse.json({ success: true, code });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
