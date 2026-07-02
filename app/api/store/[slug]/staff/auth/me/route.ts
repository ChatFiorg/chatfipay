import { NextRequest, NextResponse } from "next/server";
import { verifyStaffToken } from "@/lib/staffAuth";

// GET /api/store/[slug]/staff/auth/me — Authorization: Bearer <token>
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const payload = verifyStaffToken(token);

  if (!payload || payload.slug !== slug) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    email: payload.email,
    permissions: payload.permissions,
  });
}
