import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import bs58 from "bs58";

// Just enough for one sweep tx fee (~0.000005 SOL) plus a margin for
// ATA creation when the merchant's USDC token account doesn't exist yet.
const FUNDING_AMOUNT_LAMPORTS = 30_000; // 0.00003 SOL

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
