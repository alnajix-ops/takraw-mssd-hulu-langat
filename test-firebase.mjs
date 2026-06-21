// Skrip test: verify Firebase credentials valid + Firestore reachable
// Run: node test-firebase.mjs
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { config } from 'dotenv';

config(); // load .env

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

console.log('=== FIREBASE CONNECTION TEST ===');
console.log('Project ID:', firebaseConfig.projectId || '(KOSONG - .env tak load!)');

const missing = Object.entries(firebaseConfig).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error('❌ MISSING KEYS:', missing.join(', '));
  console.error('   .env tak load betul. Check dotenv installed?');
  process.exit(1);
}

try {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  console.log('✅ Firebase app initialized');

  // Test write to a test doc
  const testDocRef = doc(db, 'connection-tests', 'test-' + Date.now());
  console.log('⏳ Testing WRITE to Firestore...');
  await setDoc(testDocRef, {
    message: 'Connection test from ZCode',
    timestamp: serverTimestamp(),
  });
  console.log('✅ WRITE berhasil! Firestore boleh diakses.');

  // Test read back
  console.log('⏳ Testing READ back...');
  const snap = await getDoc(testDocRef);
  if (snap.exists()) {
    console.log('✅ READ berhasil! Data:', snap.data().message);
  }

  // Test write to actual tournament doc
  const tournamentId = process.env.VITE_TOURNAMENT_ID || 'mssd-hulu-langat-2026';
  const tournamentRef = doc(db, 'tournaments', tournamentId);
  console.log('⏳ Testing access ke tournament doc:', tournamentId);
  const existing = await getDoc(tournamentRef);
  if (existing.exists()) {
    const data = existing.data();
    console.log('✅ Tournament doc ADA. Teams:', data.teams?.length || '?', '| Updated:', data.updatedAt || '(unknown)');
  } else {
    console.log('ℹ️  Tournament doc masih KOSONG (akan dibuat auto bila app dibuka)');
  }

  console.log('\n=== SEMUA TEST LULUS ===');
  console.log('Firebase BERFUNGSI. Sync antara device akan jalan.');
  console.log('Pastikan Firestore rules benarkan read/write (test mode).');
  process.exit(0);
} catch (error) {
  console.error('\n❌ FIREBASE CONNECTION GAGAL!');
  console.error('Error code:', error.code);
  console.error('Message:', error.message);
  if (error.code === 'permission-denied') {
    console.error('\n🔧 FIX: Firestore Security Rules terlalu ketat.');
    console.error('   Pergi Firebase Console > Firestore > Rules');
    console.error('   Tukar kepada (untuk kecemasan sahaja):');
    console.error('   rules_version = "2";');
    console.error('   service cloud.firestore {');
    console.error('     match /databases/{database}/documents {');
    console.error('       match /{document=**} { allow read, write: if true; }');
    console.error('     }');
    console.error('   }');
  } else if (error.code === 'api-key-not-valid' || error.message?.includes('API key')) {
    console.error('\n🔧 FIX: API key salah. Check VITE_FIREBASE_API_KEY dalam .env');
  } else if (error.code === 'unavailable' || error.code === 'network-request-failed') {
    console.error('\n🔧 FIX: Network/online issue. Check internet connection.');
  }
  process.exit(1);
}
