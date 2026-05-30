import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import * as fs from 'fs';

export const FIREBASE_ADMIN = Symbol('FIREBASE_ADMIN');

export const FirebaseAdminProvider: Provider = {
  provide: FIREBASE_ADMIN,
  inject: [ConfigService],
  useFactory: (config: ConfigService): admin.app.App => {
    if (admin.apps.length > 0) {
      return admin.app();
    }

    const saPath = config.get<string>('firebaseServiceAccountPath');
    let credential: admin.credential.Credential | undefined;

    if (saPath && fs.existsSync(saPath)) {
      const saJson = JSON.parse(fs.readFileSync(saPath, 'utf8'));
      credential = admin.credential.cert(saJson);
    } else {
      // If no file exists, we might be in emulator mode or we let it use default application credentials
      credential = admin.credential.applicationDefault();
    }

    admin.initializeApp({
      credential,
      projectId: config.get<string>('firebaseProjectId'),
      storageBucket: config.get<string>('firebaseStorageBucket'),
    });

    return admin.app();
  },
};
