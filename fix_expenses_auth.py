import pathlib

p1 = pathlib.Path("app/api/store/[slug]/expenses/route.ts")
s1 = p1.read_text()

old_helper = '''import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";

async function getStoreByApiKey(apiKey: string | null, slug: string) {
  if (!apiKey) return null;
  const snap = await db.collection("storeKeys").doc(slug).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  if (data.apiKey !== apiKey) return null;
  return data;
}

// GET /api/store/[slug]/expenses — list expenses + summary (owner only)
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const apiKey = req.headers.get("x-api-key");
  const storeKey = await getStoreByApiKey(apiKey, slug);
  if (!storeKey) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });'''

new_helper = '''import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { verifyStoreAccess } from "@/lib/storeAccess";

// GET /api/store/[slug]/expenses — list expenses + summary (owner only)
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });'''

if old_helper not in s1:
    raise SystemExit("expenses GET block not found — aborting")
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
    raise SystemExit("expenses POST block not found — aborting")
s1 = s1.replace(old_post, new_post)

p1.write_text(s1)
print("done expenses list/create")

p2 = pathlib.Path("app/api/store/[slug]/expenses/[expenseId]/route.ts")
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

// DELETE /api/store/[slug]/expenses/[expenseId] — delete an expense (owner only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; expenseId: string }> }
) {
  const { slug, expenseId } = await params;
  const apiKey = req.headers.get("x-api-key");
  const storeKey = await getStoreByApiKey(apiKey, slug);
  if (!storeKey) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });'''

new2 = '''import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { verifyStoreAccess } from "@/lib/storeAccess";

// DELETE /api/store/[slug]/expenses/[expenseId] — delete an expense (owner only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; expenseId: string }> }
) {
  const { slug, expenseId } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });'''

if old2 not in s2:
    raise SystemExit("expenses DELETE block not found — aborting")
s2 = s2.replace(old2, new2)

p2.write_text(s2)
print("done expenses delete")
