import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

async function getStoreByApiKey(apiKey: string | null, slug: string) {
  if (!apiKey) return null;
  const snap = await db.collection("storeKeys").doc(slug).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  if (data.apiKey !== apiKey) return null;
  return data;
}

// PATCH /api/store/[slug]/giftcards/[code] — toggle active state (owner only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; code: string }> }
) {
  const { slug, code } = await params;
  const apiKey = req.headers.get("x-api-key");
  const storeKey = await getStoreByApiKey(apiKey, slug);
  if (!storeKey) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });

  try {
    const body = await req.json();
    const ref = db.collection("stores").doc(slug).collection("giftCards").doc(decodeURIComponent(code).toUpperCase());
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Gift card not found" }, { status: 404 });

    await ref.set({ active: !!body.active }, { merge: true });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE /api/store/[slug]/giftcards/[code] — delete a gift card (owner only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; code: string }> }
) {
  const { slug, code } = await params;
  const apiKey = req.headers.get("x-api-key");
  const storeKey = await getStoreByApiKey(apiKey, slug);
  if (!storeKey) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });

  try {
    await db.collection("stores").doc(slug).collection("giftCards").doc(decodeURIComponent(code).toUpperCase()).delete();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
