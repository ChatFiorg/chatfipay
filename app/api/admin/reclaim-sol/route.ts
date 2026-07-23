import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import crypto from "crypto";

function derivePaymentKeypair(paymentId: string): Keypair {
  const masterSeed = process.env.MASTER_SEED!;
  const seed = crypto.createHmac("sha256", Buffer.from(masterSeed, "hex")).update(paymentId).digest();
  return Keypair.fromSeed(seed);
}

const RESERVE_LAMPORTS = 6000;
const BATCH_SIZE = 150;

// POST /api/admin/reclaim-sol?cursor=<lastDocId>
// One-off cleanup: scans pay_links, derives each deposit address, and
// sweeps any stranded SOL (left over from before the lazy-funding fix)
// back to treasury. Paginated via `cursor` since a full scan can exceed
// one function invocation's time limit. Delete this route after use.
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rpcUrl = process.env.HELIUS_RPC_URL;
  const treasuryKey = process.env.TREASURY_PRIVATE_KEY;
  if (!rpcUrl || !treasuryKey) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor");

  try {
    let query = db.collection("pay_links").orderBy("__name__").limit(BATCH_SIZE);
    if (cursor) {
      const cursorDoc = await db.collection("pay_links").doc(cursor).get();
      if (cursorDoc.exists) query = query.startAfter(cursorDoc);
    }
    const snap = await query.get();

    const connection = new Connection(rpcUrl, "confirmed");
    const treasury = Keypair.fromSecretKey(bs58.decode(treasuryKey));

    const results: { id: string; reclaimedSol?: number; sig?: string; error?: string }[] = [];
    let totalReclaimedLamports = 0;

    for (const doc of snap.docs) {
      const paymentId = doc.id;
      try {
        const depositKeypair = derivePaymentKeypair(paymentId);
        const balance = await connection.getBalance(depositKeypair.publicKey);
        if (balance <= RESERVE_LAMPORTS) continue;

        // Solana requires an account to be either exactly 0 or above the
        // rent-exemption minimum — leaving a small nonzero "reserve" behind
        // is invalid and the transfer will fail simulation. So we compute the
        // real network fee for this exact transaction and drain to exactly 0.
        const probeTx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: depositKeypair.publicKey,
            toPubkey: treasury.publicKey,
            lamports: 1,
          })
        );
        const { blockhash } = await connection.getLatestBlockhash();
        probeTx.recentBlockhash = blockhash;
        probeTx.feePayer = depositKeypair.publicKey;
        const feeCalc = await connection.getFeeForMessage(probeTx.compileMessage(), "confirmed");
        const fee = feeCalc?.value || 5000;

        const reclaimable = balance - fee;
        if (reclaimable <= 0) continue;

        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: depositKeypair.publicKey,
            toPubkey: treasury.publicKey,
            lamports: reclaimable,
          })
        );
        tx.recentBlockhash = blockhash;
        tx.feePayer = depositKeypair.publicKey;

        const sig = await connection.sendTransaction(tx, [depositKeypair]);
        await connection.confirmTransaction(sig, "confirmed");

        totalReclaimedLamports += reclaimable;
        results.push({ id: paymentId, reclaimedSol: reclaimable / 1e9, sig });
      } catch (e: any) {
        results.push({ id: paymentId, error: e.message || String(e) });
      }
    }

    const lastDoc = snap.docs[snap.docs.length - 1];
    return NextResponse.json({
      checked: snap.docs.length,
      reclaimed: results.filter((r) => r.reclaimedSol).length,
      totalReclaimedSol: totalReclaimedLamports / 1e9,
      nextCursor: snap.docs.length === BATCH_SIZE ? lastDoc.id : null,
      results,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
