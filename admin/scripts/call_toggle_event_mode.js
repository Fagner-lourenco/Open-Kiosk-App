import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || 'AIzaSyCaRS-fnWiUwNtPjlCmcIzlz4003lDdP8s',
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'open-kiosk-22b2b.firebaseapp.com',
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'open-kiosk-22b2b',
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || 'open-kiosk-22b2b.firebasestorage.app',
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '66190112514',
  appId: process.env.VITE_FIREBASE_APP_ID || '1:66190112514:web:7971482f37a9af47ebb41b',
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

  const toggleFn = httpsCallable(functions, 'toggleEventMode');
  const enable = await toggleFn({
    franchiseId,
    storeId,
    enabled: true,
    label: 'Happy Hour Teste',
    durationMinutes: 10,
  });

  console.log('toggle on result:', enable.data);

  const disable = await toggleFn({
    franchiseId,
    storeId,
    enabled: false,
    label: '',
    durationMinutes: 10,
  });

  console.log('toggle off result:', disable.data);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
