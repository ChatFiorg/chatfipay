import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

// One-time backfill: tag existing USDC orders with paymentMethod: "usdc"
// Trigger once via: curl -X POST https://pay.chatfi.pro/api/admin/backfill-usdc -H "x-admin-key: YOUR_KEY"
export async function POST(req: NextRequest) {
  const adminKey = req.headers.get("x-admin-key");
  if (adminKey !== process.env.ADMIN_BACKFILL_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stores = await db.collection("stores").get();
    let checked = 0, updated = 0;

    for (const store of stores.docs) {
      const orders = await db.collection("stores").doc(store.id).collection("orders")
        .where("amountUsdc", ">", 0).get();

      for (const o of orders.docs) {
        checked++;
        if (!o.data().paymentMethod) {
          await o.ref.update({ paymentMethod: "usdc" });
          updated++;
        }
      }
    }

    return NextResponse.json({ success: true, checked, updated });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
