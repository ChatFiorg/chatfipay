import { db } from "./firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

export interface DiscountApplyResult {
  finalAmount: number;
  discountAmount: number;
  code: string | null;
}

// Validates a discount code against the order amount and atomically
// increments its usage count if valid. Returns the original amount
// unchanged (with code: null) if no code was supplied or it's invalid —
// callers should surface `error` to the buyer only when a code WAS supplied
// but failed validation, not silently swallow it.
export async function applyDiscountCode(
  slug: string,
  rawCode: string | null | undefined,
  amount: number
): Promise<DiscountApplyResult | { error: string }> {
  if (!rawCode) return { finalAmount: amount, discountAmount: 0, code: null };

  const code = rawCode.trim().toUpperCase();
  const ref = db.collection("stores").doc(slug).collection("discounts").doc(code);

  try {
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Invalid discount code");

      const data = snap.data()!;
      if (data.active === false) throw new Error("This discount code is no longer active");
      if (data.expiresAt && (data.expiresAt as Timestamp).toMillis() < Date.now()) {
        throw new Error("This discount code has expired");
      }
      if (data.usageLimit != null && (data.usageCount || 0) >= data.usageLimit) {
        throw new Error("This discount code has reached its usage limit");
      }
      if (data.minOrderAmount != null && amount < data.minOrderAmount) {
        throw new Error(`This code requires a minimum order of ₦${data.minOrderAmount}`);
      }

      const discountAmount = data.type === "fixed"
        ? Math.min(data.value, amount)
        : Math.round(amount * (data.value / 100));
      const finalAmount = Math.max(amount - discountAmount, 0);

      tx.set(ref, { usageCount: (data.usageCount || 0) + 1 }, { merge: true });

      return { finalAmount, discountAmount, code };
    });
    return result;
  } catch (e: any) {
    return { error: e.message || "Invalid discount code" };
  }
}
