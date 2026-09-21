import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth';
import { app } from './firebase';

export const auth = getAuth(app);

// Provider with Google Sheets scopes
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets');
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/drive.readonly');
// Prompt user to consent / select account so newly requested scopes are granted
googleProvider.setCustomParameters({
  prompt: 'consent select_account'
});

const TOKEN_STORAGE_KEY = 'genmuzar_google_sheets_token';
const TOKEN_TIME_KEY = 'genmuzar_google_sheets_token_time';

let cachedAccessToken: string | null = (() => {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || null;
  } catch {
    return null;
  }
})();
let isSigningIn = false;

/**
 * Cek apakah token akses Google Sheets sudah kedaluwarsa (> 55 menit)
 */
export const isGoogleTokenExpired = (): boolean => {
  if (!cachedAccessToken) {
    try {
      cachedAccessToken = localStorage.getItem(TOKEN_STORAGE_KEY) || null;
    } catch {}
  }
  if (!cachedAccessToken) return true;

  try {
    const timeStr = localStorage.getItem(TOKEN_TIME_KEY);
    if (!timeStr) return false;
    const time = parseInt(timeStr, 10);
    // Token OAuth berlaku 60 menit; kita anggap kedaluwarsa setelah 55 menit
    if (Date.now() - time > 55 * 60 * 1000) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
};

/**
 * Initialize Auth State Listener
 */
export const initGoogleAuth = (
  onSuccess?: (user: User, token: string | null) => void,
  onSignedOut?: () => void
) => {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      if (onSuccess) {
        onSuccess(user, cachedAccessToken);
      }
    } else {
      cachedAccessToken = null;
      try {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        localStorage.removeItem(TOKEN_TIME_KEY);
      } catch {}
      if (onSignedOut) {
        onSignedOut();
      }
    }
  });
};

/**
 * Sign in with Google Popup and obtain access token
 */
export const signInWithGoogleSheets = async (): Promise<{ user: User; accessToken: string }> => {
  if (isSigningIn) {
    throw new Error('Proses login sedang berjalan...');
  }
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Gagal mendapatkan token akses Google Sheets dari Google Auth.');
    }
    cachedAccessToken = credential.accessToken;
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, cachedAccessToken);
      localStorage.setItem(TOKEN_TIME_KEY, String(Date.now()));
    } catch {}
    return {
      user: result.user,
      accessToken: cachedAccessToken
    };
  } finally {
    isSigningIn = false;
  }
};

/**
 * Get the currently cached OAuth Access Token
 */
export const getCachedAccessToken = (): string | null => {
  if (!cachedAccessToken) {
    try {
      cachedAccessToken = localStorage.getItem(TOKEN_STORAGE_KEY) || null;
    } catch {}
  }
  return cachedAccessToken;
};

/**
 * Set or refresh the cached token manually if needed
 */
export const setCachedAccessToken = (token: string | null) => {
  cachedAccessToken = token;
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      localStorage.setItem(TOKEN_TIME_KEY, String(Date.now()));
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(TOKEN_TIME_KEY);
    }
  } catch {}
};

/**
 * Sign out
 */
export const signOutGoogle = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(TOKEN_TIME_KEY);
  } catch {}
};
