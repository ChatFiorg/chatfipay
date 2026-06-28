import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const { ownerWallet, username } = await req.json();
    if (!ownerWallet || !username) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    await db.collection("storeWallets").doc(ownerWallet).update({ activeUsername: username });
    return NextResponse.json({ success: true, activeUsername: username });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
