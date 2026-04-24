// ============================================================
// Control Panel (رصيد) — Firebase Auth Service (Clean)
// Handles: Google Sign-In | Email/Password | Sign-Out
// ============================================================

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type Auth,
  type User,
} from 'firebase/auth';

// ─── Firebase Config (rassed-a7010) ─────────────────────────
const firebaseConfig = {
  apiKey:            'AIzaSyB0Sx-RlSmYs3N6mTN0_s_W1SkA7e6_qn0',
  authDomain:        'rassed-a7010.firebaseapp.com',
  projectId:         'rassed-a7010',
  storageBucket:     'rassed-a7010.firebasestorage.app',
  messagingSenderId: '36907138573',
  appId:             '1:36907138573:web:dc11f5c134289bd7e25f44',
};

// ─── Singleton init ──────────────────────────────────────────
const app: FirebaseApp = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApps()[0];

export const auth: Auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// ─── Detect Electron environment ────────────────────────────
const isElectron = (): boolean =>
  typeof window !== 'undefined' &&
  typeof (window as any).process?.versions?.electron !== 'undefined';

// ─── Auth Functions ──────────────────────────────────────────

/**
 * تسجيل دخول بـ Google.
 *
 * • في Electron: يستخدم signInWithRedirect لتجنب مشكلة COOP
 *   التي تمنع window.closed polling في signInWithPopup.
 * • في المتصفح: يستخدم signInWithPopup (تجربة أفضل للمستخدم).
 */
export async function signInWithGoogle(): Promise<User> {
  if (isElectron()) {
    // Electron: check for pending redirect result first
    const redirectResult = await getRedirectResult(auth);
    if (redirectResult?.user) return redirectResult.user;
    // Trigger the redirect flow
    await signInWithRedirect(auth, googleProvider);
    // signInWithRedirect navigates away; onAuthStateChanged will
    // pick up the user when the app reloads after the redirect.
    // Return a rejected promise to signal pending state.
    throw new Error('REDIRECT_PENDING');
  }
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

/** استرجاع نتيجة Google Redirect (للاستدعاء عند بدء التطبيق) */
export async function getGoogleRedirectResult(): Promise<User | null> {
  const result = await getRedirectResult(auth);
  return result?.user ?? null;
}

/** تسجيل دخول بالإيميل وكلمة المرور */
export async function signInWithEmail(email: string, password: string): Promise<User> {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

/** تسجيل الخروج */
export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

/** الاستماع لتغييرات حالة المصادقة */
export function onAuthChange(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

export type { User };
