import { doc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { db } from '../../../utils/firebase';
import { UserDto } from '@chatai/shared-types';

export const firestoreSubscription = {
  subscribeUserDoc(
    uid: string,
    onChange: (docData: Partial<UserDto>) => void
  ): Unsubscribe {
    const userDocRef = doc(db, 'users', uid);
    return onSnapshot(
      userDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          // Trả về dữ liệu Firestore đã được parse
          onChange(data as Partial<UserDto>);
        }
      },
      (error) => {
        console.warn('[FirestoreSubscription] Subscription error:', error);
      }
    );
  },
};
