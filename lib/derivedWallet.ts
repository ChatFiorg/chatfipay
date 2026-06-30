import { Keypair } from "@solana/web3.js";
import crypto from "crypto";

/**
 * Deterministically derives a unique Solana keypair for a given payment ID,
 * using HMAC-SHA256(MASTER_SEED, paymentId) as the 32-byte seed.
 *
 * This means we NEVER store individual private keys — they're always
 * re-derivable from MASTER_SEED + paymentId. Only MASTER_SEED needs to be
 * kept secret (in Vercel env, never in code or Firestore).
 */
export function derivePaymentKeypair(paymentId: string): Keypair {
  const masterSeed = process.env.MASTER_SEED;
  if (!masterSeed) throw new Error("MASTER_SEED not configured");

  const seed = crypto
    .createHmac("sha256", Buffer.from(masterSeed, "hex"))
    .update(paymentId)
    .digest(); // 32 bytes, exactly what Keypair.fromSeed needs

  return Keypair.fromSeed(seed);
}

export function derivePaymentAddress(paymentId: string): string {
  return derivePaymentKeypair(paymentId).publicKey.toBase58();
}
