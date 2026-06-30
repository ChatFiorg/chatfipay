import { NextRequest, NextResponse } from "next/server";
import { getPaymentRequest, markPaymentComplete } from "@/lib/payment";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";

async function sendPushNotification(token: string, amount: number | null, label: string) {
  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: token,
      title: "Payment Received! 🎉",
      body: `${amount ? `$${amount} USDC` : "Payment"} received${label ? ` for ${label}` : ""}`,
      sound: "default",
    }),
  });
}

async function fireWebhook(webhookUrl: string, payment: any, txSignature: string) {
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "payment.confirmed",
        id: payment.id,
        amount: payment.amount,
        label: payment.label,
        memo: payment.memo,
        walletAddress: payment.walletAddress,
        txSignature,
        paidAt: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.error("Webhook failed:", e);
  }
}

async function getMerchantData(walletAddress: string) {
  try {
    const snap = await getDoc(doc(db, "merchants", walletAddress));
    if (snap.exists()) return snap.data();
  } catch (e) {}
  return null;
}

async function updateMerchantStats(walletAddress: string, amount: number | null) {
  try {
    const snap = await getDoc(doc(db, "merchants", walletAddress));
    if (snap.exists()) {
      const data = snap.data();
      const stats = data.stats || { total: 0, completed: 0, pending: 0, volume: 0 };
      await updateDoc(doc(db, "merchants", walletAddress), {
        stats: {
          ...stats,
          completed: (stats.completed || 0) + 1,
          volume: (stats.volume || 0) + (amount || 0),
        }
      });
    }
  } catch (e) {
    console.error("Stats update failed:", e);
  }
}

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

    const heliusKey = process.env.HELIUS_API_KEY || process.env.HELIUS_RPC_URL?.split('api-key=')?.[1];
    if (!heliusKey) {
      return NextResponse.json({ error: "Helius not configured" }, { status: 500 });
    }

    const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
    const expectedMint = payment.token === "USDT" ? USDT_MINT : USDC_MINT;
    const expectedAmount = payment.amount ? payment.amount : null;

    const createdAtMs = payment.createdAt?.toMillis
      ? payment.createdAt.toMillis()
      : typeof payment.createdAt === "string"
      ? new Date(payment.createdAt).getTime()
      : Date.now() - 86400000;

    // Use Helius Enhanced Transactions API — parses token transfers automatically
    const heliusRes = await fetch(
      `https://api.helius.xyz/v0/addresses/${payment.walletAddress}/transactions?api-key=${heliusKey}&limit=20&type=TRANSFER`,
    );
    const txList = await heliusRes.json();

    if (!Array.isArray(txList)) {
      return NextResponse.json({ status: "pending" });
    }

    for (const tx of txList) {
      // Skip txs more than 24h before payment was created
      const txTime = (tx.timestamp || 0) * 1000;
      if (txTime < createdAtMs - 86400000) continue;
      if (tx.transactionError) continue;

      // Check tokenTransfers array — Helius parses these cleanly
      const tokenTransfers = tx.tokenTransfers || [];
      for (const transfer of tokenTransfers) {
        if (
          transfer.mint === expectedMint &&
          transfer.toUserAccount === payment.walletAddress &&
          (!expectedAmount || Math.abs(transfer.tokenAmount - expectedAmount) < 0.01)
        ) {
          const txSignature = tx.signature;
          const paidBy = tx.feePayer || "unknown";

          await markPaymentComplete(slug, paidBy, txSignature);

          const merchant = await getMerchantData(payment.walletAddress);

          if (merchant?.expoPushToken) {
            await sendPushNotification(merchant.expoPushToken, payment.amount, payment.label);
          } else {
            try {
              const userSnap = await getDoc(doc(db, "chatfi_users", payment.walletAddress));
              const userData = userSnap.data();
              if (userData?.expoPushToken) {
                await sendPushNotification(userData.expoPushToken, payment.amount, payment.label);
              }
            } catch (e) {}
          }

          if (merchant?.webhookUrl) {
            await fireWebhook(merchant.webhookUrl, payment, txSignature);
          }

          await updateMerchantStats(payment.walletAddress, payment.amount);

          return NextResponse.json({ status: "completed", txSignature });
        }
      }

      // Also check nativeTransfers for SOL payments
      if (payment.token === "SOL") {
        const nativeTransfers = tx.nativeTransfers || [];
        for (const transfer of nativeTransfers) {
          if (
            transfer.toUserAccount === payment.walletAddress &&
            transfer.amount > 0
          ) {
            const txSignature = tx.signature;
            const paidBy = tx.feePayer || "unknown";
            await markPaymentComplete(slug, paidBy, txSignature);
            const merchant = await getMerchantData(payment.walletAddress);
            if (merchant?.expoPushToken) {
              await sendPushNotification(merchant.expoPushToken, payment.amount, payment.label);
            }
            await updateMerchantStats(payment.walletAddress, payment.amount);
            return NextResponse.json({ status: "completed", txSignature });
          }
        }
      }
    }

    return NextResponse.json({ status: "pending" });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
