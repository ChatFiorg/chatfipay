import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

// GET /api/store/[slug]/order-status?reference=chatfi_xxx
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { searchParams } = new URL(req.url);
  const reference = searchParams.get("reference");

  if (!reference) {
    const res = NextResponse.json({ error: "Missing reference" }, { status: 400 });
    res.headers.set("Access-Control-Allow-Origin", "*");
    return res;
  }

  try {
    const matchSnap = await db
      .collection("stores")
      .doc(slug)
      .collection("orders")
      .where("paystackRef", "==", reference)
      .limit(1)
      .get();

    if (matchSnap.empty) {
      const res = NextResponse.json({ status: "not_found" }, { status: 404 });
      res.headers.set("Access-Control-Allow-Origin", "*");
      return res;
    }

    const order = matchSnap.docs[0].data();
    const res = NextResponse.json({
      status: order.status === "paid" ? "paid" : "pending",
      orderId: matchSnap.docs[0].id,
    });
    res.headers.set("Access-Control-Allow-Origin", "*");
    return res;
  } catch (e) {
    console.error(e);
    const res = NextResponse.json({ error: "Server error" }, { status: 500 });
    res.headers.set("Access-Control-Allow-Origin", "*");
    return res;
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
