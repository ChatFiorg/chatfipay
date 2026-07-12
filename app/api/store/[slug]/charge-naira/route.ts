import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import crypto from "crypto";
import { notifyOrderEvent } from "@/lib/orderNotifications";
import { releaseExpiredReservations, reserveStockForOrder, RESERVATION_WINDOW_MS } from "@/lib/inventoryReservation";
import { Timestamp as TimestampType } from "firebase-admin/firestore";
import { applyDiscountCode } from "@/lib/discounts";
import { resolveOrderPricing } from "@/lib/orderPricing";
import { resolveLoyaltyRedemption } from "@/lib/loyalty";
import { applyGiftCard } from "@/lib/giftCards";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY as string;
const PAYSTACK_BASE_URL = "https://api.paystack.co";

interface ResolvedLine {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  basePrice: number;
  addOns: { id: string; name: string; price: number }[];
  stockDeductions: { productId: string; quantity: number; variantKey?: string }[];
  selectedVariant: string | null;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;

  try {
    const body = await req.json();
    const { buyerEmail, buyerPhone, buyerName, buyerWallet, buyerDelivery, buyerNote, callbackUrl, discountCode, buyerToken, giftCardCode, shippingRateId, shippingAddress } = body;
    const deliveryMethod = body.deliveryMethod === "pickup" ? "pickup" : "delivery";
    const redeemPoints = Math.max(0, Math.floor(Number(body.redeemPoints) || 0));

    // Normalize both request shapes into one line-item list: the classic
    // single-product body (productId/quantity/selectedAddOns) used by the
    // "Clean" storefront template, and the cart body (items: [{productId,
    // quantity}]) used by the Combo/MiniStore templates' multi-item cart.
    const rawItems: { productId: string; quantity: number; selectedAddOns?: string[]; selectedVariant?: string }[] =
      Array.isArray(body.items) && body.items.length > 0
        ? body.items
        : body.productId
          ? [{ productId: body.productId, quantity: body.quantity, selectedAddOns: body.selectedAddOns, selectedVariant: body.selectedVariant }]
          : [];

    if (rawItems.length === 0) return NextResponse.json({ error: "Missing productId" }, { status: 400 });
    if (!buyerEmail) return NextResponse.json({ error: "Missing buyerEmail" }, { status: 400 });

    if (!PAYSTACK_SECRET_KEY) {
      console.error("Missing PAYSTACK_SECRET_KEY env var");
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    const storeSnap = await db.collection("stores").doc(slug).get();
    if (!storeSnap.exists) return NextResponse.json({ error: "Store not found" }, { status: 404 });
    const store = storeSnap.data()!;
    const allowedPaymentMethod = store.contact?.paymentMethod || "both";
    if (allowedPaymentMethod === "usdc") {
      return NextResponse.json({ error: "This store only accepts USDC payments" }, { status: 400 });
    }
    if (!store.live) return NextResponse.json({ error: "Store is offline" }, { status: 403 });

    if (deliveryMethod === "pickup" && !store.shipping?.pickupEnabled) {
      return NextResponse.json({ error: "Pickup is not available for this store" }, { status: 400 });
    }

    const locationId: string | null = deliveryMethod === "pickup"
      ? (store.shipping?.pickupLocationId || null)
      : (store.shipping?.primaryDeliveryLocationId || null);

    if (!store.ownerWallet) {
      return NextResponse.json({ error: "Store has no owner wallet" }, { status: 400 });
    }

    const payoutAccount = store.payoutAccount || {};
    if (!payoutAccount.subaccountCode || !payoutAccount.verified) {
      return NextResponse.json(
        { error: "Merchant has not connected a payout bank account yet" },
        { status: 400 }
      );
    }
    const subaccountCode = payoutAccount.subaccountCode;

    // Resolve, validate, and price each line item independently (MoQ/MaxOQ,
    // stock, bundles, add-ons all respected per line), then sum for the
    // cart-wide subtotal.
    const resolvedLines: ResolvedLine[] = [];
    for (const raw of rawItems) {
      const quantity = Math.max(1, Math.floor(Number(raw.quantity) || 1));
      const productSnap = await db.collection("stores").doc(slug).collection("products").doc(raw.productId).get();
      if (!productSnap.exists) return NextResponse.json({ error: "One of the products in your order was not found" }, { status: 404 });
      const product = productSnap.data()!;
      if (!product.active) return NextResponse.json({ error: `"${product.name}" is currently unavailable` }, { status: 400 });

      const minOrderQty = product.minOrderQty || 1;
      const maxOrderQty = product.maxOrderQty || Infinity;
      if (quantity < minOrderQty) {
        return NextResponse.json({ error: `Minimum order quantity for "${product.name}" is ${minOrderQty}` }, { status: 400 });
      }
      if (quantity > maxOrderQty) {
        return NextResponse.json({ error: `Maximum order quantity for "${product.name}" is ${maxOrderQty}` }, { status: 400 });
      }
      const hasVariants = Array.isArray(product.variantGroups) && product.variantGroups.length > 0;
      if (!hasVariants && product.type !== "bundle" && product.stock != null && quantity > product.stock) {
        return NextResponse.json({ error: `Only ${product.stock} of "${product.name}" left in stock` }, { status: 400 });
      }

      const pricingResult = await resolveOrderPricing(slug, { ...product, id: raw.productId }, quantity, raw.selectedAddOns, raw.selectedVariant);
      if ("error" in pricingResult) {
        return NextResponse.json({ error: pricingResult.error }, { status: 400 });
      }

      resolvedLines.push({
        productId: raw.productId,
        productName: product.name,
        quantity,
        unitPrice: pricingResult.unitPrice,
        basePrice: product.price,
        addOns: pricingResult.addOnsSelected,
        stockDeductions: pricingResult.stockDeductions,
        selectedVariant: raw.selectedVariant || null,
      });
    }

    const subtotal = resolvedLines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    const combinedStockDeductions = resolvedLines.flatMap(line => line.stockDeductions);
    const totalQuantity = resolvedLines.reduce((sum, line) => sum + line.quantity, 0);

    const discountResult = await applyDiscountCode(slug, discountCode, subtotal);
    if ("error" in discountResult) {
      return NextResponse.json({ error: discountResult.error }, { status: 400 });
    }
    const { finalAmount: discountedSubtotal, discountAmount, code: appliedDiscountCode } = discountResult;

    const loyaltyResult = await resolveLoyaltyRedemption(slug, store.loyalty, buyerToken, buyerEmail, redeemPoints, discountedSubtotal);
    if ("error" in loyaltyResult) {
      return NextResponse.json({ error: loyaltyResult.error }, { status: 400 });
    }
    const { redeemedPoints, redemptionValue } = loyaltyResult;

    const shippingConfig = store.shipping || { flatFee: 0, freeThreshold: null, pickupEnabled: false };
    const subtotalAfterLoyalty = discountedSubtotal - redemptionValue;
    let shippingFee = 0;
    if (deliveryMethod === "delivery") {
      const freeThreshold = shippingConfig.freeThreshold;
      shippingFee = freeThreshold != null && subtotalAfterLoyalty >= freeThreshold ? 0 : (shippingConfig.flatFee || 0);
    }

    const totalBeforeGiftCard = subtotalAfterLoyalty + shippingFee;
    const giftCardResult = await applyGiftCard(slug, giftCardCode, totalBeforeGiftCard);
    if ("error" in giftCardResult) {
      return NextResponse.json({ error: giftCardResult.error }, { status: 400 });
    }
    const { code: appliedGiftCardCode, amountUsed: giftCardAmountUsed } = giftCardResult;

    const finalAmount = Math.max(totalBeforeGiftCard - giftCardAmountUsed, 0);

    const orderId = crypto.randomBytes(8).toString("hex");
    await releaseExpiredReservations(slug);
    const reserveInventoryEnabled = !!store.globalSettings?.inventory?.reserveInventory;
    const now = Timestamp.now();
    const reference = `chatfi_${orderId}_${Date.now()}`;
    const amountKobo = Math.round(finalAmount * 100);

    // Top-level productName/quantity/unitPrice mirror the first line item
    // (or a summary label for multi-item carts) so older code that reads
    // those single fields (invoices, CSV export, abandoned-cart emails)
    // still shows something sensible; `items` carries the full detail.
    const summaryName = resolvedLines.length === 1
      ? resolvedLines[0].productName
      : `${resolvedLines[0].productName} +${resolvedLines.length - 1} more`;

    const orderDoc = {
      id: orderId,
      items: resolvedLines,
      productId: resolvedLines[0].productId,
      productName: summaryName,
      quantity: totalQuantity,
      unitPrice: subtotal / totalQuantity,
      buyerWallet: buyerWallet || null,
      buyerEmail,
      buyerPhone: buyerPhone || null,
      buyerName: buyerName || null,
      buyerDelivery: buyerDelivery || null,
      buyerNote: buyerNote || null,
      deliveryMethod,
      locationId,
      shippingFee,
      shippingRateId: shippingRateId || null,
      shippingAddress: shippingAddress || null,
      shippingStatus: shippingRateId ? "pending" : null,
      pointsRedeemed: redeemedPoints,
      loyaltyDiscount: redemptionValue,
      giftCardCode: appliedGiftCardCode,
      giftCardAmountUsed,
      stockDeductions: combinedStockDeductions,
      amount: finalAmount,
      subtotal,
      discountCode: appliedDiscountCode,
      discountAmount,
      paymentMethod: "naira",
      paystackRef: reference,
      status: "pending",
      paymentStatus: "pending",
      createdAt: now,
      paidAt: null,
      stockReserved: reserveInventoryEnabled,
      reservationExpiresAt: reserveInventoryEnabled ? TimestampType.fromMillis(now.toMillis() + RESERVATION_WINDOW_MS) : null,
    };

    if (amountKobo <= 0) {
      await db.collection("stores").doc(slug).collection("orders").doc(orderId).set({ ...orderDoc, status: "pending", amount: 0 });
      if (reserveInventoryEnabled) {
        await reserveStockForOrder(slug, combinedStockDeductions, locationId).catch(e => console.error("reserveStockForOrder failed:", e));
      }
      await notifyOrderEvent(slug, orderId, "created").catch(e => console.error("notifyOrderEvent(created) failed:", e));
      await fetch(`https://pay.chatfi.pro/api/store/${slug}/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      }).catch(e => console.error("Failed to auto-confirm zero-amount order:", e));
      await db.collection("storeKeys").doc(slug).update({ lastUsed: now });
      return NextResponse.json({
        success: true, orderId, fullyPaidByGiftCard: true,
        items: resolvedLines, giftCardAmountUsed, amountNgn: 0, status: "paid",
      });
    }

    await db.collection("stores").doc(slug).collection("orders").doc(orderId).set(orderDoc);

    if (reserveInventoryEnabled) {
      await reserveStockForOrder(slug, combinedStockDeductions, locationId).catch(e => console.error("reserveStockForOrder failed:", e));
    }

    await notifyOrderEvent(slug, orderId, "created").catch(e => console.error("notifyOrderEvent(created) failed:", e));

    const initRes = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: buyerEmail,
        amount: amountKobo,
        reference,
        subaccount: subaccountCode,
        callback_url: callbackUrl || undefined,
        metadata: { slug, orderId },
      }),
    });
    const initData = await initRes.json();

    if (!initRes.ok || !initData.status) {
      await db.collection("stores").doc(slug).collection("orders").doc(orderId).set(
        { status: "failed", paymentStatus: "failed" },
        { merge: true }
      );
      return NextResponse.json(
        { error: initData.message || "Could not initialize payment" },
        { status: 400 }
      );
    }

    await db.collection("storeKeys").doc(slug).update({ lastUsed: now });

    const response = NextResponse.json({
      success: true,
      orderId,
      authorizationUrl: initData.data.authorization_url,
      accessCode: initData.data.access_code,
      reference,
      items: resolvedLines,
      subtotal,
      deliveryMethod,
      locationId,
      shippingFee,
      pointsRedeemed: redeemedPoints,
      loyaltyDiscount: redemptionValue,
      giftCardAmountUsed,
      amountNgn: finalAmount,
      discountAmount,
      discountCode: appliedDiscountCode,
      status: "pending",
    });
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type");
    return response;
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
