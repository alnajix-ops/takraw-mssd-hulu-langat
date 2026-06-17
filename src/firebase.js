import { initializeApp } from 'firebase/app';
import { doc, getFirestore, onSnapshot, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const hasFirebaseConfig = Object.values(firebaseConfig).every(Boolean);
const app = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;
const db = app ? getFirestore(app) : null;
const tournamentDoc = db ? doc(db, 'tournaments', import.meta.env.VITE_TOURNAMENT_ID || 'mssd-hulu-langat-2026') : null;

export function isFirebaseConfigured() {
  return Boolean(db && tournamentDoc);
}

export function subscribeToTournament(onData, onError) {
  if (!tournamentDoc) return () => {};
  return onSnapshot(tournamentDoc, (snapshot) => {
    onData(snapshot.exists() ? snapshot.data() : null);
  }, onError);
}

export function saveTournament(data) {
  if (!tournamentDoc) return Promise.resolve(false);
  return setDoc(tournamentDoc, {
    ...data,
    updatedAt: new Date().toISOString(),
  }, { merge: false }).then(() => true);
}
