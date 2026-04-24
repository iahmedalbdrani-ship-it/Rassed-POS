// ============================================================
// Control Panel (رصيد) — Firebase v10+ Configuration
// Auth | Storage | FCM | Firestore
// ============================================================

import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User,
  sendPasswordResetEmail,
} from 'firebase/auth';
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  listAll,
  type UploadTaskSnapshot,
} from 'firebase/storage';
import {
  getToken,
  onMessage,
  type MessagePayload,
} from 'firebase/messaging';
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';

// ─── Centralized environment-aware instances ──────────────────
export { app, auth, db, storage, messaging, VAPID_KEY } from '@/config/firebase';
import { app, auth, db, storage, messaging, VAPID_KEY } from '@/config/firebase';

// ─── Types ───────────────────────────────────────────────────
export interface UserProfile {
  uid:         string;
  email:       string | null;
  full_name:   string | null;
  org_id:      string;
  role:        'owner' | 'admin' | 'accountant' | 'viewer';
  avatar_url?: string;
  created_at:  Date;
}

export interface UploadResult {
  path:         string;
  download_url: string;
  file_name:    string;
  file_size:    number;
}

export interface UploadProgress {
  bytes_transferred: number;
  total_bytes:       number;
  percentage:        number;
  state:             'running' | 'paused' | 'success' | 'canceled' | 'error';
}

// ═══════════════════════════════════════════════════════════
// ── AUTHENTICATION SERVICE ───────────────────────────────────
// ═══════════════════════════════════════════════════════════
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const authService = {

  /** Email + Password Sign In */
  async signInWithEmail(email: string, password: string): Promise<User> {
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    return user;
  },

  /** Google OAuth Sign In */
  async signInWithGoogle(): Promise<User> {
    const { user } = await signInWithPopup(auth, googleProvider);
    // Sync profile to Firestore
    await userProfileService.upsert(user.uid, {
      email:     user.email,
      full_name: user.displayName,
      avatar_url: user.photoURL ?? undefined,
    });
    return user;
  },

  /** Register new user */
  async register(email: string, password: string, fullName: string, orgId: string): Promise<User> {
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    await userProfileService.create(user.uid, { email, full_name: fullName, org_id: orgId, role: 'owner' });
    return user;
  },

  /** Sign out */
  async signOut(): Promise<void> {
    await signOut(auth);
  },

  /** Reset password */
  async resetPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(auth, email);
  },

  /** Subscribe to auth state */
  onAuthStateChanged(callback: (user: User | null) => void) {
    return onAuthStateChanged(auth, callback);
  },

  /** Get current user */
  get currentUser(): User | null {
    return auth.currentUser;
  },
};

