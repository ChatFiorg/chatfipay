import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { signOwnerToken, verifyWalletSignature } from "@/lib/ownerAuth";

// POST /api/owner-auth/wallet
// body: { walletAddress, signature, message }
// Verifies a Solana wallet's signed login message, then checks whether this
// wallet already owns a store (reusing the existing storeWallets lookup used
// by the mobile app), and issues a signed owner session token either way.
export async function POST(req: NextRequest) {
  try {
    const { walletAddress, signature, message } = await req.json();
    if (!walletAddress || !signature || !message) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const valid = verifyWalletSignature(walletAddress, message, signature);
    if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

    const walletSnap = await db.collection("storeWallets").doc(walletAddress).get();
    const hasStore = walletSnap.exists && Array.isArray(walletSnap.data()?.usernames) && walletSnap.data()!.usernames.length > 0;
    const activeUsername = hasStore ? walletSnap.data()!.activeUsername : null;
    const usernames = hasStore ? walletSnap.data()!.usernames : [];

    const token = signOwnerToken(`wallet:${walletAddress}`, "wallet");

    return NextResponse.json({ success: true, token, hasStore, activeUsername, usernames });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
