import pathlib

# --- discounts/route.ts (list + create) ---
p1 = pathlib.Path("app/api/store/[slug]/discounts/route.ts")
s1 = p1.read_text()

old_helper = '''import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

async function getStoreByApiKey(apiKey: string | null, slug: string) {
  if (!apiKey) return null;
  const snap = await db.collection("storeKeys").doc(slug).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  if (data.apiKey !== apiKey) return null;
  return data;
}

// GET /api/store/[slug]/discounts — list all discount codes (owner only)
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const apiKey = req.headers.get("x-api-key");
  const storeKey = await getStoreByApiKey(apiKey, slug);
  if (!storeKey) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });'''

new_helper = '''import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { verifyStoreAccess } from "@/lib/storeAccess";

// GET /api/store/[slug]/discounts — list all discount codes (owner only)
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });'''

if old_helper not in s1:
    raise SystemExit("discounts GET block not found — aborting")
s1 = s1.replace(old_helper, new_helper)

old_post = '''export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const apiKey = req.headers.get("x-api-key");
  const storeKey = await getStoreByApiKey(apiKey, slug);
  if (!storeKey) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });'''

new_post = '''export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });'''

if old_post not in s1:
    raise SystemExit("discounts POST block not found — aborting")
s1 = s1.replace(old_post, new_post)

p1.write_text(s1)
print("done discounts list/create")

# --- discounts/[code]/route.ts (PATCH + DELETE) ---
p2 = pathlib.Path("app/api/store/[slug]/discounts/[code]/route.ts")
s2 = p2.read_text()

old_helper2 = '''import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

async function getStoreByApiKey(apiKey: string | null, slug: string) {
  if (!apiKey) return null;
  const snap = await db.collection("storeKeys").doc(slug).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  if (data.apiKey !== apiKey) return null;
  return data;
}

// PATCH /api/store/[slug]/discounts/[code] — toggle active state (owner only)
// body: { active: boolean }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; code: string }> }
) {
  const { slug, code } = await params;
  const apiKey = req.headers.get("x-api-key");
  const storeKey = await getStoreByApiKey(apiKey, slug);
  if (!storeKey) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });'''

new_helper2 = '''import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { verifyStoreAccess } from "@/lib/storeAccess";

// PATCH /api/store/[slug]/discounts/[code] — toggle active state (owner only)
// body: { active: boolean }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; code: string }> }
) {
  const { slug, code } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });'''

if old_helper2 not in s2:
    raise SystemExit("discounts PATCH block not found — aborting")
s2 = s2.replace(old_helper2, new_helper2)

old_delete = '''export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; code: string }> }
) {
  const { slug, code } = await params;
  const apiKey = req.headers.get("x-api-key");
  const storeKey = await getStoreByApiKey(apiKey, slug);
  if (!storeKey) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });'''

new_delete = '''export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; code: string }> }
) {
  const { slug, code } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });'''

if old_delete not in s2:
    raise SystemExit("discounts DELETE block not found — aborting")
s2 = s2.replace(old_delete, new_delete)

p2.write_text(s2)
print("done discounts detail")
