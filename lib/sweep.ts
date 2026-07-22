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
import { fundDepositAddress } from "./fundDeposit";

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
// Rent-exemption cost for a new SPL token account (paid by depositKeypair
// when creating the merchant's ATA within this same transaction).
const ATA_RENT_LAMPORTS = 2_039_280;
// Flat network-fee surcharge (in USDC base units, 6 decimals) charged to
// the buyer at checkout and redirected to treasury here instead of being
// sent to the merchant. Keep in sync with FEE_USDC in charge/route.ts.
const FEE_USDC_LAMPORTS = BigInt(200_000); // 0.2 USDC

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
  let rentNeeded = 0;

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
    rentNeeded += ATA_RENT_LAMPORTS;
  }

  // Split the swept balance: merchant gets the sale amount, treasury
  // gets the flat network-fee surcharge the buyer already paid at
  // checkout (see FEE_USDC in charge/route.ts). If the balance is
  // somehow smaller than the fee (shouldn't happen in practice), skip
  // the fee split entirely rather than sending the merchant a negative
  // or zero amount.
  const treasuryKeyForFee = process.env.TREASURY_PRIVATE_KEY;
  let feeAmount = BigInt(0);
  let merchantAmount = fromAccount.amount;
  let treasuryAta: PublicKey | null = null;

  if (treasuryKeyForFee && fromAccount.amount > FEE_USDC_LAMPORTS) {
    const treasuryPubkeyForFee = Keypair.fromSecretKey(bs58.decode(treasuryKeyForFee)).publicKey;
    treasuryAta = await getAssociatedTokenAddress(USDC_MINT, treasuryPubkeyForFee);
    const treasuryAccount = await getAccount(connection, treasuryAta).catch(() => null);
    if (!treasuryAccount) {
      tx.add(
        createAssociatedTokenAccountInstruction(
          depositKeypair.publicKey,
          treasuryAta,
          treasuryPubkeyForFee,
          USDC_MINT
        )
      );
      rentNeeded += ATA_RENT_LAMPORTS;
    }
    feeAmount = FEE_USDC_LAMPORTS;
    merchantAmount = fromAccount.amount - FEE_USDC_LAMPORTS;
  }

  tx.add(
    createTransferInstruction(
      fromAta,
      toAta,
      depositKeypair.publicKey,
      merchantAmount
    )
  );

  if (feeAmount > BigInt(0) && treasuryAta) {
    tx.add(
      createTransferInstruction(
        fromAta,
        treasuryAta,
        depositKeypair.publicKey,
        feeAmount
      )
    );
  }

  // Fund the deposit address now that we know a real payment landed
  // (fromAccount.amount > 0, checked above), instead of pre-funding
  // every generated payment link at creation time.
  const estimatedFee = 5000; // lamports, conservative pre-compile estimate
  const requiredLamports = rentNeeded + estimatedFee + 50_000; // margin
  const depositBalance = await connection.getBalance(depositKeypair.publicKey);
  if (depositBalance < requiredLamports) {
    try {
      await fundDepositAddress(depositAddress);
    } catch (e) {
      console.error("Failed to fund deposit address before sweep:", e);
    }
  }

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
