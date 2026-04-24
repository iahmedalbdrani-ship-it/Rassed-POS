import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth,     type Auth }            from 'firebase/auth';
import { getFirestore, type Firestore }       from 'firebase/firestore';
import { getStorage,  type FirebaseStorage }  from 'firebase/storage';
import { getMessaging, type Messaging }       from 'firebase/messaging';
import { getEnvironmentConfig }               from './environment';

const { firebase: cfg } = getEnvironmentConfig();

const firebaseConfig = {
  apiKey:            cfg.apiKey,
  authDomain:        cfg.authDomain,
  projectId:         cfg.projectId,
  storageBucket:     cfg.storageBucket,
  messagingSenderId: cfg.messagingSenderId,
  appId:             cfg.appId,
  measurementId:     cfg.measurementId,
};

export const app: FirebaseApp =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth:    Auth            = getAuth(app);
export const db:      Firestore       = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);

export let messaging: Messaging | null = null;
if (typeof window !== 'undefined' && 'Notification' in window) {
  messaging = getMessaging(app);
}

export const VAPID_KEY = cfg.vapidKey;

export default app;
