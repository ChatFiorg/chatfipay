import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { verifyStoreAccess } from "@/lib/storeAccess";

// PATCH /api/store/[slug]/staff/[email] — update permissions/location for an existing staff member (owner only)
// body: { permissions?: { orders, products, analytics }, locationId?: string | null }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; email: string }> }
) {
  const { slug, email } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const decodedEmail = decodeURIComponent(email);
    const body = await req.json();
    const update: any = {};
    if (body.permissions) {
      update.permissions = {
        orders: !!body.permissions.orders,
        products: !!body.permissions.products,
        analytics: !!body.permissions.analytics,
      };
    }
    if (body.locationId !== undefined) {
      update.locationId = body.locationId || null;
    }

    const ref = db.collection("stores").doc(slug).collection("staff").doc(decodedEmail);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Staff member not found" }, { status: 404 });

    await ref.update(update);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE /api/store/[slug]/staff/[email] — revoke a staff member (owner only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; email: string }> }
) {
  const { slug, email } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const decodedEmail = decodeURIComponent(email);
    await db.collection("stores").doc(slug).collection("staff").doc(decodedEmail).delete();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
