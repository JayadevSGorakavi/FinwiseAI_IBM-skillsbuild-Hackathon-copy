/**
 * firebase.js
 * Dual-layer Data Layer: Firebase / Cloud Firestore + LocalStorage caching & offline fallback
 * Ensures zero data is lost on reload, whether Firebase is configured or running offline.
 */

import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  getDocs,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

// ============================================================
// STORAGE CONSTANTS
// ============================================================
const STORAGE_KEYS = {
  SESSION_USER: "finwise_auth_user",
  PROFILE_PREFIX: "finwise_profile_",
  EXPENSES_PREFIX: "finwise_expenses_",
  BUDGET_PREFIX: "finwise_budget_",
  CHATS_PREFIX: "finwise_chats_",
};

// ============================================================
// FIREBASE CONFIG & INITIALIZATION
// ============================================================
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let app = null;
let auth = null;
let db = null;

const hasFirebaseKeys = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.apiKey !== "undefined"
);

if (hasFirebaseKeys) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (err) {
    console.warn("Firebase initialization warning (running with local persistence):", err.message);
  }
}

export { auth, db };

// ============================================================
// LOCAL STORAGE HELPERS
// ============================================================
function getLocalItem(key, defaultValue = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch (e) {
    console.error("Error reading localStorage key", key, e);
    return defaultValue;
  }
}

function setLocalItem(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error("Error writing localStorage key", key, e);
  }
}

function removeLocalItem(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.error("Error removing localStorage key", key, e);
  }
}

// ============================================================
// AUTHENTICATION
// ============================================================
const googleProvider = new GoogleAuthProvider();

function formatUserObject(user) {
  if (!user) return null;
  return {
    uid: user.uid,
    displayName: user.displayName || user.email?.split("@")[0] || "Student",
    email: user.email || "student@university.edu",
    photoURL: user.photoURL || null,
  };
}

export async function signInWithGoogle() {
  if (auth) {
    const res = await signInWithPopup(auth, googleProvider);
    const userObj = formatUserObject(res.user);
    setLocalItem(STORAGE_KEYS.SESSION_USER, userObj);
    return { user: userObj };
  }
  throw new Error("Firebase Auth not initialized");
}

export async function signInWithEmail(email, password) {
  if (auth) {
    const res = await signInWithEmailAndPassword(auth, email, password);
    const userObj = formatUserObject(res.user);
    setLocalItem(STORAGE_KEYS.SESSION_USER, userObj);
    return { user: userObj };
  }
  throw new Error("Firebase Auth not initialized");
}

export async function registerWithEmail(email, password) {
  if (auth) {
    const res = await createUserWithEmailAndPassword(auth, email, password);
    const userObj = formatUserObject(res.user);
    setLocalItem(STORAGE_KEYS.SESSION_USER, userObj);
    return { user: userObj };
  }
  throw new Error("Firebase Auth not initialized");
}

export function setDemoUserSession(userObj) {
  const formatted = formatUserObject(userObj);
  setLocalItem(STORAGE_KEYS.SESSION_USER, formatted);
  return formatted;
}

export async function logOut() {
  removeLocalItem(STORAGE_KEYS.SESSION_USER);
  if (auth) {
    try {
      await signOut(auth);
    } catch (err) {
      console.warn("Sign out error:", err);
    }
  }
}

export function onAuthChange(callback) {
  if (auth) {
    return onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        const userObj = formatUserObject(firebaseUser);
        setLocalItem(STORAGE_KEYS.SESSION_USER, userObj);
        callback(userObj);
      } else {
        // Check if there is an active local demo session
        const localUser = getLocalItem(STORAGE_KEYS.SESSION_USER, null);
        callback(localUser);
      }
    });
  }

  // If Firebase Auth is not active, check localStorage session
  const localUser = getLocalItem(STORAGE_KEYS.SESSION_USER, null);
  callback(localUser);
  return () => {};
}

// ============================================================
// PROFILE
// ============================================================
export async function getProfile(uid) {
  if (!uid) return null;
  const localProfile = getLocalItem(STORAGE_KEYS.PROFILE_PREFIX + uid, null);

  if (db) {
    try {
      const snap = await getDoc(doc(db, "profiles", uid));
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() };
        setLocalItem(STORAGE_KEYS.PROFILE_PREFIX + uid, data);
        return data;
      }
    } catch (err) {
      console.warn("Firestore getProfile failed, using local copy:", err.message);
    }
  }

  return localProfile;
}

export async function saveProfile(uid, data) {
  if (!uid) return;
  const existing = getLocalItem(STORAGE_KEYS.PROFILE_PREFIX + uid, {});
  const merged = { ...existing, ...data, uid, updatedAt: new Date().toISOString() };
  setLocalItem(STORAGE_KEYS.PROFILE_PREFIX + uid, merged);

  if (db) {
    try {
      await setDoc(
        doc(db, "profiles", uid),
        { ...data, uid, updatedAt: serverTimestamp() },
        { merge: true }
      );
    } catch (err) {
      console.warn("Firestore saveProfile failed, preserved in local storage:", err.message);
    }
  }
  return merged;
}

