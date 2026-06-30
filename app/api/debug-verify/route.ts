import { NextRequest, NextResponse } from "next/server";
import { getPaymentRequest } from "@/lib/payment";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "no slug" });

  const payment = await getPaymentRequest(slug);
  if (!payment) return NextResponse.json({ error: "payment not found" });

  const heliusKey = process.env.HELIUS_API_KEY;

  const heliusRes = await fetch(
    `https://api.helius.xyz/v0/addresses/${payment.walletAddress}/transactions?api-key=${heliusKey}&limit=5&type=TRANSFER`
  );
  const txList = await heliusRes.json();

  return NextResponse.json({
    heliusKey: heliusKey ? "SET" : "MISSING",
    walletAddress: payment.walletAddress,
    amount: payment.amount,
    token: payment.token,
    status: payment.status,
    txCount: Array.isArray(txList) ? txList.length : 0,
    firstTx: Array.isArray(txList) && txList[0] ? {
      signature: txList[0].signature,
      timestamp: txList[0].timestamp,
      tokenTransfers: txList[0].tokenTransfers,
      nativeTransfers: txList[0].nativeTransfers,
    } : txList,
  });
}