// ═══════════════════════════════════════════════════════════
// ── USER PROFILE SERVICE (Firestore) ────────────────────────
// ═══════════════════════════════════════════════════════════
export const userProfileService = {

  async create(uid: string, profile: Partial<UserProfile>): Promise<void> {
    await setDoc(doc(db, 'user_profiles', uid), {
      ...profile,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
  },

  async upsert(uid: string, data: Partial<UserProfile>): Promise<void> {
    await setDoc(doc(db, 'user_profiles', uid), {
      ...data,
      updated_at: serverTimestamp(),
    }, { merge: true });
  },

  async get(uid: string): Promise<UserProfile | null> {
    const snap = await getDoc(doc(db, 'user_profiles', uid));
    return snap.exists() ? (snap.data() as UserProfile) : null;
  },

  async update(uid: string, data: Partial<UserProfile>): Promise<void> {
    await updateDoc(doc(db, 'user_profiles', uid), { ...data, updated_at: serverTimestamp() });
  },
};

// ═══════════════════════════════════════════════════════════
// ── STORAGE SERVICE — PDF / XML / Images ────────────────────
// ═══════════════════════════════════════════════════════════

/**
 * Storage path convention:
 * orgs/{org_id}/invoices/{year}/{month}/{invoice_number}.{ext}
 * orgs/{org_id}/products/{product_id}.{ext}
 *
 * Retention: 10 years (enforced by Firebase Storage lifecycle rules)
 */
export const storageService = {

  /**
   * Upload invoice PDF with progress callback
   * Returns download URL and storage path
   */
  async uploadInvoicePdf(
    orgId: string,
    invoiceNumber: string,
    pdfBlob: Blob,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<UploadResult> {
    const now      = new Date();
    const year     = now.getFullYear();
    const month    = String(now.getMonth() + 1).padStart(2, '0');
    const fileName = `${invoiceNumber}.pdf`;
    const path     = `orgs/${orgId}/invoices/${year}/${month}/${fileName}`;

    const storageRef = ref(storage, path);
    const metadata   = {
      contentType: 'application/pdf',
      customMetadata: {
        invoice_number: invoiceNumber,
        org_id:          orgId,
        uploaded_at:     now.toISOString(),
        retention:       '10-years',            // Legal requirement (ZATCA / Saudi law)
      },
    };

    return new Promise((resolve, reject) => {
      const task = uploadBytesResumable(storageRef, pdfBlob, metadata);

      task.on(
        'state_changed',
        (snapshot: UploadTaskSnapshot) => {
          if (onProgress) {
            onProgress({
              bytes_transferred: snapshot.bytesTransferred,
              total_bytes:       snapshot.totalBytes,
              percentage:        Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
              state:             snapshot.state as UploadProgress['state'],
            });
          }
        },
        (error) => reject(new Error(`PDF upload failed: ${error.message}`)),
        async () => {
          const download_url = await getDownloadURL(task.snapshot.ref);
          resolve({ path, download_url, file_name: fileName, file_size: pdfBlob.size });
        }
      );
    });
  },

  /**
   * Upload invoice XML (UBL 2.1 signed)
   */
  async uploadInvoiceXml(
    orgId: string,
    invoiceNumber: string,
    xmlContent: string
  ): Promise<UploadResult> {
    const now      = new Date();
    const year     = now.getFullYear();
    const month    = String(now.getMonth() + 1).padStart(2, '0');
    const fileName = `${invoiceNumber}.xml`;
    const path     = `orgs/${orgId}/invoices/${year}/${month}/${fileName}`;

    const blob     = new Blob([xmlContent], { type: 'application/xml' });
    const storageRef = ref(storage, path);

    const snapshot = await uploadBytesResumable(storageRef, blob, {
      contentType: 'application/xml',
      customMetadata: { invoice_number: invoiceNumber, org_id: orgId, retention: '10-years' },
    });

    const download_url = await getDownloadURL(snapshot.ref);
    return { path, download_url, file_name: fileName, file_size: blob.size };
  },

  /**
   * Upload product image
   */
  async uploadProductImage(
    orgId: string,
    productId: string,
    imageFile: File,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<UploadResult> {
    const ext      = imageFile.name.split('.').pop() ?? 'jpg';
    const path     = `orgs/${orgId}/products/${productId}.${ext}`;
    const storageRef = ref(storage, path);

    return new Promise((resolve, reject) => {
      const task = uploadBytesResumable(storageRef, imageFile, { contentType: imageFile.type });
      task.on('state_changed',
        (s) => onProgress?.({ bytes_transferred: s.bytesTransferred, total_bytes: s.totalBytes,
          percentage: Math.round(s.bytesTransferred / s.totalBytes * 100), state: s.state as any }),
        reject,
        async () => resolve({ path, download_url: await getDownloadURL(task.snapshot.ref),
          file_name: imageFile.name, file_size: imageFile.size })
      );
    });
  },

  /** Get signed download URL from path */
  async getUrl(path: string): Promise<string> {
    return getDownloadURL(ref(storage, path));
  },

  /** Delete file */
  async delete(path: string): Promise<void> {
    await deleteObject(ref(storage, path));
  },

  /** List all files for an org/year/month */
  async listInvoiceFiles(orgId: string, year: number, month: number) {
    const path = `orgs/${orgId}/invoices/${year}/${String(month).padStart(2, '0')}`;
    const list = await listAll(ref(storage, path));
    return list.items.map(item => item.fullPath);
  },
};

// ═══════════════════════════════════════════════════════════
// ── FCM — PUSH NOTIFICATIONS ────────────────────────────────
// ═══════════════════════════════════════════════════════════

export const fcmService = {

  /** Request notification permission and get FCM token */
  async requestPermission(): Promise<string | null> {
    if (!messaging) return null;
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return null;
      const token = await getToken(messaging, { vapidKey: VAPID_KEY });
      return token;
    } catch {
      return null;
    }
  },

  /** Listen for foreground messages */
  onForegroundMessage(callback: (payload: MessagePayload) => void): (() => void) | null {
    if (!messaging) return null;
    return onMessage(messaging, callback);
  },
};

export default app;

// ─────────────────────────────────────────────────────────────
// FIREBASE STORAGE SECURITY RULES
// Copy to: Firebase Console → Storage → Rules
// ─────────────────────────────────────────────────────────────
export const STORAGE_SECURITY_RULES = `
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {

    // ── Helper functions ──────────────────────────────────
    function isAuthenticated() {
      return request.auth != null;
    }

    function isOrgMember(orgId) {
      // Verify user belongs to this org via Firestore
      return isAuthenticated() &&
        firestore.exists(/databases/(default)/documents/user_profiles/$(request.auth.uid)) &&
        firestore.get(/databases/(default)/documents/user_profiles/$(request.auth.uid)).data.org_id == orgId;
    }

    function isOrgAdmin(orgId) {
      return isOrgMember(orgId) &&
        firestore.get(/databases/(default)/documents/user_profiles/$(request.auth.uid)).data.role
          in ['owner', 'admin'];
    }

    function isValidPdf() {
      return request.resource.contentType == 'application/pdf' &&
             request.resource.size < 50 * 1024 * 1024;  // 50 MB max
    }

    function isValidXml() {
      return request.resource.contentType == 'application/xml' &&
             request.resource.size < 10 * 1024 * 1024;  // 10 MB max
    }

    function isValidImage() {
      return request.resource.contentType.matches('image/.*') &&
             request.resource.size < 5 * 1024 * 1024;   // 5 MB max
    }

    // ── Invoice Files (PDF + XML) — 10-year retention ─────
    match /orgs/{orgId}/invoices/{year}/{month}/{fileName} {
      allow read: if isOrgMember(orgId);
      allow create: if isOrgMember(orgId) &&
                      (isValidPdf() || isValidXml()) &&
                      int(year) >= 2024 && int(year) <= 2040;
      // No updates to invoice files (immutable for compliance)
      allow update: if false;
      // Only owners can delete (audit trail must be preserved)
      allow delete: if isOrgAdmin(orgId);
    }

    // ── Product Images ────────────────────────────────────
    match /orgs/{orgId}/products/{imageFile} {
      allow read: if isOrgMember(orgId);
      allow write: if isOrgAdmin(orgId) && isValidImage();
      allow delete: if isOrgAdmin(orgId);
    }

    // ── Deny everything else ──────────────────────────────
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
`;

// ─── Firestore Security Rules ─────────────────────────────────
export const FIRESTORE_SECURITY_RULES = `
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isOwner(uid) {
      return request.auth.uid == uid;
    }

    // User can only read/write their own profile
    match /user_profiles/{uid} {
      allow read:   if request.auth != null && isOwner(uid);
      allow create: if request.auth != null && isOwner(uid);
      allow update: if request.auth != null && isOwner(uid)
                    && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['org_id','role']);
      allow delete: if false;  // Profiles are never deleted via client
    }

    // Deny all other collections (managed via Supabase)
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
`;
