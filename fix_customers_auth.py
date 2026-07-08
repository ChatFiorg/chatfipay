import pathlib

# --- customers/route.ts (list) ---
p1 = pathlib.Path("app/api/store/[slug]/customers/route.ts")
s1 = p1.read_text()

old1 = '''import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

async function getStoreByApiKey(apiKey: string | null, slug: string) {
  if (!apiKey) return null;
  const snap = await db.collection("storeKeys").doc(slug).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  if (data.apiKey !== apiKey) return null;
  return data;
}

// GET /api/store/[slug]/customers — list customers for this store, sorted by most recent order
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const apiKey = req.headers.get("x-api-key");
  const storeKey = await getStoreByApiKey(apiKey, slug);
  if (!storeKey) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });'''

new1 = '''import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { verifyStoreAccess } from "@/lib/storeAccess";

// GET /api/store/[slug]/customers — list customers for this store, sorted by most recent order
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });'''

if old1 not in s1:
    raise SystemExit("customers list auth block not found — aborting")
s1 = s1.replace(old1, new1)
p1.write_text(s1)
print("done customers list")

# --- customers/[phone]/route.ts (detail + PATCH) ---
p2 = pathlib.Path("app/api/store/[slug]/customers/[phone]/route.ts")
s2 = p2.read_text()

old2 = '''import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

async function getStoreByApiKey(apiKey: string | null, slug: string) {
  if (!apiKey) return null;
  const snap = await db.collection("storeKeys").doc(slug).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  if (data.apiKey !== apiKey) return null;
  return data;
}

// GET /api/store/[slug]/customers/[phone] — one customer + their order history
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; phone: string }> }) {
  const { slug, phone } = await params;
  const apiKey = req.headers.get("x-api-key");
  const storeKey = await getStoreByApiKey(apiKey, slug);
  if (!storeKey) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });'''

new2 = '''import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { verifyStoreAccess } from "@/lib/storeAccess";

// GET /api/store/[slug]/customers/[phone] — one customer + their order history
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; phone: string }> }) {
  const { slug, phone } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });'''

if old2 not in s2:
    raise SystemExit("customers detail auth block not found — aborting")
s2 = s2.replace(old2, new2)

old3 = '''// PATCH /api/store/[slug]/customers/[phone] — update a customer's tags (owner only)
// body: { tags: string[] }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string; phone: string }> }) {
  const { slug, phone } = await params;
  const apiKey = req.headers.get("x-api-key");
  const storeKey = await getStoreByApiKey(apiKey, slug);
  if (!storeKey) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });'''

new3 = '''// PATCH /api/store/[slug]/customers/[phone] — update a customer's tags (owner only)
// body: { tags: string[] }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string; phone: string }> }) {
  const { slug, phone } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });'''

if old3 not in s2:
    raise SystemExit("customers PATCH auth block not found — aborting")
s2 = s2.replace(old3, new3)

p2.write_text(s2)
print("done customers detail")
