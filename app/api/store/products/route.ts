import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, ownerWallet, product } = body;

    if (!username || !ownerWallet || !product) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const storeSnap = await db.collection("stores").doc(username).get();
    if (!storeSnap.exists || storeSnap.data()!.ownerWallet !== ownerWallet) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const productId = product.id || db.collection("stores").doc(username).collection("products").doc().id;
    await db.collection("stores").doc(username).collection("products").doc(productId).set({
      ...product,
      id: productId,
      active: product.active ?? true,
      createdAt: product.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    return NextResponse.json({ success: true, productId });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get("username");
    const productId = searchParams.get("productId");
    const wallet = searchParams.get("wallet");

    if (!username || !productId || !wallet) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const storeSnap = await db.collection("stores").doc(username).get();
    if (!storeSnap.exists || storeSnap.data()!.ownerWallet !== wallet) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await db.collection("stores").doc(username).collection("products").doc(productId).delete();
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
