import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase App
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore with ignoreUndefinedProperties to prevent crashes
const configAny = firebaseConfig as any;
let firestoreDb;
try {
  firestoreDb = initializeFirestore(app, {
    ignoreUndefinedProperties: true
  }, configAny.firestoreDatabaseId && configAny.firestoreDatabaseId !== '(default)' ? configAny.firestoreDatabaseId : undefined);
} catch {
  firestoreDb = configAny.firestoreDatabaseId && configAny.firestoreDatabaseId !== '(default)'
    ? getFirestore(app, configAny.firestoreDatabaseId)
    : getFirestore(app);
}

export const db = firestoreDb;

export default app;
