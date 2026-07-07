import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

async function getStoreByApiKey(apiKey: string | null, slug: string) {
  if (!apiKey) return null;
  const snap = await db.collection("storeKeys").doc(slug).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  if (data.apiKey !== apiKey) return null;
  return data;
}

function csvEscape(v: any): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// GET /api/store/[slug]/orders/export — export orders as CSV (owner only, x-api-key header)
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const apiKey = req.headers.get("x-api-key");
  const storeKey = await getStoreByApiKey(apiKey, slug);
  if (!storeKey) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });

  try {
    const snap = await db.collection("stores").doc(slug).collection("orders")
      .orderBy("createdAt", "desc").get();

    const rows = [
      "orderId,productName,quantity,unitPrice,subtotal,discountCode,discountAmount,shippingFee,deliveryMethod,amount,status,fulfillmentStatus,buyerName,buyerPhone,buyerEmail,buyerDelivery,paymentMethod,createdAt,paidAt"
    ];

    snap.docs.forEach(d => {
        const o = d.data();
        const orderLevelFields = [
          o.discountCode,
          o.discountAmount,
          o.shippingFee,
          o.deliveryMethod,
          o.amount,
          o.status,
          o.fulfillmentStatus,
          o.buyerName,
          o.buyerPhone,
          o.buyerEmail,
          o.buyerDelivery,
          o.paymentMethod,
          o.createdAt?.toDate?.()?.toISOString() || "",
          o.paidAt?.toDate?.()?.toISOString() || "",
        ];

        // Multi-item cart orders (Combo/MiniStore) store a real items[] array —
        // emit one row per line item so quantities/prices are accurate per
        // product, instead of collapsing to the single-item summary fields.
        // Legacy/simple orders without items[] fall back to the old summary row.
        if (Array.isArray(o.items) && o.items.length > 0) {
          o.items.forEach((item: any) => {
            rows.push(
              [
                d.id,
                item.productName,
                item.quantity ?? 1,
                item.unitPrice ?? 0,
                (item.unitPrice ?? 0) * (item.quantity ?? 1),
                ...orderLevelFields,
              ]
                .map(csvEscape)
                .join(",")
            );
          });
        } else {
          rows.push(
            [
              d.id,
              o.productName,
              o.quantity ?? 1,
              o.unitPrice ?? o.amount,
              o.subtotal ?? o.amount,
              ...orderLevelFields,
            ]
              .map(csvEscape)
              .join(",")
          );
        }
      });

      return new NextResponse(rows.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${slug}-orders.csv"`,
      },
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
