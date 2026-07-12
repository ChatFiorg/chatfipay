import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { verifyStoreAccess } from "@/lib/storeAccess";

// PATCH /api/store/[slug]/locations/[locationId] — update a location (owner only)
// body: { name?, address?, active? }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; locationId: string }> }
) {
  const { slug, locationId } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const update: any = {};
    if (body.name !== undefined) update.name = String(body.name).trim();
    if (body.address !== undefined) update.address = body.address ? String(body.address).trim() : null;
    if (body.active !== undefined) update.active = !!body.active;

    const ref = db.collection("stores").doc(slug).collection("locations").doc(locationId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Location not found" }, { status: 404 });

    await ref.update(update);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}

// DELETE /api/store/[slug]/locations/[locationId] — remove a location (owner only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; locationId: string }> }
) {
  const { slug, locationId } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const ref = db.collection("stores").doc(slug).collection("locations").doc(locationId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Location not found" }, { status: 404 });

    await ref.delete();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
