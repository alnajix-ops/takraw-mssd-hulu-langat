import { initializeApp } from 'firebase/app';
import { disableNetwork, doc, getFirestore, onSnapshot, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCq9jYRHIZiG-ywD8IE_Nx1PIHAdZRXxao',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'takraw-mssd-hulu-langat-b05e0.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'takraw-mssd-hulu-langat-b05e0',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'takraw-mssd-hulu-langat-b05e0.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '605347927039',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:605347927039:web:b2d088e720e2ece75f8dca',
};

const requiredFirebaseValues = Object.values(firebaseConfig);
const hasFirebaseConfig = requiredFirebaseValues.every((value) => value && !String(value).startsWith('your-'));
const app = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;
const db = app ? getFirestore(app) : null;
const tournamentDoc = db ? doc(db, 'tournaments', import.meta.env.VITE_TOURNAMENT_ID || 'mssd-hulu-langat-2026') : null;

export function isFirebaseConfigured() {
  return hasFirebaseConfig;
}

export function subscribeToTournament(onData, onError) {
  if (!tournamentDoc) return () => {};
  return onSnapshot(tournamentDoc, (snapshot) => {
    onData(snapshot.exists() ? snapshot.data() : null);
  }, (error) => {
    if (error?.code === 'resource-exhausted' && db) {
      console.warn('Firebase Quota Exceeded. Disabling network temporarily to stop background retries.');
      disableNetwork(db).catch(() => {});
    }
    if (onError) onError(error);
  });
}

export function saveTournament(data) {
  if (!tournamentDoc) return Promise.resolve(false);
  return setDoc(tournamentDoc, {
    ...data,
    updatedAt: new Date().toISOString(),
  }, { merge: false }).then(() => true).catch((error) => {
    if (error?.code === 'resource-exhausted' && db) {
      console.warn('Firebase Quota Exceeded. Disabling network temporarily to stop background retries.');
      disableNetwork(db).catch(() => {});
    }
    throw error;
  });
}
