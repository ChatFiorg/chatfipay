import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { normalizeEmail } from "@/lib/staffAuth";

async function getStoreByApiKey(apiKey: string | null, slug: string) {
  if (!apiKey) return null;
  const snap = await db.collection("storeKeys").doc(slug).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  if (data.apiKey !== apiKey) return null;
  return data;
}

// PATCH /api/store/[slug]/staff/[email] — update permissions (owner only)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string; email: string }> }) {
  const { slug, email: rawEmail } = await params;
  const email = normalizeEmail(decodeURIComponent(rawEmail));
  const apiKey = req.headers.get("x-api-key");
  const storeKey = await getStoreByApiKey(apiKey, slug);
  if (!storeKey) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  if (!email) return NextResponse.json({ error: "Invalid email" }, { status: 400 });

  try {
    const body = await req.json();
    const permissions = {
      orders: !!body.permissions?.orders,
      products: !!body.permissions?.products,
    };
    const ref = db.collection("stores").doc(slug).collection("staff").doc(email);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    await ref.update({ permissions });
    return NextResponse.json({ success: true, email, permissions });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE /api/store/[slug]/staff/[email] — revoke staff access (owner only)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string; email: string }> }) {
  const { slug, email: rawEmail } = await params;
  const email = normalizeEmail(decodeURIComponent(rawEmail));
  const apiKey = req.headers.get("x-api-key");
  const storeKey = await getStoreByApiKey(apiKey, slug);
  if (!storeKey) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  if (!email) return NextResponse.json({ error: "Invalid email" }, { status: 400 });

  try {
    await db.collection("stores").doc(slug).collection("staff").doc(email).delete();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
