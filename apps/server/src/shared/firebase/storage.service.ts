import { Injectable, Inject } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { Bucket } from '@google-cloud/storage';
import { FIREBASE_ADMIN } from './firebase-admin.provider';

export interface AvatarUrls {
  publicUrl: string;
  storagePath: string;
}

@Injectable()
export class StorageService {
  private readonly bucket: Bucket;

  constructor(@Inject(FIREBASE_ADMIN) private readonly adminApp: admin.app.App) {
    this.bucket = this.adminApp.storage().bucket();
  }

  async uploadToPath(path: string, buffer: Buffer, contentType: string): Promise<AvatarUrls> {
    const file = this.bucket.file(path);

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

    const publicUrl = `https://storage.googleapis.com/${this.bucket.name}/${path}`;
    return { publicUrl, storagePath: path };
  }

  async uploadAvatar(uid: string, buffer: Buffer, contentType: string): Promise<AvatarUrls> {
    const ext = contentType.split('/')[1] || 'jpg';
    const storagePath = `avatars/${uid}/${Date.now()}.${ext}`;
    return this.uploadToPath(storagePath, buffer, contentType);
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

  async uploadTtsAudio(cacheHash: string, buffer: Buffer): Promise<AvatarUrls> {
    const path = `tts_audio/${cacheHash}.wav`;
    const file = this.bucket.file(path);

    await file.save(buffer, {
      contentType: 'audio/wav',
      resumable: false,
      metadata: {
        cacheControl: 'public, max-age=2592000',
      },
    });

    try {
      await file.makePublic();
    } catch (error) {
      // Ignore if uniform bucket-level access prevents updating ACLs
    }

    const publicUrl = `https://storage.googleapis.com/${this.bucket.name}/${path}`;
    return { publicUrl, storagePath: path };
  }

  async exists(path: string): Promise<boolean> {
    const [exists] = await this.bucket.file(path).exists();
    return exists;
  }

  async getSignedUrl(path: string, expiresMs = 3600000): Promise<string> {
    return this.getSignedReadUrl(path, expiresMs);
  }

  getPublicUrl(path: string): string {
    return `https://storage.googleapis.com/${this.bucket.name}/${path}`;
  }
}


