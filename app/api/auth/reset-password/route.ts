import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/firebaseAdminAuth";
import { normalizeEmail, sendPasswordResetEmail } from "@/lib/buyerAuth";

// POST /api/auth/reset-password — body: { email }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = normalizeEmail(body.email);
    if (!email) return NextResponse.json({ error: "Valid email required" }, { status: 400 });

    // Generate the reset link via Admin SDK (bypasses the broken console Action URL setting).
    const rawLink = await auth.generatePasswordResetLink(email);

    // Extract just the oobCode from Firebase's generated link, and rebuild
    // our own branded URL pointing at the store's custom reset-password page.
    const url = new URL(rawLink);
    const oobCode = url.searchParams.get("oobCode");
    if (!oobCode) throw new Error("Failed to extract reset code");

    const brandedLink = `https://store.chatfi.pro/reset-password?mode=resetPassword&oobCode=${oobCode}`;

    await sendPasswordResetEmail(email, brandedLink);

    const response = NextResponse.json({ success: true });
    response.headers.set("Access-Control-Allow-Origin", "*");
    return response;
  } catch (e: any) {
    console.error(e);
    // Avoid leaking whether an email exists; Firebase throws auth/user-not-found for unknown emails.
    if (e.code === "auth/user-not-found") {
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
