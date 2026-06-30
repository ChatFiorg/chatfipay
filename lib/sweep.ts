import {
  Connection,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
} from "@solana/spl-token";
import { derivePaymentKeypair } from "./derivedWallet";

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

/**
 * Sweeps the full USDC balance from a payment's unique derived deposit
 * address to the merchant's main wallet. Called right after a payment
 * is confirmed. The deposit keypair is re-derived on the fly (never
 * stored), used once to sign the sweep, then discarded.
 */
export async function sweepPayment(
  paymentId: string,
  depositAddress: string,
  merchantWallet: string
): Promise<string | null> {
  const rpcUrl = process.env.HELIUS_RPC_URL;
  if (!rpcUrl) throw new Error("RPC not configured");
  if (!merchantWallet) throw new Error("No merchant wallet to sweep to");

  const connection = new Connection(rpcUrl, "confirmed");
  const depositKeypair = derivePaymentKeypair(paymentId);

  if (depositKeypair.publicKey.toBase58() !== depositAddress) {
    throw new Error("Derived keypair does not match stored deposit address");
  }

  const merchantPubkey = new PublicKey(merchantWallet);
  const fromAta = await getAssociatedTokenAddress(USDC_MINT, depositKeypair.publicKey);
  const toAta = await getAssociatedTokenAddress(USDC_MINT, merchantPubkey);

  const fromAccount = await getAccount(connection, fromAta).catch(() => null);
  if (!fromAccount || fromAccount.amount === BigInt(0)) {
    return null;
  }

  const tx = new Transaction();

  const toAccount = await getAccount(connection, toAta).catch(() => null);
  if (!toAccount) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        depositKeypair.publicKey,
        toAta,
        merchantPubkey,
        USDC_MINT
      )
    );
  }

  tx.add(
    createTransferInstruction(
      fromAta,
      toAta,
      depositKeypair.publicKey,
      fromAccount.amount
    )
  );

  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = depositKeypair.publicKey;

  const sig = await connection.sendTransaction(tx, [depositKeypair]);
  await connection.confirmTransaction(sig, "confirmed");

  return sig;
}
