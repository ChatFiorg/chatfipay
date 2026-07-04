import { db } from "./firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

export interface GiftCardApplyResult {
  code: string | null;
  amountUsed: number;
}

// Applies a gift card to the amount owed (after all other discounts/fees),
// atomically decrementing its stored balance. Like discount codes, this
// spends the balance immediately at checkout rather than waiting for
// payment confirmation — consistent with how discount usage is already
// tracked in this codebase. Supports partial use: only the amount actually
// needed is deducted, and any remaining balance stays on the card for a
// future order.
export async function applyGiftCard(
  slug: string,
  rawCode: string | null | undefined,
  amountOwed: number
): Promise<GiftCardApplyResult | { error: string }> {
  if (!rawCode) return { code: null, amountUsed: 0 };
  if (amountOwed <= 0) return { code: null, amountUsed: 0 };

  const code = rawCode.trim().toUpperCase();
  const ref = db.collection("stores").doc(slug).collection("giftCards").doc(code);

  try {
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Invalid gift card code");

      const data = snap.data()!;
      if (data.active === false) throw new Error("This gift card is no longer active");
      if (data.expiresAt && (data.expiresAt as Timestamp).toMillis() < Date.now()) {
        throw new Error("This gift card has expired");
      }
      if ((data.balance || 0) <= 0) {
        throw new Error("This gift card has no remaining balance");
      }

      const amountUsed = Math.min(data.balance, amountOwed);
      const newBalance = data.balance - amountUsed;
      tx.set(ref, { balance: newBalance }, { merge: true });

      return { code, amountUsed };
    });
    return result;
  } catch (e: any) {
    return { error: e.message || "Invalid gift card code" };
  }
}
