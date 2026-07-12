const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw || raw.trim() === "" || raw.trim() === '""') {
  console.error("FIREBASE_SERVICE_ACCOUNT env var is empty or not set in this shell.");
  console.error("Find the file with the real key value and export it, e.g.:");
  console.error('  export FIREBASE_SERVICE_ACCOUNT=$(grep "^FIREBASE_SERVICE_ACCOUNT=" ~/chatfipay/.env.vercel | cut -d= -f2-)');
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(raw);
} catch (e) {
  console.error("Failed to JSON.parse FIREBASE_SERVICE_ACCOUNT. First 80 chars of value:");
  console.error(raw.slice(0, 80));
  console.error("Error:", e.message);
  process.exit(1);
}

const app = initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);

const APPLY = process.argv.includes("--apply");

function normalizeWallet(w) {
  if (typeof w !== "string") return w;
  return w.startsWith("wallet:") ? w.slice(7) : w;
}

async function backfillCollection(collectionName) {
  const snap = await db.collection(collectionName).get();
  let checked = 0;
  let toFix = 0;

  for (const doc of snap.docs) {
    checked++;
    const data = doc.data();
    if (typeof data.ownerWallet === "string" && data.ownerWallet.startsWith("wallet:")) {
      toFix++;
      const normalized = normalizeWallet(data.ownerWallet);
      console.log(
        `[${collectionName}] ${doc.id}: "${data.ownerWallet}" -> "${normalized}"${APPLY ? "" : " (dry-run)"}`
      );
      if (APPLY) {
        await doc.ref.update({ ownerWallet: normalized });
      }
    }
  }

  console.log(`[${collectionName}] checked ${checked} docs, ${toFix} needed fixing.\n`);
}

async function main() {
  console.log(APPLY ? "Running in APPLY mode (writes will happen).\n" : "Running in DRY-RUN mode (no writes). Pass --apply to write.\n");

  await backfillCollection("storeUsernames");
  await backfillCollection("stores");
  await backfillCollection("storeKeys");

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
