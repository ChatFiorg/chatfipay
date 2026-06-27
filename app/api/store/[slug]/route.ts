import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const { searchParams } = new URL(req.url);
  const isPublic = searchParams.get("public") === "true";

  try {
    const storeSnap = await db.collection("stores").doc(slug).get();
    if (!storeSnap.exists) return NextResponse.json({ error: "Store not found" }, { status: 404 });

    const store = storeSnap.data()!;

    // Public storefront — only show live stores
    if (isPublic && !store.live) {
      return NextResponse.json({ error: "Store is offline" }, { status: 403 });
    }

    const productsSnap = await db.collection("stores").doc(slug).collection("products").get();
    const products = productsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    return NextResponse.json({ ...store, products });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
