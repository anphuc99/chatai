import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, inMemoryPersistence, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCkqBzJfQShMO6yKWvkidD1JBihLh4Asd8',
  authDomain: 'chatai-24b76.firebaseapp.com',
  projectId: 'chatai-24b76',
  storageBucket: 'chatai-24b76.firebasestorage.app',
  messagingSenderId: '44034559036',
  appId: '1:44034559036:android:ed3695cdfa273b999dc739',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const auth = initializeAuth(app, {
  persistence: inMemoryPersistence,
});

const db = getFirestore(app);

// Kết nối với Firebase Emulators khi chạy ở chế độ dev
if (__DEV__) {
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
