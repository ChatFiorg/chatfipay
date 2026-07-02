import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { normalizeEmail, signStaffToken } from "@/lib/staffAuth";
import { hashOtp } from "@/lib/buyerAuth";

const MAX_ATTEMPTS = 5;

// POST /api/store/[slug]/staff/auth/verify-otp — body: { email, code }
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const body = await req.json();
    const email = normalizeEmail(body.email);
    const code = (body.code || "").trim();
    if (!email || !code) return NextResponse.json({ error: "Email and code required" }, { status: 400 });

    const otpRef = db.collection("stores").doc(slug).collection("staffOtps").doc(email);
    const otpSnap = await otpRef.get();
    if (!otpSnap.exists) return NextResponse.json({ error: "No OTP requested for this email" }, { status: 400 });

    const otpData = otpSnap.data()!;
    const now = Timestamp.now();

    if (otpData.expiresAt.toMillis() < now.toMillis()) {
      return NextResponse.json({ error: "OTP expired, request a new one" }, { status: 400 });
    }
    if ((otpData.attempts || 0) >= MAX_ATTEMPTS) {
      return NextResponse.json({ error: "Too many attempts, request a new OTP" }, { status: 429 });
    }

    const salt = process.env.BUYER_AUTH_SECRET || "chatfi";
    const expectedHash = hashOtp(code, salt);
    if (expectedHash !== otpData.otpHash) {
      await otpRef.update({ attempts: (otpData.attempts || 0) + 1 });
      return NextResponse.json({ error: "Invalid OTP" }, { status: 400 });
    }
    await otpRef.delete();

    const staffRef = db.collection("stores").doc(slug).collection("staff").doc(email);
    const staffSnap = await staffRef.get();
    if (!staffSnap.exists) return NextResponse.json({ error: "Staff record not found" }, { status: 404 });
    const staffData = staffSnap.data()!;

    await staffRef.update({ status: "active", lastLoginAt: now });

    const permissions = staffData.permissions || { orders: false, products: false };
    const token = signStaffToken(slug, email, permissions);

    return NextResponse.json({ success: true, token, email, permissions });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
