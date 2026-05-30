import { Module, Global } from '@nestjs/common';
import { FirebaseAdminProvider, FIREBASE_ADMIN } from './firebase-admin.provider';
import { FirestoreService } from './firestore.service';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [FirebaseAdminProvider, FirestoreService, StorageService],
  exports: [FIREBASE_ADMIN, FirebaseAdminProvider, FirestoreService, StorageService],
})
export class FirebaseModule {}
