import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { verifyStoreAccess } from "@/lib/storeAccess";
import { validateTheme } from "@/lib/theme/validateTheme";

interface SectionInput {
  instanceId: string;
  order: number;
  visible: boolean;
  html: string;
  css: string;
}

// POST /api/store/[slug]/premium-theme/sections
// body: { sections: SectionInput[] } — saves reordering, visibility, and
// edited content (text/link/image regions) for the store's active premium
// theme. Each section's html/css is re-validated through the same
// sanitizer used for full custom themes, since merchants can edit the
// underlying markup via the editable-regions system.
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const sections: SectionInput[] = Array.isArray(body.sections) ? body.sections : [];
    if (sections.length === 0) return NextResponse.json({ error: "sections is required" }, { status: 400 });

    const storeSnap = await db.collection("stores").doc(slug).get();
    if (!storeSnap.exists) return NextResponse.json({ error: "Store not found" }, { status: 404 });
    const store = storeSnap.data()!;
    const themeId = store.premiumTheme?.themeId;
    if (!themeId) return NextResponse.json({ error: "No active premium theme" }, { status: 400 });

    const validatedSections = [];
    for (const s of sections) {
      const result = await validateTheme(s.html, s.css);
      if (!result.valid) {
        return NextResponse.json({ error: `Section "${s.instanceId}" failed validation`, details: result.errors }, { status: 400 });
      }
      validatedSections.push({
        instanceId: s.instanceId,
        order: s.order,
        visible: !!s.visible,
        html: result.sanitizedHtml,
        css: result.sanitizedCss,
      });
    }

    validatedSections.sort((a, b) => a.order - b.order);

    await db.collection("stores").doc(slug).set({
      premiumTheme: {
        themeId,
        sections: validatedSections,
        updatedAt: Timestamp.now(),
      },
      [`premiumThemeSaves.${themeId}`]: validatedSections,
    }, { merge: true });

    return NextResponse.json({ success: true, sections: validatedSections });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
