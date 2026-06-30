import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import crypto from "crypto";
import { derivePaymentAddress } from "@/lib/derivedWallet";
import { fundDepositAddress } from "@/lib/fundDeposit";

export async function POST(req: NextRequest) {
  try {
    const { walletAddress, amount, label, memo } = await req.json();
    if (!walletAddress) return NextResponse.json({ error: "Missing walletAddress" }, { status: 400 });

    const id = crypto.randomBytes(8).toString("hex");
    const now = Timestamp.now();
    const expiresAt = Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60000);

    const depositAddress = derivePaymentAddress(id);
    try {
      await fundDepositAddress(depositAddress);
    } catch (e) {
      console.error("Failed to fund deposit address (sweep will fail later):", e);
    }

    await db.collection("payments").doc(id).set({
      id, walletAddress: depositAddress,
      merchantWallet: walletAddress,
      amount: amount || null,
      label: label || null,
      memo: memo || null,
      status: "pending",
      createdAt: now,
      expiresAt,
      paidAt: null,
      txSignature: null,
    });

    return NextResponse.json({ id, link: `https://pay.chatfi.pro/pay/${id}` });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
