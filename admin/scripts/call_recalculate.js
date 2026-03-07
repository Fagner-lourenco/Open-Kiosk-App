import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const firebaseConfig = {
  apiKey: requireEnv('VITE_FIREBASE_API_KEY'),
  authDomain: requireEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: requireEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: requireEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: requireEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: requireEnv('VITE_FIREBASE_APP_ID'),
};

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const functions = getFunctions(app, 'southamerica-east1');

  const email = process.env.POPULATE_EMAIL;
  const password = process.env.POPULATE_PASSWORD;
  const franchiseId = process.env.POPULATE_FRANCHISE || 'teste_migracao';
  const storeId = process.env.POPULATE_STORE || 'loja001';

  if (!email || !password) {
    console.error('Set POPULATE_EMAIL and POPULATE_PASSWORD in env');
    process.exit(1);
  }

  await signInWithEmailAndPassword(auth, email, password);
  const recalcFn = httpsCallable(functions, 'recalculateRanking30minNow');
  const res = await recalcFn({ franchiseId, storeId });
  console.log('recalc result:', res.data);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
