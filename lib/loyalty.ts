import { db } from "./firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { verifyBuyerToken, normalizeEmail } from "./buyerAuth";

export interface LoyaltyConfig {
  enabled: boolean;
  earnRate: number;   // points earned per ₦100 spent
  redeemValue: number; // ₦ value of each point when redeemed
}

export async function getLoyaltyBalance(slug: string, email: string): Promise<number> {
  const normalized = normalizeEmail(email);
  if (!normalized) return 0;
  const snap = await db.collection("stores").doc(slug).collection("loyalty").doc(normalized).get();
  return snap.exists ? (snap.data()!.points || 0) : 0;
}

// Validates a points-redemption request against the buyer's real, server-side
// balance. Requires a valid buyer token whose email matches buyerEmail, so a
// spoofed buyerEmail in the request body can never redeem someone else's
// points. Caps the redemption value at the order subtotal (never negative).
export async function resolveLoyaltyRedemption(
  slug: string,
  loyaltyConfig: LoyaltyConfig | undefined,
  buyerToken: string | null | undefined,
  buyerEmail: string | null | undefined,
  requestedPoints: number,
  subtotalAfterDiscount: number
): Promise<{ redeemedPoints: number; redemptionValue: number } | { error: string }> {
  if (!requestedPoints || requestedPoints <= 0) {
    return { redeemedPoints: 0, redemptionValue: 0 };
  }
  if (!loyaltyConfig?.enabled) {
    return { error: "Loyalty points are not enabled for this store" };
  }

  const payload = verifyBuyerToken(buyerToken);
  if (!payload || payload.slug !== slug) {
    return { error: "You must be logged in to redeem points" };
  }
  const normalizedRequestEmail = normalizeEmail(buyerEmail);
  if (!normalizedRequestEmail || normalizedRequestEmail !== payload.email) {
    return { error: "Points can only be redeemed by the logged-in account" };
  }

  const balance = await getLoyaltyBalance(slug, payload.email);
  const points = Math.min(Math.floor(requestedPoints), balance);
  if (points <= 0) {
    return { redeemedPoints: 0, redemptionValue: 0 };
  }

  const rawValue = points * (loyaltyConfig.redeemValue || 1);
  const redemptionValue = Math.min(rawValue, subtotalAfterDiscount);
  // Recompute actual points consumed in case the value was capped, so we
  // never deduct more points than the discount they actually received.
  const redeemedPoints = loyaltyConfig.redeemValue > 0
    ? Math.ceil(redemptionValue / loyaltyConfig.redeemValue)
    : points;

  return { redeemedPoints, redemptionValue };
}

// Called from the webhook once payment is confirmed: credits points earned
// on this order and debits any points that were redeemed at checkout.
export async function settleLoyaltyForOrder(
  slug: string,
  email: string | null | undefined,
  amountEarnedOn: number,
  pointsRedeemed: number,
  loyaltyConfig: LoyaltyConfig | undefined
): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!normalized || !loyaltyConfig?.enabled) return;

  const earned = Math.floor((amountEarnedOn / 100) * (loyaltyConfig.earnRate || 0));
  const delta = earned - (pointsRedeemed || 0);
  if (delta === 0) return;

  await db.collection("stores").doc(slug).collection("loyalty").doc(normalized).set(
    { points: FieldValue.increment(delta), email: normalized, updatedAt: new Date().toISOString() },
    { merge: true }
  );
}
