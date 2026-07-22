const { db } = require("./lib/firebaseAdmin");

(async () => {
  const snap = await db.collection("pay_links").limit(1000).get();
  let missing = 0;
  let total = 0;
  snap.forEach(doc => {
    total++;
    const d = doc.data();
    if (!d.merchantWallet) missing++;
  });
  console.log(`total: ${total}, missing merchantWallet: ${missing}`);
})();
