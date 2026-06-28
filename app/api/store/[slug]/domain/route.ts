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

function dnsInstructionsFor(domain: string) {
  const parts = domain.split(".");
  const isApex = parts.length === 2; // e.g. example.com
  if (isApex) {
    return { type: "apex", recordType: "A", name: "@", value: "76.76.21.21" };
  }
  const subPart = parts.slice(0, parts.length - 2).join(".");
  return { type: "subdomain", recordType: "CNAME", name: subPart, value: "cname.vercel-dns.com" };
}

async function verifyOwner(slug: string, ownerWallet: string) {
  const snap = await db.collection("stores").doc(slug).get();
  if (!snap.exists) return { ok: false, status: 404, error: "Store not found" };
  const data = snap.data()!;
  if (data.ownerWallet !== ownerWallet) return { ok: false, status: 403, error: "Not authorized for this store" };
  return { ok: true, data };
}

// POST /api/store/[slug]/domain — attach a custom domain
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const body = await req.json();
    const { domain, ownerWallet } = body;
    if (!domain || !ownerWallet) return NextResponse.json({ error: "Missing domain or ownerWallet" }, { status: 400 });

    const cleanDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(cleanDomain)) {
      return NextResponse.json({ error: "Invalid domain format" }, { status: 400 });
    }

    const auth = await verifyOwner(slug, ownerWallet);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    // Reject if this domain is already mapped to a different store
    const existingMapping = await db.collection("domainMappings").doc(cleanDomain).get();
    if (existingMapping.exists && existingMapping.data()!.username !== slug) {
      return NextResponse.json({ error: "This domain is already connected to another store" }, { status: 409 });
    }

    const vercelRes = await fetch(
      `${VERCEL_API}/v10/projects/${VERCEL_PROJECT_ID}/domains?teamId=${VERCEL_TEAM_ID}`,
      { method: "POST", headers: vercelHeaders(), body: JSON.stringify({ name: cleanDomain }) }
    );
    const vercelData = await vercelRes.json();

    if (!vercelRes.ok) {
      return NextResponse.json({ error: vercelData?.error?.message || "Failed to add domain on Vercel" }, { status: vercelRes.status });
    }

    await db.collection("stores").doc(slug).set({
      customDomain: cleanDomain,
      customDomainVerified: !!vercelData.verified,
      customDomainAddedAt: new Date().toISOString(),
    }, { merge: true });

    await db.collection("domainMappings").doc(cleanDomain).set({ username: slug, addedAt: new Date().toISOString() });

    return NextResponse.json({
      success: true,
      domain: cleanDomain,
      verified: !!vercelData.verified,
      verification: vercelData.verification || [],
      dns: dnsInstructionsFor(cleanDomain),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// GET /api/store/[slug]/domain — check verification + DNS status
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const snap = await db.collection("stores").doc(slug).get();
    if (!snap.exists) return NextResponse.json({ error: "Store not found" }, { status: 404 });
    const data = snap.data()!;
    const domain = data.customDomain;
    if (!domain) return NextResponse.json({ domain: null });

    const statusRes = await fetch(
      `${VERCEL_API}/v9/projects/${VERCEL_PROJECT_ID}/domains/${domain}?teamId=${VERCEL_TEAM_ID}`,
      { headers: vercelHeaders() }
    );
    const statusData = await statusRes.json();

    const configRes = await fetch(`${VERCEL_API}/v6/domains/${domain}/config?teamId=${VERCEL_TEAM_ID}`, { headers: vercelHeaders() });
    const configData = await configRes.json();

    const verified = !!statusData.verified;
    await db.collection("stores").doc(slug).update({ customDomainVerified: verified });

    return NextResponse.json({
      domain,
      verified,
      misconfigured: !!configData.misconfigured,
      verification: statusData.verification || [],
      dns: dnsInstructionsFor(domain),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE /api/store/[slug]/domain — remove the custom domain
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const body = await req.json();
    const { ownerWallet } = body;
    if (!ownerWallet) return NextResponse.json({ error: "Missing ownerWallet" }, { status: 400 });

    const auth = await verifyOwner(slug, ownerWallet);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const domain = auth.data!.customDomain;
    if (!domain) return NextResponse.json({ error: "No custom domain set" }, { status: 400 });

    await fetch(`${VERCEL_API}/v9/projects/${VERCEL_PROJECT_ID}/domains/${domain}?teamId=${VERCEL_TEAM_ID}`, {
      method: "DELETE",
      headers: vercelHeaders(),
    });

    await db.collection("stores").doc(slug).update({
      customDomain: null,
      customDomainVerified: false,
    });
    await db.collection("domainMappings").doc(domain).delete();

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
