import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY!;
const PAYSTACK_BASE_URL = "https://api.paystack.co";
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

// GET /api/cron/check-settlements — triggered daily by Vercel Cron.
// Naira orders settle to the merchant's Paystack subaccount on Paystack's own
// schedule (next business day, shifted past weekends) — there is no webhook
// telling us when a specific charge's split actually lands. This polls
// Paystack's Settlement API for each store's subaccount, matches settled
// transaction references back to our orders, and marks them disbursed once
// confirmed. USDC orders are marked disbursed instantly elsewhere (they
// settle immediately on-chain), so this cron only ever looks at naira orders.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const snap = await db.collectionGroup("orders")
      .where("paymentMethod", "==", "naira")
      .where("status", "==", "paid")
      .where("disbursed", "==", false)
      .get();

    if (snap.empty) {
      return NextResponse.json({ success: true, checked: 0, disbursed: 0 });
    }

    // Group pending orders by store slug so we only look up each store's
    // subaccount and settlements once.
    const byStore = new Map<string, { ref: FirebaseFirestore.DocumentReference; paystackRef: string }[]>();
    for (const doc of snap.docs) {
      const slug = doc.ref.parent.parent?.id;
      const paystackRef = doc.data().paystackRef;
      if (!slug || !paystackRef) continue;
      if (!byStore.has(slug)) byStore.set(slug, []);
      byStore.get(slug)!.push({ ref: doc.ref, paystackRef });
    }

    const fromDate = new Date(Date.now() - FOURTEEN_DAYS_MS).toISOString().slice(0, 10);
    let checked = 0;
    let disbursedCount = 0;

    for (const [slug, orders] of byStore) {
      checked += orders.length;

      const storeSnap = await db.collection("stores").doc(slug).get();
      const subaccountCode = storeSnap.data()?.payoutAccount?.subaccountCode;
      if (!subaccountCode) continue;

      const settlementsRes = await fetch(
        `${PAYSTACK_BASE_URL}/settlement?subaccount=${subaccountCode}&status=success&from=${fromDate}&perPage=50`,
        { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } }
      );
      const settlementsData = await settlementsRes.json();
      if (!settlementsRes.ok || !settlementsData.status) {
        console.error(`Settlement lookup failed for ${slug}:`, settlementsData);
        continue;
      }

      const settledRefs = new Map<string, string>(); // paystack reference -> paid_at

      for (const settlement of settlementsData.data || []) {
        const txRes = await fetch(
          `${PAYSTACK_BASE_URL}/settlement/${settlement.id}/transactions?perPage=100`,
          { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } }
        );
        const txData = await txRes.json();
        if (!txRes.ok || !txData.status) continue;
        for (const tx of txData.data || []) {
          if (tx.reference) settledRefs.set(tx.reference, tx.paid_at || settlement.settlement_date);
        }
      }

      for (const order of orders) {
        const paidAt = settledRefs.get(order.paystackRef);
        if (!paidAt) continue;
        await order.ref.update({
          disbursed: true,
          disbursedAt: Timestamp.fromDate(new Date(paidAt)),
        });
        disbursedCount++;
      }
    }

    return NextResponse.json({ success: true, checked, disbursed: disbursedCount });
  } catch (e: any) {
    console.error("check-settlements cron failed:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
