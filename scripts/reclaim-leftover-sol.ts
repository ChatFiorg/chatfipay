import * as dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.vercel") });

import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import crypto from "crypto";
import * as admin from "firebase-admin";

function derivePaymentKeypair(paymentId: string): Keypair {
  const masterSeed = process.env.MASTER_SEED!;
  const seed = crypto.createHmac("sha256", Buffer.from(masterSeed, "hex")).update(paymentId).digest();
  return Keypair.fromSeed(seed);
}

async function main() {
  const rpcUrl = process.env.HELIUS_RPC_URL!;
  const treasuryKey = process.env.TREASURY_PRIVATE_KEY!;
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT!;

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(serviceAccountRaw)),
    });
  }
  const db = admin.firestore();

  const connection = new Connection(rpcUrl, "confirmed");
  const treasury = Keypair.fromSecretKey(bs58.decode(treasuryKey));
  const RESERVE_LAMPORTS = 6000; // covers the reclaim tx's own network fee

  console.log("Scanning pay_links collection for stranded SOL...\n");

  const snap = await db.collection("pay_links").select().get();
  console.log(`Found ${snap.size} payment records to check.\n`);

  let checked = 0;
  let reclaimedCount = 0;
  let totalReclaimedLamports = 0;

  for (const doc of snap.docs) {
    checked++;
    const paymentId = doc.id;
    try {
      const depositKeypair = derivePaymentKeypair(paymentId);
      const balance = await connection.getBalance(depositKeypair.publicKey);

      if (balance <= RESERVE_LAMPORTS) {
        if (checked % 25 === 0) console.log(`...checked ${checked}/${snap.size}`);
        continue;
      }

      const reclaimable = balance - RESERVE_LAMPORTS;
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: depositKeypair.publicKey,
          toPubkey: treasury.publicKey,
          lamports: reclaimable,
        })
      );
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = depositKeypair.publicKey;

      const sig = await connection.sendTransaction(tx, [depositKeypair]);
      await connection.confirmTransaction(sig, "confirmed");

      reclaimedCount++;
      totalReclaimedLamports += reclaimable;
      console.log(`[${checked}/${snap.size}] Reclaimed ${(reclaimable / 1e9).toFixed(6)} SOL from ${paymentId} -> ${sig}`);
    } catch (e: any) {
      console.error(`[${checked}/${snap.size}] Error on ${paymentId}: ${e.message || e}`);
    }
    // Small delay to stay well under RPC rate limits.
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\nDone. Checked ${checked} addresses, reclaimed from ${reclaimedCount}, total ${(totalReclaimedLamports / 1e9).toFixed(6)} SOL.`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
