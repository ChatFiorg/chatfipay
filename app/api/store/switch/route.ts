import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const { wallet, username } = await req.json();
    if (!wallet || !username) {
      return NextResponse.json({ error: "Missing wallet or username" }, { status: 400 });
    }

    const walletRef = db.collection("storeWallets").doc(wallet);
    const walletSnap = await walletRef.get();
    if (!walletSnap.exists) return NextResponse.json({ error: "No stores for this wallet" }, { status: 404 });

    const { usernames = [] } = walletSnap.data()!;
    if (!usernames.includes(username)) {
      return NextResponse.json({ error: "This wallet doesn't own that store" }, { status: 403 });
    }

    await walletRef.update({ activeUsername: username });
    return NextResponse.json({ success: true, activeUsername: username });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
