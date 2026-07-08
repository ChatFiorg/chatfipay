import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { verifyStoreAccess } from "@/lib/storeAccess";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY as string;
const PAYSTACK_BASE_URL = "https://api.paystack.co";

// GET /api/store/[slug]/payments — bank payout account status for this store
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST /api/store/[slug]/payments — connect/update bank payout account
// body: { businessName, bankCode, bankName, accountNumber, percentageCharge? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { businessName, bankCode, bankName, accountNumber, percentageCharge } = body;

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
