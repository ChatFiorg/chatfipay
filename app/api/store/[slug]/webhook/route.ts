import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { settleLoyaltyForOrder } from "@/lib/loyalty";
import { arrangeTerminalPickup } from "@/lib/terminalAfrica";
import { notifyOrderEvent } from "@/lib/orderNotifications";
import { notifyNewCustomer } from "@/lib/campaignEmails";
import { applyLocationDelta } from "@/lib/inventoryReservation";

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) digits = "234" + digits.slice(1);
  else if (!digits.startsWith("234")) digits = "234" + digits;
  return digits;
}

function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  return trimmed || null;
}

// POST /api/store/[slug]/webhook — called by ChatFi Pay on payment confirmed
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const body = await req.json();
    const { orderId, txSignature, receivedAmount, payerWallet } = body;

    if (!orderId) return NextResponse.json({ error: "Missing orderId" }, { status: 400 });

    const orderRef = db.collection("stores").doc(slug).collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const order = orderSnap.data()!;
    const now = Timestamp.now();

    // Avoid double-processing if the webhook somehow fires twice for the same order
    if (order.status === "paid") {
      return NextResponse.json({ success: true, orderId, status: "paid", alreadyProcessed: true });
    }

    const normalizedPhone = normalizePhone(order.buyerPhone);
    const normalizedEmail = normalizeEmail(order.buyerEmail);
    const customerKey = normalizedPhone || normalizedEmail;

    // Crypto (USDC) settles instantly, so mark it disbursed the moment payment
    // is confirmed. Naira orders stay disbursed:false (set at order creation)
    // until the settlement-checking cron confirms Paystack has actually paid
    // out the merchant's subaccount.
    const isCrypto = order.paymentMethod !== "naira";

    await orderRef.update({
      status: "paid",
      txSignature: txSignature || null,
      receivedAmount: receivedAmount || null,
      payerWallet: payerWallet || null,
      paidAt: now,
      buyerPhoneNormalized: normalizedPhone,
      buyerEmailNormalized: normalizedEmail,
      customerKey,
      ...(isCrypto ? { disbursed: true, disbursedAt: now } : {}),
    });

    await notifyOrderEvent(slug, orderId, "confirmed").catch(e => console.error("notifyOrderEvent(confirmed) failed:", e));

    if (order.paymentRef) {
      await db.collection("pay_links").doc(order.paymentRef).update({
        status: "completed",
        paidAt: now,
        txSignature: txSignature || null,
        receivedAmount: receivedAmount || null,
      });
    }

    // Upsert the customer record (CRM) — keyed on phone when available, else email
    if (customerKey) {
      const custRef = db.collection("stores").doc(slug).collection("customers").doc(customerKey);
      const custSnap = await custRef.get();
      const custUpdate: any = {
        phone: order.buyerPhone || null,
        name: order.buyerName || null,
        email: order.buyerEmail || null,
        address: order.buyerAddress || order.buyerDelivery || null,
        totalSpent: FieldValue.increment(order.amount || 0),
        orderCount: FieldValue.increment(1),
        lastOrderAt: now,
      };
      const isNewCustomer = !custSnap.exists;
      if (isNewCustomer) custUpdate.firstOrderAt = now;
      await custRef.set(custUpdate, { merge: true });
      if (isNewCustomer) {
        await notifyNewCustomer(slug, order.buyerEmail, order.buyerName).catch(e => console.error("notifyNewCustomer failed:", e));
      }
    }

    // Update store-level stats (analytics)
    const dayKey = now.toDate().toISOString().slice(0, 10); // YYYY-MM-DD
    await db.collection("stores").doc(slug).collection("stats").doc("summary").set({
      totalRevenue: FieldValue.increment(order.amount || 0),
      totalOrders: FieldValue.increment(1),
    }, { merge: true });
    await db.collection("stores").doc(slug).collection("dailyStats").doc(dayKey).set({
      date: dayKey,
      revenue: FieldValue.increment(order.amount || 0),
      orders: FieldValue.increment(1),
    }, { merge: true });

    // Prefer the explicit stockDeductions computed at checkout (handles
    // bundles, where stock lives on child products rather than the bundle
    // itself). Falls back to the older `items`/`productId` derivation for
    // orders created before this field existed, so nothing breaks.
    const stockDeductions: { productId: string; quantity: number; variantKey?: string }[] =
      Array.isArray(order.stockDeductions) && order.stockDeductions.length > 0
        ? order.stockDeductions
        : Array.isArray(order.items) && order.items.length > 0
          ? order.items.map((it: any) => ({ productId: it.productId, quantity: it.quantity || 1 }))
          : order.productId
            ? [{ productId: order.productId, quantity: order.quantity || 1 }]
            : [];

    if (!order.stockReserved) {
    for (const item of stockDeductions) {
      if (!item.productId) continue;
      const productRef = db.collection("stores").doc(slug).collection("products").doc(item.productId);
      const productSnap = await productRef.get();
      if (!productSnap.exists) continue;

      const product = productSnap.data()!;

      // Variant stock lives in a nested map keyed by combo (e.g. "Black / S"),
      // not the product's top-level `stock` field. Read-modify-write the whole
      // map rather than a dotted field path, since combo keys are free text
      // and could contain characters that break Firestore path syntax.
      if (item.variantKey && product.variantStock && product.variantStock[item.variantKey]) {
        const combo = product.variantStock[item.variantKey];
        const update: any = { unitsSold: FieldValue.increment(item.quantity) };
        if (combo.stock != null) {
          const newComboStock = Math.max(0, combo.stock - item.quantity);
          update.variantStock = { ...product.variantStock, [item.variantKey]: { ...combo, stock: newComboStock } };
        }
        await productRef.update(update);
        continue;
      }

      if (order.locationId) {
        const locationUpdate = applyLocationDelta(product, order.locationId, -item.quantity);
        if (locationUpdate) {
          await productRef.update({ ...locationUpdate, unitsSold: FieldValue.increment(item.quantity) });
          continue;
        }
      }

      if (product.stock == null) {
        await productRef.update({ unitsSold: FieldValue.increment(item.quantity) });
        continue; // unlimited stock, nothing to deduct
      }

      const newStock = Math.max(0, product.stock - item.quantity);
      const update: any = { stock: FieldValue.increment(-Math.min(item.quantity, product.stock)), unitsSold: FieldValue.increment(item.quantity) };
      if (newStock === 0) update.active = false;
      await productRef.update(update);
    }
  } else {
    await orderRef.update({ stockReserved: false });
  }

    // Book the shipment with Terminal Africa if the customer selected a
    // courier rate at checkout and the store has automated shipping on.
    // Non-fatal: a booking failure shouldn't block payment confirmation —
    // the merchant can still see the order and arrange delivery manually.
    if (order.shippingRateId) {
      try {
        const storeSnap = await db.collection("stores").doc(slug).get();
        const automated = storeSnap.exists ? storeSnap.data()!.shipping?.automated : null;
        if (automated?.enabled) {
          const keySnap = await db.collection("storeKeys").doc(slug).get();
          const terminalApiKey = keySnap.exists ? keySnap.data()!.terminalApiKey : null;
          if (terminalApiKey) {
            const shipment = await arrangeTerminalPickup(terminalApiKey, order.shippingRateId);
            await orderRef.update({
              shipmentId: shipment.shipment_id || shipment.id || null,
              trackingCode: shipment.tracking_code || shipment.trackingCode || null,
              trackingUrl: shipment.tracking_url || null,
              shippingStatus: "booked",
              shippingBookedAt: now,
            });
          }
        }
      } catch (e) {
        console.error("Terminal shipment booking failed (non-fatal):", e);
        await orderRef.update({ shippingStatus: "booking_failed" }).catch(() => {});
      }
    }

    // Settle loyalty points: credit points earned on this order, debit any
    // points that were redeemed at checkout. No-op if loyalty isn't enabled
    // or the buyer didn't provide an email.
    try {
      const storeSnap = await db.collection("stores").doc(slug).get();
      const loyaltyConfig = storeSnap.exists ? storeSnap.data()!.loyalty : null;
      await settleLoyaltyForOrder(slug, order.buyerEmail, order.amount || 0, order.pointsRedeemed || 0, loyaltyConfig);
    } catch (e) {
      console.error("Loyalty settlement failed (non-fatal):", e);
    }

    return NextResponse.json({ success: true, orderId, status: "paid" });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
