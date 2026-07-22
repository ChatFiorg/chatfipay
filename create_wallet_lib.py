content = '''import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

// ChatFi-hosted send pricing — the markup is baked into these numbers.
export const SMS_UNIT_PRICE_NGN = 5;
export const EMAIL_PRICE_NGN = 3;

export class InsufficientBalanceError extends Error {
  constructor(public required: number, public available: number) {
    super(`Insufficient wallet balance: need \u20a6${required}, have \u20a6${available}`);
    this.name = "InsufficientBalanceError";
  }
}

export async function getWalletBalance(slug: string): Promise<number> {
  const snap = await db.collection("stores").doc(slug).get();
  if (!snap.exists) return 0;
  return Number(snap.data()?.walletBalance || 0);
}

// Atomically deducts `amount` from the store's wallet balance. Throws
// InsufficientBalanceError (without mutating anything) if the balance is
// too low, so callers can bail out before attempting a paid send.
export async function deductWallet(slug: string, amount: number): Promise<void> {
  const storeRef = db.collection("stores").doc(slug);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(storeRef);
    const current = Number(snap.data()?.walletBalance || 0);
    if (current < amount) {
      throw new InsufficientBalanceError(amount, current);
    }
    tx.update(storeRef, { walletBalance: FieldValue.increment(-amount) });
  });
}

// Refunds `amount` back to the store's wallet — used when a paid send fails
// after the deduction already happened.
export async function refundWallet(slug: string, amount: number): Promise<void> {
  await db.collection("stores").doc(slug).update({
    walletBalance: FieldValue.increment(amount),
  });
}

// Credits `amount` to the store's wallet — used when a top-up payment is
// confirmed via the Paystack webhook.
export async function creditWallet(slug: string, amount: number): Promise<void> {
  await db.collection("stores").doc(slug).update({
    walletBalance: FieldValue.increment(amount),
  });
}
'''

with open("lib/wallet.ts", "w", encoding="utf-8") as f:
    f.write(content)

print("Created lib/wallet.ts")
