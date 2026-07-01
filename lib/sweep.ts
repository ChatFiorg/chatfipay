import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  Keypair,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
} from "@solana/spl-token";
import bs58 from "bs58";
import { derivePaymentKeypair } from "./derivedWallet";

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
// Rent-exemption cost for a new SPL token account (paid by depositKeypair
// when creating the merchant's ATA within this same transaction).
const ATA_RENT_LAMPORTS = 2_039_280;

export async function sweepPayment(
  paymentId: string,
  depositAddress: string,
  merchantWallet: string
): Promise<string | null> {
  const rpcUrl = process.env.HELIUS_RPC_URL;
  const treasuryKey = process.env.TREASURY_PRIVATE_KEY;
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
  const needsAtaCreation = !toAccount;
  if (needsAtaCreation) {
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

  if (treasuryKey) {
    try {
      const treasuryPubkey = Keypair.fromSecretKey(bs58.decode(treasuryKey)).publicKey;
      const currentBalance = await connection.getBalance(depositKeypair.publicKey);
      const { blockhash: probeBlockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = probeBlockhash;
      tx.feePayer = depositKeypair.publicKey;

      const feeCalc = await connection.getFeeForMessage(tx.compileMessage(), "confirmed");
      const fee = feeCalc?.value || 5000;
      // Must account for ATA rent paid out of this same balance, or the
      // reclaim transfer over-commits and the whole tx fails.
      const reclaimable = currentBalance - fee - (needsAtaCreation ? ATA_RENT_LAMPORTS : 0);

      if (reclaimable > 0) {
        tx.add(
          SystemProgram.transfer({
            fromPubkey: depositKeypair.publicKey,
            toPubkey: treasuryPubkey,
            lamports: reclaimable,
          })
        );
      }
    } catch (e) {
      console.error("SOL reclaim estimation failed, skipping reclaim:", e);
    }
  }

  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = depositKeypair.publicKey;

  const sig = await connection.sendTransaction(tx, [depositKeypair]);
  await connection.confirmTransaction(sig, "confirmed");

  return sig;
}
