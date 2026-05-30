import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { GoogleAuthProvider, signInWithCredential, signOut as fbSignOut } from 'firebase/auth';
import { auth } from '../../../utils/firebase';

export interface SignInResult {
  idToken: string; // Firebase ID Token
  googleIdToken: string; // Google ID Token
  profile: {
    email: string | null;
    name: string | null;
    photo: string | null;
  };
}

export const authService = {
  configure() {
    const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || process.env.EXPO_PUBLIC_FIREBASE_WEB_CLIENT_ID;
    if (!webClientId) {
      console.warn('[AuthService] Missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in env');
    }
    GoogleSignin.configure({
      webClientId,
      offlineAccess: false,
      scopes: ['profile', 'email'],
    });
  },

  async signInWithGoogle(): Promise<SignInResult> {
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const signInResult = await GoogleSignin.signIn();
      
      // Hỗ trợ cả cấu hình cũ và mới của SDK
      const idToken = (signInResult as any).idToken || (signInResult as any).data?.idToken;
      const user = (signInResult as any).user || (signInResult as any).data?.user;

      if (!idToken) {
        throw new Error('NO_GOOGLE_ID_TOKEN');
      }

      // Xác thực với Firebase Auth ở Client Side
      const credential = GoogleAuthProvider.credential(idToken);
      const userCredential = await signInWithCredential(auth, credential);
      const firebaseIdToken = await userCredential.user.getIdToken();

      return {
        idToken: firebaseIdToken,
        googleIdToken: idToken,
        profile: {
          email: user?.email || userCredential.user.email,
          name: user?.name || userCredential.user.displayName,
          photo: user?.photo || userCredential.user.photoURL,
        },
      };
    } catch (error: any) {
      // Chuẩn hóa code lỗi
      if (error.code === 'SIGN_IN_CANCELLED' || error.message?.includes('Sign in action cancelled')) {
        error.code = 'SIGN_IN_CANCELLED';
      } else if (error.code === 'PLAY_SERVICES_NOT_AVAILABLE') {
        error.code = 'PLAY_SERVICES_NOT_AVAILABLE';
      } else if (error.code === 'IN_PROGRESS') {
        error.code = 'IN_PROGRESS';
      }
      throw error;
    }
  },

  async signOut(): Promise<void> {
    try {
      await fbSignOut(auth);
    } catch (e) {
      console.warn('[AuthService] Firebase signOut error:', e);
    }
    try {
      await GoogleSignin.signOut();
    } catch (e) {
      console.warn('[AuthService] Google signOut error:', e);
    }
    try {
      await GoogleSignin.revokeAccess();
    } catch (e) {
      // im lặng nếu không có quyền thu hồi
    }
  },

  async getCurrentIdToken(forceRefresh = false): Promise<string | null> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return null;
    }
    try {
      return await currentUser.getIdToken(forceRefresh);
    } catch (error) {
      console.error('[AuthService] Error getting Firebase ID token:', error);
      return null;
    }
  },
};
