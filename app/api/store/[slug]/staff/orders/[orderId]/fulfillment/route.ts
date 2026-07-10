import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { resolveStaffOrOwner } from "@/lib/staffOrOwnerAuth";
import { notifyOrderEvent } from "@/lib/orderNotifications";

const VALID_STAGES = ["processing", "packed", "awaiting_shipping", "shipped", "delivered", "picked_up", "returned"];

// PATCH /api/store/[slug]/staff/orders/[orderId]/fulfillment
// Authorization: Bearer <staff token OR owner token>. Requires permissions.orders.
// body: { fulfillmentStatus: 'processing' | 'shipped' | 'delivered' }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; orderId: string }> }
) {
  const { slug, orderId } = await params;
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const auth = await resolveStaffOrOwner(token, slug);

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!auth.permissions.orders) {
    return NextResponse.json({ error: "You don't have permission to update orders" }, { status: 403 });
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
      lastUpdatedByStaff: auth.actor,
    }, { merge: true });

    const STAGE_EVENT_MAP: Record<string, string> = {
      shipped: "shippedDelivered",
      delivered: "shippedDelivered",
      packed: "orderPacked",
      awaiting_shipping: "awaitingShipping",
      picked_up: "orderPickedUp",
      returned: "orderReturned",
    };
    const eventName = STAGE_EVENT_MAP[fulfillmentStatus];
    if (eventName) {
      await notifyOrderEvent(slug, orderId, eventName as any).catch(e => console.error(`notifyOrderEvent(${eventName}) failed:`, e));
    }

    return NextResponse.json({ success: true, fulfillmentStatus });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
