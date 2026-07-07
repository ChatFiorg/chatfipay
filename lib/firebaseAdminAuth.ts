// Deliberately isolated from lib/firebaseAdmin.ts (which every store/order/
// product route depends on via `db`). Firebase Auth is only needed by the
// owner-auth session endpoint, so it gets its own file — a problem here can
// never take down the rest of the app the way it did when this lived inside
// the shared firebaseAdmin.ts.
import { getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import '@/lib/firebaseAdmin'; // ensures the default app is initialized first

export const auth = getAuth(getApps()[0]);
