import pathlib

p = pathlib.Path("app/api/store/route.ts")
s = p.read_text()

old_import = 'import { FieldValue } from "firebase-admin/firestore";'
new_import = 'import { FieldValue } from "firebase-admin/firestore";\nimport { verifyOwnerToken } from "@/lib/ownerAuth";'
if old_import not in s:
    raise SystemExit("import line not found — aborting")
s = s.replace(old_import, new_import)

old_post_start = '''export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, ownerWallet, name, description, logo, banner, favicon, category, theme, contact, shipping, loyalty, analytics, countdownPromo } = body;

    if (!username || !ownerWallet) return NextResponse.json({ error: "Missing username or ownerWallet" }, { status: 400 });

    const existing = await db.collection("storeUsernames").doc(username).get();
    if (existing.exists && existing.data()!.ownerWallet !== ownerWallet) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }'''

new_post_start = '''export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const ownerPayload = verifyOwnerToken(token);
    if (!ownerPayload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [ownerKind, ownerIdentifier] = ownerPayload.ownerId.split(/:(.+)/);
    const ownerCollection = ownerKind === "wallet" ? "storeWallets" : "storeEmails";
    // ownerWallet kept as the on-record field name for backwards compatibility with
    // existing store docs/mobile app reads, but it now holds either a wallet address
    // or "email:<normalized email>" depending on how the owner signed up.
    const ownerWallet = ownerPayload.ownerId;

    const body = await req.json();
    const { username, name, description, logo, banner, favicon, category, theme, contact, shipping, loyalty, analytics, countdownPromo } = body;

    if (!username) return NextResponse.json({ error: "Missing username" }, { status: 400 });

    const existing = await db.collection("storeUsernames").doc(username).get();
    if (existing.exists && existing.data()!.ownerWallet !== ownerWallet) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }'''

if old_post_start not in s:
    raise SystemExit("POST start block not found — aborting")
s = s.replace(old_post_start, new_post_start)

old_wallet_block = '''    const walletRef = db.collection("storeWallets").doc(ownerWallet);
    const walletSnap = await walletRef.get();
    if (!walletSnap.exists) {
      await walletRef.set({ ownerWallet, usernames: [username], activeUsername: username });
    } else {
      const update: any = { usernames: FieldValue.arrayUnion(username) };
      if (isNewStore) update.activeUsername = username;
      await walletRef.set(update, { merge: true });
    }'''

new_wallet_block = '''    const ownerRef = db.collection(ownerCollection).doc(ownerIdentifier);
    const ownerSnap = await ownerRef.get();
    if (!ownerSnap.exists) {
      await ownerRef.set({ ownerWallet, usernames: [username], activeUsername: username });
    } else {
      const update: any = { usernames: FieldValue.arrayUnion(username) };
      if (isNewStore) update.activeUsername = username;
      await ownerRef.set(update, { merge: true });
    }'''

if old_wallet_block not in s:
    raise SystemExit("wallet ref block not found — aborting")
s = s.replace(old_wallet_block, new_wallet_block)

p.write_text(s)
print("done")
