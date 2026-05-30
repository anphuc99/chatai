import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { FIREBASE_ADMIN } from './firebase-admin.provider';
import { HskLevel, Preferences } from '@chatai/shared-types';

export interface UserDoc {
  email: string;
  displayName: string;
  photoURL: string;
  hskLevel: HskLevel;
  preferences: Preferences;
  gems: number;
  currentStreak: number;
  highestStreak: number;
  streakFreezeCount: number;
  createdAt?: admin.firestore.FieldValue;
  updatedAt?: admin.firestore.FieldValue;
}

@Injectable()
export class FirestoreService {
  private readonly db: admin.firestore.Firestore;

  constructor(@Inject(FIREBASE_ADMIN) private readonly adminApp: admin.app.App) {
    this.db = this.adminApp.firestore();
  }

  async getUserDoc(uid: string): Promise<UserDoc | null> {
    const snap = await this.db.doc(`users/${uid}`).get();
    return snap.exists ? (snap.data() as UserDoc) : null;
  }

  async createUserDoc(uid: string, initial: Partial<UserDoc>): Promise<void> {
    const defaults = {
      email: '',
      displayName: '',
      photoURL: '',
      hskLevel: 'HSK1' as HskLevel,
      preferences: {
        narratorLanguage: 'vi',
        showPinyin: true,
        ttsSpeed: 1.0,
      },
      gems: 0,
      currentStreak: 0,
      highestStreak: 0,
      streakFreezeCount: 0,
    };

    const docRef = this.db.doc(`users/${uid}`);
    await docRef.set({
      ...defaults,
      ...initial,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async updateUserDoc(uid: string, partial: Record<string, any>): Promise<void> {
    const docRef = this.db.doc(`users/${uid}`);
    const snap = await docRef.get();
    if (!snap.exists) {
      throw new NotFoundException(`User doc not found: ${uid}`);
    }
    await docRef.update({
      ...partial,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async mergeUserDoc(uid: string, partial: Partial<UserDoc>): Promise<void> {
    const docRef = this.db.doc(`users/${uid}`);
    await docRef.set(
      {
        ...partial,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  async incrementField(uid: string, field: string, delta: number): Promise<void> {
    const docRef = this.db.doc(`users/${uid}`);
    await docRef.update({
      [field]: admin.firestore.FieldValue.increment(delta),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
}
