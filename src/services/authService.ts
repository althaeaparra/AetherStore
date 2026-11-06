import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/gmail.send');
provider.addScope('https://www.googleapis.com/auth/drive.file');

// In-memory token storage (MANDATORY: Never stored in localStorage / sessionStorage)
let cachedAccessToken: string | null = null;
let currentUser: User | null = null;

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  provider: 'google' | 'apple' | 'github' | 'guest';
  twoFactorEnabled: boolean;
}

let active2FACode: { code: string; expiresAt: number; target: string } | null = null;

export const initAuthListener = (
  onSuccess?: (user: User, token: string | null) => void,
  onSignedOut?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    currentUser = user;
    if (user) {
      if (onSuccess) onSuccess(user, cachedAccessToken);
    } else {
      cachedAccessToken = null;
      if (onSignedOut) onSignedOut();
    }
  });
};

export const signInWithGoogle = async (): Promise<{ user: User; accessToken: string }> => {
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('No access token returned from Google Auth');
    }
    cachedAccessToken = credential.accessToken;
    currentUser = result.user;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('Google Sign-In Error:', error);
    throw error;
  }
};

export const signInWithSocialMock = (providerType: 'apple' | 'github'): UserProfile => {
  const mockUser: UserProfile = {
    uid: `${providerType}-${Date.now()}`,
    displayName: providerType === 'apple' ? 'Apple Verified User' : 'GitHub Spatial Dev',
    email: providerType === 'apple' ? 'user@icloud.com' : 'developer@github.com',
    provider: providerType,
    twoFactorEnabled: true,
  };
  return mockUser;
};

export const getCachedAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const getCurrentUser = (): User | null => {
  return currentUser;
};

export const logOut = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  currentUser = null;
};

/** Generate a secure 6-digit 2FA code */
export const generate2FACode = (targetEmailOrPhone: string): string => {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  active2FACode = {
    code,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 min expiry
    target: targetEmailOrPhone,
  };
  return code;
};

export const verify2FACode = (inputCode: string): boolean => {
  if (!active2FACode) return false;
  if (Date.now() > active2FACode.expiresAt) {
    active2FACode = null;
    return false;
  }
  const isValid = active2FACode.code === inputCode.trim();
  if (isValid) {
    active2FACode = null;
  }
  return isValid;
};

export const getActive2FAPending = () => {
  if (!active2FACode) return null;
  if (Date.now() > active2FACode.expiresAt) {
    active2FACode = null;
    return null;
  }
  return active2FACode;
};
