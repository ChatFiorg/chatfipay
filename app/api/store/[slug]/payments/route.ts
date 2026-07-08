import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { verifyStoreAccess } from "@/lib/storeAccess";
import { PublicKey } from "@solana/web3.js";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY as string;
const PAYSTACK_BASE_URL = "https://api.paystack.co";

// Legacy fallback: mobile app has no owner-token flow yet, so it sends the
// raw wallet address directly (same pattern already used by /api/store and
// /api/store/products). Verified against the wallet's own usernames array.
async function legacyOwnerWalletMatches(slug: string, ownerWallet: string | null): Promise<boolean> {
  if (!ownerWallet) return false;
  const snap = await db.collection("storeWallets").doc(ownerWallet).get();
  if (!snap.exists) return false;
  const usernames: string[] = snap.data()?.usernames || [];
  return usernames.includes(slug);
}

// GET /api/store/[slug]/payments?ownerWallet=xxx — bank payout account status for this store
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) {
    const { searchParams } = new URL(req.url);
    const legacyOk = await legacyOwnerWalletMatches(slug, searchParams.get("ownerWallet"));
    if (!legacyOk) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const snap = await db.collection("stores").doc(slug).get();
    const data = snap.exists ? snap.data()! : {};
    const payout = data.payoutAccount || {};

    return NextResponse.json({
      success: true,
      connected: !!payout.subaccountCode,
      accountName: payout.accountName || "",
      bankName: payout.bankName || "",
      accountNumber: payout.accountNumberMasked || "",
      verified: payout.verified || false,
      cryptoPayoutWallet: data.cryptoPayoutWallet || "",
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST /api/store/[slug]/payments — connect/update bank payout account
// body: { businessName, bankCode, bankName, accountNumber, percentageCharge?, ownerWallet? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const body = await req.json();
    const { businessName, bankCode, bankName, accountNumber, percentageCharge, ownerWallet, cryptoPayoutWallet } = body;

    const authorized = await verifyStoreAccess(req, slug);
    if (!authorized) {
      const legacyOk = await legacyOwnerWalletMatches(slug, ownerWallet || null);
      if (!legacyOk) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Crypto payout wallet can be saved independently of the bank flow below,
    // so an owner without a Solana wallet on their profile (email/Google
    // signup) can still receive USDC payments by pasting in an external
    // wallet address (e.g. Phantom/Solflare) here.
    if (cryptoPayoutWallet !== undefined && !businessName && !bankCode && !accountNumber) {
      const trimmed = String(cryptoPayoutWallet).trim();
      if (!trimmed) {
        await db.collection("stores").doc(slug).set({ cryptoPayoutWallet: "" }, { merge: true });
        return NextResponse.json({ success: true, cryptoPayoutWallet: "" });
      }
      try {
        const validated = new PublicKey(trimmed).toBase58();
        await db.collection("stores").doc(slug).set({ cryptoPayoutWallet: validated }, { merge: true });
        return NextResponse.json({ success: true, cryptoPayoutWallet: validated });
      } catch {
        return NextResponse.json({ error: "That doesn't look like a valid Solana wallet address" }, { status: 400 });
      }
    }

    if (!businessName) return NextResponse.json({ error: "Missing businessName" }, { status: 400 });
    if (!bankCode) return NextResponse.json({ error: "Missing bankCode" }, { status: 400 });
    if (!accountNumber) return NextResponse.json({ error: "Missing accountNumber" }, { status: 400 });

    if (!PAYSTACK_SECRET_KEY) {
      console.error("Missing PAYSTACK_SECRET_KEY env var");
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    const resolveRes = await fetch(
      `${PAYSTACK_BASE_URL}/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } }
    );
    const resolveData = await resolveRes.json();

    if (!resolveRes.ok || !resolveData.status) {
      return NextResponse.json({ error: resolveData.message || "Could not verify account number" }, { status: 400 });
    }

    const resolvedAccountName = resolveData.data.account_name;

    const subaccountRes = await fetch(`${PAYSTACK_BASE_URL}/subaccount`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        business_name: businessName,
        bank_code: bankCode,
        account_number: accountNumber,
        percentage_charge: percentageCharge ?? 0,
      }),
    });
    const subaccountData = await subaccountRes.json();

    if (!subaccountRes.ok || !subaccountData.status) {
      return NextResponse.json({ error: subaccountData.message || "Could not create subaccount" }, { status: 400 });
    }

    const subaccountCode = subaccountData.data.subaccount_code;
    const maskedAccountNumber = `****${accountNumber.slice(-4)}`;

    await db.collection("stores").doc(slug).set(
      {
        payoutAccount: {
          subaccountCode,
          bankCode,
          bankName: bankName || "",
          accountNumberMasked: maskedAccountNumber,
          accountName: resolvedAccountName,
          verified: true,
          updatedAt: new Date().toISOString(),
        },
      },
      { merge: true }
    );

    return NextResponse.json({ success: true, subaccountCode, accountName: resolvedAccountName });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
