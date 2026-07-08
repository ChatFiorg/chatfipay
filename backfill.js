require('dotenv').config({ path: '.env.production' });
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const stores = await db.collection("stores").get();
  let checked = 0, missing = 0;
  for (const store of stores.docs) {
    const orders = await db.collection("stores").doc(store.id).collection("orders")
      .where("amountUsdc", ">", 0).get();
    for (const o of orders.docs) {
      checked++;
      if (!o.data().paymentMethod) missing++;
    }
  }
  console.log(`Checked ${checked} USDC orders, ${missing} missing paymentMethod`);
}
main().catch(console.error);
