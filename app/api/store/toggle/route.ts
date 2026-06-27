import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, ownerWallet, live } = body;

    if (!username || !ownerWallet || live === undefined) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const storeSnap = await db.collection("stores").doc(username).get();
    if (!storeSnap.exists || storeSnap.data()!.ownerWallet !== ownerWallet) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await db.collection("stores").doc(username).update({ live });
    return NextResponse.json({ success: true, live });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
