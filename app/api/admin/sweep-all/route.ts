import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
} from "@solana/spl-token";
import crypto from "crypto";

const SWEEP_SECRET = "chatfi_sweepall_7k2m91q";
const DESTINATION = new PublicKey("2zm31D4B1pD5Sm4nz7FWG954avWAuNeJJvPuELi8d7Kf");
const ATA_RENT_LAMPORTS = 2_039_280;
const MIN_SOL_TO_BOTHER = 3_000; // dust threshold, lamports

const MINTS = [
  { name: "USDC", pubkey: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v") },
  { name: "USDT", pubkey: new PublicKey("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB") },
];

function derivePaymentKeypair(paymentId: string): Keypair {
  const masterSeed = process.env.MASTER_SEED;
  if (!masterSeed) throw new Error("MASTER_SEED not configured");
  const seed = crypto
    .createHmac("sha256", Buffer.from(masterSeed, "hex"))
    .update(paymentId)
    .digest();
  return Keypair.fromSeed(seed);
}

// GET /api/admin/sweep-all?secret=...&dryRun=true|false
// Enumerates every pay_links doc, re-derives its deposit keypair, checks
// SOL + USDC + USDT balances, and sweeps anything found to DESTINATION.
// dryRun defaults to true — pass dryRun=false to actually send transactions.
// DELETE THIS ROUTE after use.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("secret") !== SWEEP_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dryRun = searchParams.get("dryRun") !== "false";

  const rpcUrl = process.env.HELIUS_RPC_URL;
  if (!rpcUrl) return NextResponse.json({ error: "RPC not configured" }, { status: 500 });
  const connection = new Connection(rpcUrl, "confirmed");

  const linksSnap = await db.collection("pay_links").limit(1000).get();
  const results: any[] = [];

  for (const linkDoc of linksSnap.docs) {
    const paymentId = linkDoc.id;
    let keypair: Keypair;
    try {
      keypair = derivePaymentKeypair(paymentId);
    } catch (e: any) {
      results.push({ paymentId, error: "derive failed: " + e.message });
      continue;
    }

    try {
      const solBalance = await connection.getBalance(keypair.publicKey);

      const tokenFindings: { mint: string; amount: string; ata: string }[] = [];
      for (const { name, pubkey: mintPubkey } of MINTS) {
        const fromAta = await getAssociatedTokenAddress(mintPubkey, keypair.publicKey);
        const account = await getAccount(connection, fromAta).catch(() => null);
        if (account && account.amount > BigInt(0)) {
          tokenFindings.push({ mint: name, amount: account.amount.toString(), ata: fromAta.toBase58() });
        }
      }

      if (tokenFindings.length === 0 && solBalance < MIN_SOL_TO_BOTHER) {
        continue;
      }

      const entry: any = {
        paymentId,
        address: keypair.publicKey.toBase58(),
        solBalanceLamports: solBalance,
        tokens: tokenFindings,
      };

      if (dryRun) {
        entry.dryRun = true;
        results.push(entry);
        continue;
      }

      const tx = new Transaction();
      let ataRentSpent = 0;

      for (const finding of tokenFindings) {
        const mintPubkey = MINTS.find(m => m.name === finding.mint)!.pubkey;
        const fromAta = new PublicKey(finding.ata);
        const toAta = await getAssociatedTokenAddress(mintPubkey, DESTINATION);
        const toAccount = await getAccount(connection, toAta).catch(() => null);
        if (!toAccount) {
          tx.add(
            createAssociatedTokenAccountInstruction(keypair.publicKey, toAta, DESTINATION, mintPubkey)
          );
          ataRentSpent += ATA_RENT_LAMPORTS;
        }
        tx.add(
          createTransferInstruction(fromAta, toAta, keypair.publicKey, BigInt(finding.amount))
        );
      }

      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = keypair.publicKey;

      const feeCalc = await connection.getFeeForMessage(tx.compileMessage(), "confirmed");
      const fee = feeCalc?.value || 5000;
      const reclaimable = solBalance - fee - ataRentSpent;

      if (reclaimable > 0) {
        tx.add(
          SystemProgram.transfer({
            fromPubkey: keypair.publicKey,
            toPubkey: DESTINATION,
            lamports: reclaimable,
          })
        );
      }

      const { blockhash: finalBlockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = finalBlockhash;
      tx.feePayer = keypair.publicKey;

      const sig = await connection.sendTransaction(tx, [keypair]);
      await connection.confirmTransaction(sig, "confirmed");

      entry.swept = true;
      entry.txSignature = sig;
      entry.reclaimedLamports = reclaimable > 0 ? reclaimable : 0;
      results.push(entry);
    } catch (e: any) {
      results.push({ paymentId, address: keypair.publicKey.toBase58(), error: e.message || String(e) });
    }
  }

  return NextResponse.json({
    dryRun,
    scanned: linksSnap.docs.length,
    found: results.length,
    results,
  });
}
