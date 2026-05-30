import { Injectable, Inject } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { FIREBASE_ADMIN } from './firebase-admin.provider';

export interface AvatarUrls {
  publicUrl: string;
  storagePath: string;
}

@Injectable()
export class StorageService {
  private readonly bucket: any; // admin.storage.Bucket

  constructor(@Inject(FIREBASE_ADMIN) private readonly adminApp: admin.app.App) {
    this.bucket = this.adminApp.storage().bucket();
  }

  async uploadAvatar(uid: string, buffer: Buffer, contentType: string): Promise<AvatarUrls> {
    const ext = contentType.split('/')[1] || 'jpg';
    const storagePath = `avatars/${uid}/${Date.now()}.${ext}`;
    const file = this.bucket.file(storagePath);

    await file.save(buffer, {
      contentType,
      resumable: false,
      metadata: {
        cacheControl: 'public, max-age=86400',
      },
    });

    try {
      await file.makePublic();
    } catch (error) {
      // Ignore if uniform bucket-level access prevents updating ACLs
    }

    const publicUrl = `https://storage.googleapis.com/${this.bucket.name}/${storagePath}`;
    return { publicUrl, storagePath };
  }

  async deleteFile(path: string): Promise<void> {
    await this.bucket.file(path).delete({ ignoreNotFound: true });
  }

  async getSignedReadUrl(path: string, expiresMs = 3600000): Promise<string> {
    const file = this.bucket.file(path);
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + expiresMs,
    });
    return url;
  }
}
