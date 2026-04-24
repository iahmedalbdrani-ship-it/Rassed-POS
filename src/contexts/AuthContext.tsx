// ============================================================
// Control Panel (رصيد) — Auth Context
// Supports: Email/Password + Google Sign-In (Firebase)
// ============================================================

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import {
  signInWithGoogle,
  signInWithEmail,
  signOutUser,
  onAuthChange,
  getGoogleRedirectResult,
  type User,
} from '../lib/firebaseAuth';

export type UserRole = 'ADMIN' | 'ACCOUNTANT' | 'CASHIER';

export interface AuthUser {
  id:     string;
  email:  string;
  name:   string;
  avatar: string | null;
  role:   UserRole;
}

interface AuthContextValue {
  user:            AuthUser | null;
  isAuthenticated: boolean;
  loading:         boolean;
  login:           (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout:          () => Promise<void>;
}

// ─── Map Firebase User → AuthUser ───────────────────────────
function mapFirebaseUser(fbUser: User): AuthUser {
  return {
    id:     fbUser.uid,
    email:  fbUser.email ?? '',
    name:   fbUser.displayName ?? fbUser.email?.split('@')[0] ?? 'مستخدم',
    avatar: fbUser.photoURL,
    role:   'ADMIN', // يمكن جلب الدور من Supabase/Firestore لاحقاً
  };
}

// ─── Fallback demo user (بدون Firebase) ─────────────────────
const DEMO_USER: AuthUser = {
  id:     'demo-001',
  email:  'admin@raseed.sa',
  name:   'مدير النظام',
  avatar: null,
  role:   'ADMIN',
};

const AuthContext = createContext<AuthContextValue>({
  user: null, isAuthenticated: false, loading: true,
  login: async () => {}, loginWithGoogle: async () => {}, logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading]               = useState(true);

  // ── Listen for Firebase auth state changes ─────────────────
  useEffect(() => {
    // Check for pending Google redirect result (Electron flow)
    getGoogleRedirectResult()
      .then((fbUser) => { if (fbUser) setUser(mapFirebaseUser(fbUser)); })
      .catch(() => { /* no pending redirect */ });

    const unsubscribe = onAuthChange((fbUser) => {
      if (fbUser) {
        setUser(mapFirebaseUser(fbUser));
      } else {
        // في وضع التطوير: افتراضي مسجّل الدخول كـ demo
        setUser(DEMO_USER);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const fbUser = await signInWithEmail(email, password);
      setUser(mapFirebaseUser(fbUser));
    } catch {
      // Fallback للـ demo إذا لم يكن Firebase مُهيأً
      setUser({ ...DEMO_USER, email });
    } finally {
      setLoading(false);
    }
  };

  const loginWithGoogle = async () => {
    setLoading(true);
    try {
      const fbUser = await signInWithGoogle();
      setUser(mapFirebaseUser(fbUser));
    } catch (err: any) {
      if (err?.message === 'REDIRECT_PENDING') {
        // Electron redirect flow: app will reload after auth.
        // Keep loading=true while waiting for redirect to complete.
        return;
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await signOutUser();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      loading,
      login,
      loginWithGoogle,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
