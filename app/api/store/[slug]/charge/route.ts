import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import crypto from "crypto";
import { applyDiscountCode } from "@/lib/discounts";
import { resolveOrderPricing } from "@/lib/orderPricing";
import { resolveLoyaltyRedemption } from "@/lib/loyalty";
import { applyGiftCard } from "@/lib/giftCards";
import { derivePaymentAddress } from "@/lib/derivedWallet";
import { fundDepositAddress } from "@/lib/fundDeposit";
import { PublicKey } from "@solana/web3.js";

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

async function getNgnPerUsdc(): Promise<number> {
  try {
    const fxRes = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    const fxData = await fxRes.json();
    const usdNgn = fxData?.rates?.NGN;
    if (usdNgn && usdNgn > 100) return usdNgn;
  } catch {}
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    const data = await res.json();
    const usdNgn = data?.rates?.NGN;
    if (usdNgn && usdNgn > 100) return usdNgn;
  } catch {}
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=NGN');
    const data = await res.json();
    const usdNgn = data?.rates?.NGN;
    if (usdNgn && usdNgn > 100) return usdNgn;
  } catch {}
  return 1600;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;

  try {
    const body = await req.json();
    const { buyerEmail, buyerPhone, buyerName, buyerWallet, buyerDelivery, discountCode, buyerToken, giftCardCode } = body;
    const deliveryMethod = body.deliveryMethod === "pickup" ? "pickup" : "delivery";
    const redeemPoints = Math.max(0, Math.floor(Number(body.redeemPoints) || 0));

    const rawItems: { productId: string; quantity: number; selectedAddOns?: string[]; selectedVariant?: string }[] =
      Array.isArray(body.items) && body.items.length > 0
        ? body.items
        : body.productId
          ? [{ productId: body.productId, quantity: body.quantity, selectedAddOns: body.selectedAddOns, selectedVariant: body.selectedVariant }]
          : [];

    if (rawItems.length === 0) return NextResponse.json({ error: "Missing productId" }, { status: 400 });

    const storeSnap = await db.collection("stores").doc(slug).get();
    if (!storeSnap.exists) return NextResponse.json({ error: "Store not found" }, { status: 404 });
    const store = storeSnap.data()!;
    const allowedPaymentMethod = store.contact?.paymentMethod || "both";
    if (allowedPaymentMethod === "naira") {
      return NextResponse.json({ error: "This store only accepts Naira payments" }, { status: 400 });
    }

    // Resolve where swept USDC should ultimately land. Prefer an explicit
    // cryptoPayoutWallet (set by web/email-signup owners who have no
    // embedded wallet), falling back to ownerWallet (mobile owners, whose
    // ownerWallet is always a real Solana pubkey). Validate up front so we
    // fail with a clear buyer-facing message instead of a silent sweep
    // failure hours later.
    const cryptoDestination = store.cryptoPayoutWallet || store.ownerWallet;
    let merchantWallet: string;
    try {
      merchantWallet = new PublicKey(cryptoDestination).toBase58();
    } catch {
      return NextResponse.json(
        { error: "This store hasn't set up crypto payouts yet" },
        { status: 400 }
      );
    }
    if (!store.live) return NextResponse.json({ error: "Store is offline" }, { status: 403 });

    if (deliveryMethod === "pickup" && !store.shipping?.pickupEnabled) {
      return NextResponse.json({ error: "Pickup is not available for this store" }, { status: 400 });
    }

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
    const now = Timestamp.now();

    const summaryName = resolvedLines.length === 1
      ? resolvedLines[0].productName
      : `${resolvedLines[0].productName} +${resolvedLines.length - 1} more`;

    if (finalAmount <= 0) {
      await db.collection("stores").doc(slug).collection("orders").doc(orderId).set({
        id: orderId,
        items: resolvedLines,
        productId: resolvedLines[0].productId,
        productName: summaryName,
        quantity: totalQuantity,
        unitPrice: subtotal / totalQuantity,
        buyerWallet: buyerWallet || null,
        buyerEmail: buyerEmail || null,
        buyerPhone: buyerPhone || null,
        buyerName: buyerName || null,
        buyerDelivery: buyerDelivery || null,
        deliveryMethod,
        shippingFee,
        pointsRedeemed: redeemedPoints,
        loyaltyDiscount: redemptionValue,
        giftCardCode: appliedGiftCardCode,
        giftCardAmountUsed,
        stockDeductions: combinedStockDeductions,
        amount: 0,
        subtotal,
        discountCode: appliedDiscountCode,
        discountAmount,
        paymentMethod: "giftcard",
        status: "pending",
        createdAt: now,
        paidAt: null,
      });

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

    const ngnPerUsdc = await getNgnPerUsdc();
    const amountUsdc = Math.round((finalAmount / ngnPerUsdc) * 100) / 100;

    const expiresAt = Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60000);
    const payLinkId = crypto.randomBytes(8).toString("hex");

    const depositAddress = derivePaymentAddress(payLinkId);

    try {
      await fundDepositAddress(depositAddress);
    } catch (e) {
      console.error("Failed to fund deposit address (sweep will fail later):", e);
    }

    await db.collection("pay_links").doc(payLinkId).set({
      merchantId: slug,
      walletAddress: depositAddress,
      merchantWallet,
      amount: amountUsdc,
      token: "USDC",
      label: `${summaryName} x${totalQuantity}`,
      memo: `Order ${orderId} - ${store.name}`,
      status: "pending",
      storeOrder: true,
      storeSlug: slug,
      orderId,
      idempotencyKey: null,
      createdAt: now,
      expiresAt,
      paidAt: null,
      txSignature: null,
      payerWallet: buyerWallet || null,
      receivedAmount: null,
      buyerDelivery: buyerDelivery || null,
      ngnPerUsdc,
      ngnAmount: finalAmount,
    });

    await db.collection("stores").doc(slug).collection("orders").doc(orderId).set({
      id: orderId,
      items: resolvedLines,
      productId: resolvedLines[0].productId,
      productName: summaryName,
      quantity: totalQuantity,
      unitPrice: subtotal / totalQuantity,
      buyerWallet: buyerWallet || null,
      buyerEmail: buyerEmail || null,
      buyerPhone: buyerPhone || null,
      buyerName: buyerName || null,
      buyerDelivery: buyerDelivery || null,
      deliveryMethod,
      shippingFee,
      shippingRateId: body.shippingRateId || null,
      shippingAddress: body.shippingAddress || null,
      shippingStatus: body.shippingRateId ? "pending" : null,
      pointsRedeemed: redeemedPoints,
      loyaltyDiscount: redemptionValue,
      giftCardCode: appliedGiftCardCode,
      giftCardAmountUsed,
      stockDeductions: combinedStockDeductions,
      amount: finalAmount,
      subtotal,
      discountCode: appliedDiscountCode,
      discountAmount,
      amountUsdc,
      ngnPerUsdc,
      paymentMethod: "usdc",
      status: "pending",
      paymentRef: payLinkId,
      chatfiPaySlug: payLinkId,
      createdAt: now,
      paidAt: null,
    });

    await db.collection("storeKeys").doc(slug).update({ lastUsed: now });

    const response = NextResponse.json({
      success: true,
      orderId,
      paymentLink: `https://pay.chatfi.pro/pay/${payLinkId}`,
      items: resolvedLines,
      subtotal,
      deliveryMethod,
      shippingFee,
      pointsRedeemed: redeemedPoints,
      loyaltyDiscount: redemptionValue,
      giftCardAmountUsed,
      amountNgn: finalAmount,
      discountAmount,
      discountCode: appliedDiscountCode,
      amountUsdc,
      ngnPerUsdc,
      status: "pending",
      expiresAt: expiresAt.toDate().toISOString(),
    });
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
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
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
