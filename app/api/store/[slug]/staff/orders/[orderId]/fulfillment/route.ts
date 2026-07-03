import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { resolveStaffToken } from "@/lib/staffAuth";

const VALID_STAGES = ["processing", "shipped", "delivered"];

// PATCH /api/store/[slug]/staff/orders/[orderId]/fulfillment
// Authorization: Bearer <staff token>. Requires permissions.orders.
// body: { fulfillmentStatus: 'processing' | 'shipped' | 'delivered' }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; orderId: string }> }
) {
  const { slug, orderId } = await params;
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const payload = await resolveStaffToken(token, slug);

  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!payload.permissions.orders) {
    return NextResponse.json({ error: "You don\'t have permission to update orders" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { fulfillmentStatus } = body;
    if (!VALID_STAGES.includes(fulfillmentStatus)) {
      return NextResponse.json({ error: "Invalid fulfillment status" }, { status: 400 });
    }

    const orderRef = db.collection("stores").doc(slug).collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const order = orderSnap.data()!;
    if (order.status !== "paid") {
      return NextResponse.json({ error: "Order must be paid before updating fulfillment" }, { status: 400 });
    }

    const now = Timestamp.now();
    await orderRef.set({
      fulfillmentStatus,
      [`fulfillmentTimestamps.${fulfillmentStatus}`]: now,
      lastUpdatedByStaff: payload.email,
    }, { merge: true });

    return NextResponse.json({ success: true, fulfillmentStatus });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
