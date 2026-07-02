import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

const SECRET = "chatfi_diag_5m2x91q";

// GET /api/admin/diag-orders?secret=...&slug=samstore
// One-off: dump raw fields of the 5 most recent orders. DELETE after use.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("secret") !== SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const slug = searchParams.get("slug") || "samstore";

  const snap = await db.collection("stores").doc(slug).collection("orders")
    .orderBy("createdAt", "desc")
    .limit(5)
    .get();

  const orders = snap.docs.map(d => {
    const data = d.data();
    return {
      id: d.id,
      status: data.status,
      buyerEmail: data.buyerEmail || null,
      buyerEmailNormalized: data.buyerEmailNormalized || null,
      buyerPhone: data.buyerPhone || null,
      buyerPhoneNormalized: data.buyerPhoneNormalized || null,
      customerKey: data.customerKey || null,
      amount: data.amount,
      paymentMethod: data.paymentMethod || (data.amountUsdc ? "crypto" : "unknown"),
      createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
      paidAt: data.paidAt?.toDate?.()?.toISOString() || null,
    };
  });

  return NextResponse.json({ orders });
}
