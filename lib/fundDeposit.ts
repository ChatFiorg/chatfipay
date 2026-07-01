import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import bs58 from "bs58";

// Solana requires any account holding SOL to either be at 0 or above
// the rent-exemption minimum. Creating the merchant's USDC associated
// token account (if they don't already have one) costs ~2,039,280
// lamports in rent-exemption alone — the previous 1,000,000 lamport
// funding was well short of that and caused every first-time sweep to
// fail with "insufficient lamports". We fund enough to cover ATA
// creation + tx fee + margin. The reclaim step in sweep.ts drains any
// leftover back to the treasury afterward.
const FUNDING_AMOUNT_LAMPORTS = 2_200_000; // 0.0022 SOL

export async function fundDepositAddress(depositAddress: string): Promise<string | null> {
  const rpcUrl = process.env.HELIUS_RPC_URL;
  const treasuryKey = process.env.TREASURY_PRIVATE_KEY;
  if (!rpcUrl) throw new Error("RPC not configured");
  if (!treasuryKey) throw new Error("TREASURY_PRIVATE_KEY not configured");

  const connection = new Connection(rpcUrl, "confirmed");
  const treasury = Keypair.fromSecretKey(bs58.decode(treasuryKey));
  const toPubkey = new PublicKey(depositAddress);

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: treasury.publicKey,
      toPubkey,
      lamports: FUNDING_AMOUNT_LAMPORTS,
    })
  );

  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = treasury.publicKey;

  const sig = await connection.sendTransaction(tx, [treasury]);
  await connection.confirmTransaction(sig, "confirmed");

  return sig;
}
