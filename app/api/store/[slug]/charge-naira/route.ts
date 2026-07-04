import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import crypto from "crypto";
import { applyDiscountCode } from "@/lib/discounts";
import { resolveOrderPricing } from "@/lib/orderPricing";
import { resolveLoyaltyRedemption } from "@/lib/loyalty";
import { applyGiftCard } from "@/lib/giftCards";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY as string;
const PAYSTACK_BASE_URL = "https://api.paystack.co";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;

  try {
    const body = await req.json();
    const { productId, buyerEmail, buyerPhone, buyerName, buyerWallet, buyerDelivery, callbackUrl, discountCode, selectedAddOns, buyerToken, giftCardCode } = body;
    const quantity = Math.max(1, Math.floor(Number(body.quantity) || 1));
    const deliveryMethod = body.deliveryMethod === "pickup" ? "pickup" : "delivery";
    const redeemPoints = Math.max(0, Math.floor(Number(body.redeemPoints) || 0));

    if (!productId) return NextResponse.json({ error: "Missing productId" }, { status: 400 });
    if (!buyerEmail) return NextResponse.json({ error: "Missing buyerEmail" }, { status: 400 });

    if (!PAYSTACK_SECRET_KEY) {
      console.error("Missing PAYSTACK_SECRET_KEY env var");
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    const storeSnap = await db.collection("stores").doc(slug).get();
    if (!storeSnap.exists) return NextResponse.json({ error: "Store not found" }, { status: 404 });
    const store = storeSnap.data()!;
    if (!store.live) return NextResponse.json({ error: "Store is offline" }, { status: 403 });

    if (deliveryMethod === "pickup" && !store.shipping?.pickupEnabled) {
      return NextResponse.json({ error: "Pickup is not available for this store" }, { status: 400 });
    }

    const productSnap = await db.collection("stores").doc(slug).collection("products").doc(productId).get();
    if (!productSnap.exists) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    const product = productSnap.data()!;
    if (!product.active) return NextResponse.json({ error: "Product unavailable" }, { status: 400 });

    const minOrderQty = product.minOrderQty || 1;
    const maxOrderQty = product.maxOrderQty || Infinity;
    if (quantity < minOrderQty) {
      return NextResponse.json({ error: `Minimum order quantity for this product is ${minOrderQty}` }, { status: 400 });
    }
    if (quantity > maxOrderQty) {
      return NextResponse.json({ error: `Maximum order quantity for this product is ${maxOrderQty}` }, { status: 400 });
    }
    if (product.type !== "bundle" && product.stock != null && quantity > product.stock) {
      return NextResponse.json({ error: `Only ${product.stock} left in stock` }, { status: 400 });
    }

    if (!store.ownerWallet) {
      return NextResponse.json({ error: "Store has no owner wallet" }, { status: 400 });
    }

    const merchantSnap = await db.collection("merchants").doc(store.ownerWallet).get();
    if (!merchantSnap.exists || !merchantSnap.data()!.paystackSubaccountCode) {
      return NextResponse.json(
        { error: "Merchant has not connected a payout bank account yet" },
        { status: 400 }
      );
    }
    const subaccountCode = merchantSnap.data()!.paystackSubaccountCode;

    const pricingResult = await resolveOrderPricing(slug, { ...product, id: productId }, quantity, selectedAddOns);
    if ("error" in pricingResult) {
      return NextResponse.json({ error: pricingResult.error }, { status: 400 });
    }
    const { unitPrice, addOnsSelected, stockDeductions } = pricingResult;

    const subtotal = unitPrice * quantity;
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
    const now = Timestamp.now();
    const reference = `chatfi_${orderId}_${Date.now()}`;
    const amountKobo = Math.round(finalAmount * 100);

    // Paystack requires a positive amount — a fully gift-card-covered order
    // can't be initialized as a normal transaction. Mark it paid directly.
    if (amountKobo <= 0) {
      await db.collection("stores").doc(slug).collection("orders").doc(orderId).set({
        id: orderId,
        productId,
        productName: product.name,
        quantity,
        unitPrice,
        basePrice: product.price,
        addOns: addOnsSelected,
        stockDeductions,
        buyerWallet: buyerWallet || null,
        buyerEmail,
        buyerPhone: buyerPhone || null,
        buyerName: buyerName || null,
        buyerDelivery: buyerDelivery || null,
        deliveryMethod,
        shippingFee,
        pointsRedeemed: redeemedPoints,
        loyaltyDiscount: redemptionValue,
        giftCardCode: appliedGiftCardCode,
        giftCardAmountUsed,
        amount: 0,
        subtotal,
        discountCode: appliedDiscountCode,
        discountAmount,
        paymentMethod: "giftcard",
        status: "pending",
        paymentStatus: "pending",
        createdAt: now,
        paidAt: null,
      });

      // Confirm immediately via the same webhook path used for real payments,
      // so stock deduction, CRM, and loyalty earn logic all run identically.
      await fetch(`https://pay.chatfi.pro/api/store/${slug}/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      }).catch(e => console.error("Failed to auto-confirm zero-amount order:", e));

      await db.collection("storeKeys").doc(slug).update({ lastUsed: now });

      return NextResponse.json({
        success: true,
        orderId,
        fullyPaidByGiftCard: true,
        quantity,
        unitPrice,
        giftCardAmountUsed,
        amountNgn: 0,
        product: product.name,
        status: "paid",
      });
    }

    await db.collection("stores").doc(slug).collection("orders").doc(orderId).set({
      id: orderId,
      productId,
      productName: product.name,
      quantity,
      unitPrice,
      basePrice: product.price,
      addOns: addOnsSelected,
      stockDeductions,
      buyerWallet: buyerWallet || null,
      buyerEmail,
      buyerPhone: buyerPhone || null,
      buyerName: buyerName || null,
      buyerDelivery: buyerDelivery || null,
      deliveryMethod,
      shippingFee,
      pointsRedeemed: redeemedPoints,
      loyaltyDiscount: redemptionValue,
      giftCardCode: appliedGiftCardCode,
      giftCardAmountUsed,
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
    });

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
        metadata: { slug, orderId, productId, quantity },
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
      quantity,
      unitPrice,
      basePrice: product.price,
      addOns: addOnsSelected,
      subtotal,
      deliveryMethod,
      shippingFee,
      pointsRedeemed: redeemedPoints,
      loyaltyDiscount: redemptionValue,
      giftCardAmountUsed,
      amountNgn: finalAmount,
      discountAmount,
      discountCode: appliedDiscountCode,
      product: product.name,
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
