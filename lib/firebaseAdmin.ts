import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

let app: App;

if (!getApps().length) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : null;
  app = initializeApp(
    serviceAccount ? { credential: cert(serviceAccount) } : undefined
  );
} else {
  app = getApps()[0];
}

export const db = getFirestore(app);
export const auth = getAuth(app);
