import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, inMemoryPersistence, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const auth = initializeAuth(app, {
  persistence: inMemoryPersistence,
});

const db = getFirestore(app);

// Flag để ngăn connect nhiều lần khi Fast Refresh
let isEmulatorConnected = false;

// Kết nối với Firebase Emulators khi chạy ở chế độ dev
if (__DEV__ && !isEmulatorConnected) {
  isEmulatorConnected = true;
  const apiUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';
  // Trích xuất IP LAN từ API URL (ví dụ: http://192.168.1.100:3000/api/v1 -> 192.168.1.100)
  const ipMatch = apiUrl.match(/\/\/([^:/]+)/);
  const host = ipMatch ? ipMatch[1] : 'localhost';
  
  try {
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    console.log(`[Firebase] Connected to Auth Emulator at http://${host}:9099`);
  } catch (error) {
    console.warn('[Firebase] Failed to connect to Auth Emulator', error);
  }

  try {
    connectFirestoreEmulator(db, host, 8080);
    console.log(`[Firebase] Connected to Firestore Emulator at http://${host}:8080`);
  } catch (error) {
    console.warn('[Firebase] Failed to connect to Firestore Emulator', error);
  }
}

export { app, auth, db };
