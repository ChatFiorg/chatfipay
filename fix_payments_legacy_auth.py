import pathlib

p = pathlib.Path("app/api/store/[slug]/payments/route.ts")
s = p.read_text()

old_get = '''// GET /api/store/[slug]/payments — bank payout account status for this store
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });'''

new_get = '''async function legacyOwnerWalletMatches(slug: string, ownerWallet: string | null): Promise<boolean> {
  if (!ownerWallet) return false;
  const snap = await db.collection("storeWallets").doc(ownerWallet).get();
  if (!snap.exists) return false;
  const usernames: string[] = snap.data()?.usernames || [];
  return usernames.includes(slug);
}

// GET /api/store/[slug]/payments?ownerWallet=xxx — bank payout account status for this store
// Accepts either the owner session token/API key (verifyStoreAccess) or a legacy
// ownerWallet query param (used by the mobile app's existing no-token pattern).
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) {
    const { searchParams } = new URL(req.url);
    const legacyOk = await legacyOwnerWalletMatches(slug, searchParams.get("ownerWallet"));
    if (!legacyOk) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }'''

if old_get not in s:
    raise SystemExit("GET block not found — aborting")
s = s.replace(old_get, new_get)

old_post = '''// POST /api/store/[slug]/payments — connect/update bank payout account
// body: { businessName, bankCode, bankName, accountNumber, percentageCharge? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { businessName, bankCode, bankName, accountNumber, percentageCharge } = body;'''

new_post = '''// POST /api/store/[slug]/payments — connect/update bank payout account
// body: { businessName, bankCode, bankName, accountNumber, percentageCharge?, ownerWallet? }
// Accepts either the owner session token/API key (verifyStoreAccess) or a legacy
// ownerWallet field in the body (used by the mobile app's existing no-token pattern).
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const body = await req.json();
    const { businessName, bankCode, bankName, accountNumber, percentageCharge, ownerWallet } = body;

    const authorized = await verifyStoreAccess(req, slug);
    if (!authorized) {
      const legacyOk = await legacyOwnerWalletMatches(slug, ownerWallet || null);
      if (!legacyOk) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }'''

if old_post not in s:
    raise SystemExit("POST block not found — aborting")
s = s.replace(old_post, new_post)

# Remove the now-duplicate `const body = await req.json();` further down in POST
old_dup = '''    }

  try {
    const body = await req.json();
    const { businessName, bankCode, bankName, accountNumber, percentageCharge } = body;

    if (!businessName)'''
new_dup = '''    }

    if (!businessName)'''
if old_dup not in s:
    raise SystemExit("duplicate body-parse cleanup point not found — aborting")
s = s.replace(old_dup, new_dup)

p.write_text(s)
print("done")
