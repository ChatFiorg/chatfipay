import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { verifyStoreAccess } from "@/lib/storeAccess";
import { validateTheme } from "@/lib/theme/validateTheme";

// POST /api/store/[slug]/theme — upload a custom theme (owner only)
// body: { html: string, css: string }
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { html, css } = body;

    if (typeof html !== "string" || typeof css !== "string") {
      return NextResponse.json({ error: "html and css are required" }, { status: 400 });
    }

    const result = await validateTheme(html, css);
    if (!result.valid) {
      return NextResponse.json({ success: false, errors: result.errors }, { status: 400 });
    }

    const storeSnap = await db.collection("stores").doc(slug).get();
    if (!storeSnap.exists) return NextResponse.json({ error: "Store not found" }, { status: 404 });

    await db.collection("stores").doc(slug).update({
      "customTheme.html": result.sanitizedHtml,
      "customTheme.css": result.sanitizedCss,
      "customTheme.updatedAt": Timestamp.now(),
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
