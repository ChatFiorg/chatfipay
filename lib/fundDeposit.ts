import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import bs58 from "bs58";

// Solana requires any account holding SOL to either be at 0 or above
// the rent-exemption minimum (~890,880 lamports for a 0-byte account).
// We fund just above that minimum, covering rent-exemption + the sweep
// transaction's fee + ATA creation if needed. The reclaim step in
// sweep.ts drains it back to exactly 0 afterward (zero balance is
// always allowed, it's only small-nonzero that gets rejected).
const FUNDING_AMOUNT_LAMPORTS = 1_000_000; // 0.001 SOL

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
