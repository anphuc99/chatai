import { Injectable, Inject, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { FIREBASE_ADMIN } from './firebase-admin.provider';
import { AppException, ERR } from '../../shared/errors/app-exception';
import { UserDto } from './dto/user-response.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(FIREBASE_ADMIN) private readonly firebaseAdmin: admin.app.App,
    private readonly prisma: PrismaService,
  ) {}

  async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    let decoded: admin.auth.DecodedIdToken;
    try {
      decoded = await this.firebaseAdmin.auth().verifyIdToken(idToken, true);
    } catch (e: any) {
      throw new AppException(ERR.INVALID_TOKEN as string, e.message);
    }

    if ((decoded as any).disabled) {
      throw new AppException(ERR.USER_DISABLED as string);
    }

    return decoded;
  }

  async upsertUser(decoded: admin.auth.DecodedIdToken): Promise<UserDto> {
    const uid = decoded.uid;
    
    try {
      const row = await this.prisma.usersMeta.upsert({
        where: { userId: uid },
        create: { userId: uid, tutorialStep: 0 },
        update: {},
      });

      const userDto: UserDto = {
        uid,
        email: decoded.email ?? '',
        displayName: decoded.name ?? '',
        photoURL: decoded.picture ?? '',
        hskLevel: 'HSK1',
        preferences: {
          narratorLanguage: 'vi',
          showPinyin: true,
          ttsSpeed: 1.0,
        },
        gems: 0,
        currentStreak: 0,
        highestStreak: 0,
        streakFreezeCount: 0,
        tutorialStep: row.tutorialStep,
      };

      return userDto;
    } catch (error: any) {
      this.logger.error(`Error in upsertUser for ${uid}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async invalidateSession(uid: string): Promise<void> {
    try {
      await this.firebaseAdmin.auth().revokeRefreshTokens(uid);
    } catch (error: any) {
      this.logger.error(`Error invalidating session for ${uid}: ${error.message}`);
      throw new AppException(ERR.INTERNAL_ERROR as string, 'Không thể thu hồi token');
    }
  }
}
