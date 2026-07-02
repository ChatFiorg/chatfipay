import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { normalizeEmail, sendStaffOtpEmail } from "@/lib/staffAuth";
import { generateOtp, hashOtp } from "@/lib/buyerAuth";

// POST /api/store/[slug]/staff/auth/request-otp — body: { email }
// Unlike buyer auth, this requires an existing invited/active staff record —
// staff cannot self-register.
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const body = await req.json();
    const email = normalizeEmail(body.email);
    if (!email) return NextResponse.json({ error: "Valid email required" }, { status: 400 });

    const staffRef = db.collection("stores").doc(slug).collection("staff").doc(email);
    const staffSnap = await staffRef.get();
    if (!staffSnap.exists) {
      return NextResponse.json({ error: "This email has not been invited to this store" }, { status: 403 });
    }

    const storeSnap = await db.collection("stores").doc(slug).get();
    if (!storeSnap.exists) return NextResponse.json({ error: "Store not found" }, { status: 404 });
    const store = storeSnap.data()!;

    const otp = generateOtp();
    const salt = process.env.BUYER_AUTH_SECRET || "chatfi";
    const otpHash = hashOtp(otp, salt);
    const now = Timestamp.now();
    const expiresAt = Timestamp.fromMillis(now.toMillis() + 5 * 60 * 1000);

    await db.collection("stores").doc(slug).collection("staffOtps").doc(email).set({
      otpHash, expiresAt, attempts: 0, createdAt: now,
    });

    await sendStaffOtpEmail(email, otp, store.name || slug);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
