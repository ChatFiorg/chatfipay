import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { resolveStaffOrOwner } from "@/lib/staffOrOwnerAuth";
import { notifyOrderEvent } from "@/lib/orderNotifications";
import { applyLocationDelta } from "@/lib/inventoryReservation";

// PATCH /api/store/[slug]/staff/orders/[orderId]/cancel
// Authorization: Bearer <staff token OR owner token>. Requires permissions.orders.
// Cancels a pending or paid order. If the order was paid, restores any stock
// that was deducted when the payment webhook fired, so cancelling doesn't
// leave products under-counted.
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
    const orderRef = db.collection("stores").doc(slug).collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const order = orderSnap.data()!;

    if (order.status === "cancelled") {
      return NextResponse.json({ success: true, orderId, status: "cancelled", alreadyProcessed: true });
    }

    const now = Timestamp.now();

    // Stock needs restoring if the order was paid (webhook already deducted
    // it) OR if it was still pending but had inventory reserved at checkout
    // (Reserve Inventory setting). Mirrors the deduction logic in
    // webhook/route.ts and charge/charge-naira routes, run in reverse.
    const shouldRestoreStock = order.status === "paid" || order.stockReserved === true;
    if (shouldRestoreStock) {
      const stockDeductions: { productId: string; quantity: number; variantKey?: string }[] =
        Array.isArray(order.stockDeductions) && order.stockDeductions.length > 0
          ? order.stockDeductions
          : Array.isArray(order.items) && order.items.length > 0
            ? order.items.map((it: any) => ({ productId: it.productId, quantity: it.quantity || 1 }))
            : order.productId
              ? [{ productId: order.productId, quantity: order.quantity || 1 }]
              : [];

      for (const item of stockDeductions) {
        if (!item.productId) continue;
        const productRef = db.collection("stores").doc(slug).collection("products").doc(item.productId);
        const productSnap = await productRef.get();
        if (!productSnap.exists) continue;

        const product = productSnap.data()!;

        if (item.variantKey && product.variantStock && product.variantStock[item.variantKey]) {
          const combo = product.variantStock[item.variantKey];
          const update: any = { unitsSold: FieldValue.increment(-item.quantity) };
          if (combo.stock != null) {
            const restoredStock = combo.stock + item.quantity;
            update.variantStock = { ...product.variantStock, [item.variantKey]: { ...combo, stock: restoredStock } };
          }
          await productRef.update(update);
          continue;
        }

        if (order.locationId) {
          const locationUpdate = applyLocationDelta(product, order.locationId, item.quantity);
          if (locationUpdate) {
            await productRef.update({ ...locationUpdate, unitsSold: FieldValue.increment(-item.quantity) });
            continue;
          }
        }

        if (product.stock == null) {
          await productRef.update({ unitsSold: FieldValue.increment(-item.quantity) });
          continue; // unlimited stock, nothing to restore
        }

        await productRef.update({
          stock: FieldValue.increment(item.quantity),
          unitsSold: FieldValue.increment(-item.quantity),
          active: true,
        });
      }
    }

    await orderRef.set({
      status: "cancelled",
      cancelledAt: now,
      stockReserved: false,
      lastUpdatedByStaff: auth.actor,
    }, { merge: true });

    await notifyOrderEvent(slug, orderId, "cancelled").catch(e => console.error("notifyOrderEvent(cancelled) failed:", e));

    return NextResponse.json({ success: true, orderId, status: "cancelled" });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