export async function updateProfile(uid, data) {
  return saveProfile(uid, data);
}

// ============================================================
// EXPENSES
// ============================================================
export async function getExpenses(uid) {
  if (!uid) return [];
  const localExpenses = getLocalItem(STORAGE_KEYS.EXPENSES_PREFIX + uid, null);

  if (db) {
    try {
      // Query without composite index requirement, then sort in-memory
      const q = query(
        collection(db, "expenses"),
        where("uid", "==", uid)
      );
      const snap = await getDocs(q);
      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      setLocalItem(STORAGE_KEYS.EXPENSES_PREFIX + uid, items);
      return items;
    } catch (err) {
      console.warn("Firestore getExpenses failed, using local copy:", err.message);
    }
  }

  return localExpenses || [];
}

export async function addExpense(uid, expense) {
  if (!uid) return null;
  const expenseId = expense.id || Date.now().toString();
  const newExpense = {
    id: expenseId,
    uid,
    ...expense,
    createdAt: new Date().toISOString(),
  };

  // 1. Immediately update localStorage
  const currentList = getLocalItem(STORAGE_KEYS.EXPENSES_PREFIX + uid, []);
  const updatedList = [newExpense, ...currentList.filter((e) => e.id !== expenseId)];
  setLocalItem(STORAGE_KEYS.EXPENSES_PREFIX + uid, updatedList);

  // 2. Sync to Firestore in background
  if (db) {
    try {
      await setDoc(doc(db, "expenses", expenseId), {
        uid,
        ...expense,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn("Firestore addExpense failed, preserved locally:", err.message);
    }
  }

  return newExpense;
}

export async function deleteExpense(id, uid) {
  if (!id) return;

  // 1. Immediately update localStorage
  if (uid) {
    const currentList = getLocalItem(STORAGE_KEYS.EXPENSES_PREFIX + uid, []);
    const updatedList = currentList.filter((e) => e.id !== id);
    setLocalItem(STORAGE_KEYS.EXPENSES_PREFIX + uid, updatedList);
  }

  // 2. Sync deletion to Firestore
  if (db) {
    try {
      await deleteDoc(doc(db, "expenses", id));
    } catch (err) {
      console.warn("Firestore deleteExpense failed, removed locally:", err.message);
    }
  }
}

// ============================================================
// BUDGET
// ============================================================
export async function getBudget(uid) {
  if (!uid) return null;
  const localBudget = getLocalItem(STORAGE_KEYS.BUDGET_PREFIX + uid, null);

  if (db) {
    try {
      const snap = await getDoc(doc(db, "budgets", uid));
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() };
        setLocalItem(STORAGE_KEYS.BUDGET_PREFIX + uid, data);
        return data;
      }
    } catch (err) {
      console.warn("Firestore getBudget failed, using local copy:", err.message);
    }
  }

  return localBudget;
}

export async function saveBudget(uid, budget) {
  if (!uid) return;
  const merged = { ...budget, uid, updatedAt: new Date().toISOString() };
  setLocalItem(STORAGE_KEYS.BUDGET_PREFIX + uid, merged);

  if (db) {
    try {
      await setDoc(
        doc(db, "budgets", uid),
        { ...budget, uid, updatedAt: serverTimestamp() },
        { merge: true }
      );
    } catch (err) {
      console.warn("Firestore saveBudget failed, saved locally:", err.message);
    }
  }
  return merged;
}

// ============================================================
// CHAT HISTORY
// ============================================================
export async function getChatHistory(uid) {
  if (!uid) return [];
  const localChats = getLocalItem(STORAGE_KEYS.CHATS_PREFIX + uid, null);

  if (db) {
    try {
      const q = query(
        collection(db, "chats"),
        where("uid", "==", uid)
      );
      const snap = await getDocs(q);
      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const tA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.timestamp || 0).getTime() || 0;
          const tB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.timestamp || 0).getTime() || 0;
          return tA - tB;
        });
      setLocalItem(STORAGE_KEYS.CHATS_PREFIX + uid, items);
      return items;
    } catch (err) {
      console.warn("Firestore getChatHistory failed, using local copy:", err.message);
    }
  }

  return localChats || [];
}

export async function saveMessage(uid, message) {
  if (!uid) return;
  const currentChats = getLocalItem(STORAGE_KEYS.CHATS_PREFIX + uid, []);
  const updatedChats = [...currentChats, message];
  setLocalItem(STORAGE_KEYS.CHATS_PREFIX + uid, updatedChats);

  if (db) {
    try {
      await addDoc(collection(db, "chats"), {
        uid,
        ...message,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn("Firestore saveMessage failed, saved locally:", err.message);
    }
  }
}