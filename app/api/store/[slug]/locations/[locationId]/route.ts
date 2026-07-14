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
    if (body.line2 !== undefined) update.line2 = body.line2 ? String(body.line2).trim() : null;
    if (body.active !== undefined) update.active = !!body.active;
    if (body.firstName !== undefined) update.firstName = body.firstName ? String(body.firstName).trim() : null;
    if (body.lastName !== undefined) update.lastName = body.lastName ? String(body.lastName).trim() : null;
    if (body.email !== undefined) update.email = body.email ? String(body.email).trim() : null;
    if (body.phone !== undefined) update.phone = body.phone ? String(body.phone).trim() : null;
    if (body.city !== undefined) update.city = body.city ? String(body.city).trim() : null;
    if (body.state !== undefined) update.state = body.state ? String(body.state).trim() : null;
    if (body.zip !== undefined) update.zip = body.zip ? String(body.zip).trim() : null;
    if (body.terminalAddressId !== undefined) update.terminalAddressId = body.terminalAddressId || null;

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
