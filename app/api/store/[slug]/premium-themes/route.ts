import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { verifyStoreAccess } from "@/lib/storeAccess";
import { deductWallet, InsufficientBalanceError } from "@/lib/wallet";
import { PREMIUM_THEMES, getPremiumTheme } from "@/lib/premiumThemes/catalog";

// GET /api/store/[slug]/premium-themes — catalog + this store's purchase/active status
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const storeSnap = await db.collection("stores").doc(slug).get();
    if (!storeSnap.exists) return NextResponse.json({ error: "Store not found" }, { status: 404 });
    const store = storeSnap.data()!;
    const purchasedThemeIds: string[] = store.purchasedThemeIds || [];
    const activeThemeId: string | null = store.premiumTheme?.themeId || null;

    const catalog = PREMIUM_THEMES.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      price: t.price,
      previewImage: t.previewImage,
      sectionCount: t.sections.length,
      purchased: purchasedThemeIds.includes(t.id),
      active: activeThemeId === t.id,
    }));

    return NextResponse.json({
      themes: catalog,
      activeThemeId,
      sections: activeThemeId ? store.premiumTheme?.sections || [] : [],
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}

// POST /api/store/[slug]/premium-themes — body: { themeId } — purchase (or
// re-activate an already-purchased) theme. Purchasing clones the catalog's
// default sections onto the store's own doc, so future edits never touch
// the shared catalog definition.
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const themeId = String(body.themeId || "");
    const theme = getPremiumTheme(themeId);
    if (!theme) return NextResponse.json({ error: "Unknown theme" }, { status: 400 });

    const storeSnap = await db.collection("stores").doc(slug).get();
    if (!storeSnap.exists) return NextResponse.json({ error: "Store not found" }, { status: 404 });
    const store = storeSnap.data()!;
    const purchasedThemeIds: string[] = store.purchasedThemeIds || [];
    const alreadyOwned = purchasedThemeIds.includes(themeId);

    if (!alreadyOwned) {
      try {
        await deductWallet(slug, theme.price);
      } catch (e) {
        if (e instanceof InsufficientBalanceError) {
          return NextResponse.json({ error: e.message, required: e.required, available: e.available }, { status: 402 });
        }
        throw e;
      }
    }

    // Clone catalog sections into the store's own editable copy, giving each
    // section instance a unique id (so buying the same theme twice, or
    // re-activating after switching away, always starts from a clean slate
    // unless the store already has a saved copy for this theme).
    const existingSections = store.premiumThemeSaves?.[themeId];
    const sections = existingSections || theme.sections.map((s, i) => ({
      ...s,
      instanceId: `${themeId}-${s.id}`,
      order: i,
      visible: true,
    }));

    await db.collection("stores").doc(slug).set({
      purchasedThemeIds: alreadyOwned ? purchasedThemeIds : [...purchasedThemeIds, themeId],
      template: "premium",
      premiumTheme: {
        themeId,
        sections,
        updatedAt: Timestamp.now(),
      },
    }, { merge: true });

    return NextResponse.json({ success: true, themeId, sections, amountCharged: alreadyOwned ? 0 : theme.price });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
