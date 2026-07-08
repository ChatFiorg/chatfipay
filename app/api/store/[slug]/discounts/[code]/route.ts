import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { verifyStoreAccess } from "@/lib/storeAccess";

// PATCH /api/store/[slug]/discounts/[code] — toggle active state (owner only)
// body: { active: boolean }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; code: string }> }
) {
  const { slug, code } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const ref = db.collection("stores").doc(slug).collection("discounts").doc(decodeURIComponent(code).toUpperCase());
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Discount not found" }, { status: 404 });

    await ref.set({ active: !!body.active }, { merge: true });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE /api/store/[slug]/discounts/[code] — delete a discount code (owner only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; code: string }> }
) {
  const { slug, code } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await db.collection("stores").doc(slug).collection("discounts").doc(decodeURIComponent(code).toUpperCase()).delete();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
