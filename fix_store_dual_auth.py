import pathlib

p = pathlib.Path("app/api/store/route.ts")
s = p.read_text()

old_block = '''export async function POST(req: NextRequest) {
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

    if (!username) return NextResponse.json({ error: "Missing username" }, { status: 400 });'''

new_block = '''export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const ownerPayload = verifyOwnerToken(token);

    let ownerCollection: string;
    let ownerIdentifier: string;
    let ownerWallet: string;

    if (ownerPayload) {
      // Web flow: authenticated via signed owner session token (wallet, Google, or email).
      const [ownerKind, identifier] = ownerPayload.ownerId.split(/:(.+)/);
      ownerCollection = ownerKind === "wallet" ? "storeWallets" : "storeEmails";
      ownerIdentifier = identifier;
      ownerWallet = ownerPayload.ownerId;
    } else if (body.ownerWallet) {
      // Legacy/mobile flow: Rchatfi calls this endpoint directly with a raw wallet
      // address in the body, with no owner session token. Preserved as-is so the
      // mobile app keeps working without requiring an app update.
      ownerCollection = "storeWallets";
      ownerIdentifier = body.ownerWallet;
      ownerWallet = body.ownerWallet;
    } else {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { username, name, description, logo, banner, favicon, category, theme, contact, shipping, loyalty, analytics, countdownPromo } = body;

    if (!username) return NextResponse.json({ error: "Missing username" }, { status: 400 });'''

if old_block not in s:
    raise SystemExit("POST start block not found — aborting")
s = s.replace(old_block, new_block)

p.write_text(s)
print("done")
