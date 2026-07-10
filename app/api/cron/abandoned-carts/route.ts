import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { sendAbandonedCartEmail } from "@/lib/abandonedCart";
import { releaseExpiredReservations } from "@/lib/inventoryReservation";

const ONE_HOUR_MS = 60 * 60 * 1000;
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

// GET /api/cron/abandoned-carts — triggered daily by Vercel Cron.
// Finds pending orders older than 1 hour (but not older than 3 days, so we
// don't resurrect long-dead carts) that haven't been reminded yet, and
// sends one recovery email per order. Skips anything without a buyer email
// since there's nowhere to send the reminder.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = Date.now();
    const upperCutoff = Timestamp.fromMillis(now - ONE_HOUR_MS);
    const lowerCutoff = Timestamp.fromMillis(now - THREE_DAYS_MS);

    const snap = await db.collectionGroup("orders")
      .where("status", "==", "pending")
      .where("createdAt", "<=", upperCutoff)
      .where("createdAt", ">=", lowerCutoff)
      .get();

    let sent = 0;
    let skipped = 0;
    const storeCache = new Map<string, { name?: string; globalSettings?: { orders?: { abandonedOrderRecovery?: boolean } } }>();

    for (const doc of snap.docs) {
      const order = doc.data();
      if (order.abandonedReminderSentAt) { skipped++; continue; }
      if (!order.buyerEmail) { skipped++; continue; }

      const slug = doc.ref.parent.parent?.id;
      if (!slug) { skipped++; continue; }

      let store = storeCache.get(slug);
      if (!store) {
        const storeSnap = await db.collection("stores").doc(slug).get();
        store = storeSnap.exists ? storeSnap.data()! : {};
        storeCache.set(slug, store);
      }

        if (!store.globalSettings?.orders?.abandonedOrderRecovery) { skipped++; continue; }

      try {
        await sendAbandonedCartEmail(order.buyerEmail, store.name || slug, slug, order.productName || "your order");
        await doc.ref.set({ abandonedReminderSentAt: Timestamp.now() }, { merge: true });
        sent++;
      } catch (e) {
        console.error(`Failed to send abandoned cart email for order ${doc.id}:`, e);
        skipped++;
      }
    }

    // Safety net: release any expired stock reservations for stores touched
    // by this run. The lazy per-checkout release in charge/charge-naira
    // routes handles active stores; this catches low-traffic stores where
    // nobody attempts a new checkout to trigger that release.
    for (const slug of storeCache.keys()) {
      await releaseExpiredReservations(slug);
    }

    return NextResponse.json({ success: true, remindersSent: sent, skipped, totalScanned: snap.size });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
