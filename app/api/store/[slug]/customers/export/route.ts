import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { verifyStoreAccess } from "@/lib/storeAccess";
import { resolveStaffOrOwner } from "@/lib/staffOrOwnerAuth";
import { notifyStaffDownload } from "@/lib/downloadNotifications";

function csvEscape(v: any): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// GET /api/store/[slug]/customers/export — export customers as CSV.
// Accepts EITHER a staff/owner Bearer token (dashboard login) OR the legacy
// x-api-key header, matching the orders/export pattern.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const authHeader = req.headers.get("authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  let actor: string | null = null;

  if (bearerToken) {
    const auth = await resolveStaffOrOwner(bearerToken, slug);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    actor = auth.actor;
  } else {
    const authorized = await verifyStoreAccess(req, slug);
    if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const snap = await db.collection("stores").doc(slug).collection("customers").get();

    const rows = ["phone,name,email,address,totalSpent,orderCount,tags,notes,firstOrderAt,lastOrderAt"];

    snap.docs.forEach(d => {
      const c = d.data();
      rows.push(
        [
          d.id,
          c.name || "",
          c.email || "",
          c.address || "",
          c.totalSpent || 0,
          c.orderCount || 0,
          Array.isArray(c.tags) ? c.tags.join("; ") : "",
          c.notes || "",
          c.firstOrderAt?.toDate?.()?.toISOString() || "",
          c.lastOrderAt?.toDate?.()?.toISOString() || "",
        ]
          .map(csvEscape)
          .join(",")
      );
    });

    if (actor) {
      await notifyStaffDownload(slug, actor, "customers").catch(e => console.error("notifyStaffDownload failed:", e));
    }

    return new NextResponse(rows.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${slug}-customers.csv"`,
      },
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
