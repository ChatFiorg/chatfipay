import { db } from "./firebaseAdmin";

export interface PaymentRequest {
  id: string;
  walletAddress: string;
  merchantWallet?: string;
  amount: number | null;
  token: string;
  label: string;
  memo: string;
  status: "pending" | "completed" | "cancelled";
  createdAt: any;
  paidAt?: any;
  paidBy?: string;
  txSignature?: string;
  storeSlug?: string;
}

export async function getPaymentRequest(id: string): Promise<PaymentRequest | null> {
  const payLinkSnap = await db.collection("pay_links").doc(id).get();
  if (payLinkSnap.exists) {
    const d = payLinkSnap.data()!;
    return {
      id,
      walletAddress: d.walletAddress,
      merchantWallet: d.merchantWallet || null,
      amount: d.amount,
      token: d.token || "SOL",
      label: d.label,
      memo: d.memo,
      status: d.status,
      createdAt: d.createdAt,
      paidAt: d.paidAt,
      txSignature: d.txSignature,
      ngnAmount: d.ngnAmount || null,
      storeSlug: d.storeSlug || null,
    } as PaymentRequest;
  }
  const snap = await db.collection("payments").doc(id).get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  return { ...d, token: d.token || "SOL" } as PaymentRequest;
}

export async function markPaymentComplete(
  id: string, paidBy: string, txSignature: string
): Promise<void> {
  const update = {
    status: "completed",
    paidBy,
    txSignature,
    paidAt: new Date().toISOString(),
  };
  // Check which collection this payment is in
  const payLinkSnap = await db.collection("pay_links").doc(id).get();
  if (payLinkSnap.exists) {
    await db.collection("pay_links").doc(id).update(update);
    // Also update the store order if this is a store payment
    const payLinkData = payLinkSnap.data();
    if (payLinkData?.storeOrder && payLinkData?.storeSlug && payLinkData?.orderId) {
      await db.collection("stores")
        .doc(payLinkData.storeSlug)
        .collection("orders")
        .doc(payLinkData.orderId)
        .update({
          status: "paid",
          paidAt: new Date().toISOString(),
          txSignature,
          paidBy,
        });
    }
  } else {
    await db.collection("payments").doc(id).update(update);
  }
}
