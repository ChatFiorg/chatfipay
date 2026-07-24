import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

const VERCEL_PROJECT_ID = "prj_AMh5p9qlQxZHQKHiJNejQa0PBFvr"; // chatfistore
const VERCEL_TEAM_ID = "team_U19GHjZvbaTVoiTHr7SKpL2n";
const VERCEL_API = "https://api.vercel.com";

function vercelHeaders() {
  return {
    Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`,
    "Content-Type": "application/json",
  };
}

// GET /api/cron/expire-domains — triggered daily by Vercel Cron.
// A custom domain is a paid add-on billed per month (1/3/6/12-month blocks,
// charged once at connect/change time — see /api/store/[slug]/domain). This
// finds stores whose customDomainExpiresAt has passed, removes the domain
// from the Vercel project, and clears the store's custom domain fields so
// it falls back to the free subdomain, matching the manual DELETE flow.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const nowIso = new Date().toISOString();

    const snap = await db.collection("stores")
      .where("customDomain", "!=", null)
      .get();

    let checked = 0;
    let expired = 0;

    for (const doc of snap.docs) {
      const data = doc.data();
      const domain = data.customDomain;
      const expiresAt = data.customDomainExpiresAt;
      if (!domain || !expiresAt) continue;

      checked++;
      if (expiresAt > nowIso) continue; // still active

      await fetch(`${VERCEL_API}/v9/projects/${VERCEL_PROJECT_ID}/domains/${domain}?teamId=${VERCEL_TEAM_ID}`, {
        method: "DELETE",
        headers: vercelHeaders(),
      }).catch(e => console.error(`Failed to remove ${domain} from Vercel:`, e));

      await doc.ref.update({
        customDomain: null,
        customDomainVerified: false,
        customDomainExpiresAt: null,
      });
      await db.collection("domainMappings").doc(domain).delete().catch(() => {});

      expired++;
    }

    return NextResponse.json({ success: true, checked, expired });
  } catch (e: any) {
    console.error("expire-domains cron failed:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
