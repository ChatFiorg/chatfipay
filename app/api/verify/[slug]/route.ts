import { NextRequest, NextResponse } from "next/server";
import { getPaymentRequest, markPaymentComplete } from "@/lib/payment";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const payment = await getPaymentRequest(slug);
    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    if (payment.status === "completed") {
      return NextResponse.json({ status: "completed", txSignature: payment.txSignature });
    }

    const rpcUrl = process.env.HELIUS_RPC_URL;
    if (!rpcUrl) {
      return NextResponse.json({ error: "RPC not configured" }, { status: 500 });
    }

    // Get signatures for the recipient wallet
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getSignaturesForAddress",
        params: [payment.walletAddress, { limit: 10 }],
      }),
    });

    const data = await res.json();
    const signatures = data.result || [];

    for (const sig of signatures) {
      // Get transaction details
      const txRes = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getTransaction",
          params: [sig.signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }],
        }),
      });

      const txData = await txRes.json();
      const tx = txData.result;
      if (!tx) continue;

      // Check if reference key is in the transaction accounts
      const accounts = tx.transaction?.message?.accountKeys || [];
      const hasReference = accounts.some(
        (a: any) => a.pubkey === slug
      );

      if (hasReference) {
        await markPaymentComplete(slug, accounts[0]?.pubkey || "unknown", sig.signature);
        return NextResponse.json({ status: "completed", txSignature: sig.signature });
      }
    }

    return NextResponse.json({ status: "pending" });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
