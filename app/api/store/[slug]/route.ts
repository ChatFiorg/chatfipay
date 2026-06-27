import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import crypto from "crypto";

// Verify store API key
async function getStoreByApiKey(apiKey: string | null, slug: string) {
  if (!apiKey) return null;
  const snap = await db.collection("storeKeys").doc(slug).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  if (data.apiKey !== apiKey) return null;
  return data;
}

// GET /api/store/[slug] — public store info + products
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const storeSnap = await db.collection("stores").doc(slug).get();
    if (!storeSnap.exists) return NextResponse.json({ error: "Store not found" }, { status: 404 });

    const store = storeSnap.data()!;
    if (!store.live) return NextResponse.json({ error: "Store is offline" }, { status: 403 });

    const productsSnap = await db.collection("stores").doc(slug).collection("products")
      .where("active", "==", true).get();
    const products = productsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    return NextResponse.json({
      username: store.username,
      name: store.name,
      description: store.description,
      logo: store.logo,
      banner: store.banner,
      category: store.category,
      theme: store.theme,
      contact: store.contact,
      products,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
