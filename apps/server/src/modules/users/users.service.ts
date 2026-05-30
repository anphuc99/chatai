import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { FirestoreService } from '../../shared/firebase/firestore.service';
import { StorageService } from '../../shared/firebase/storage.service';
import { RedisService } from '../../shared/redis/redis.service';
import { REDIS_PREFIX, REDIS_TTL } from '../../shared/redis/redis.constants';
import { AppException, ERR } from '../../shared/errors/app-exception';
import { UserDto } from '@chatai/shared-types';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { FastifyFile } from './decorators/uploaded-file.decorator';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly firestore: FirestoreService,
    private readonly storage: StorageService,
    private readonly redis: RedisService,
  ) {}

  async getProfile(uid: string): Promise<UserDto> {
    const cacheKey = REDIS_PREFIX.USER_CACHE + uid;

    return this.redis.cacheWrap<UserDto>(cacheKey, REDIS_TTL.USER_CACHE_SEC, async () => {
      let metaRow;
      try {
        metaRow = await this.prisma.usersMeta.findUnique({
          where: { userId: uid },
        });
      } catch (error: any) {
        this.logger.error(`Error querying users_meta for ${uid}: ${error.message}`);
        throw new AppException(ERR.INTERNAL_ERROR as string, 'Lỗi truy vấn cơ sở dữ liệu');
      }

      if (!metaRow) {
        throw new AppException(ERR.NOT_FOUND as string, 'Không tìm thấy thông tin tiến trình của người dùng');
      }

      const doc = await this.firestore.getUserDoc(uid);
      if (!doc) {
        throw new AppException(ERR.NOT_FOUND as string, 'Không tìm thấy hồ sơ người dùng trên Firestore');
      }

      return {
        uid,
        email: doc.email,
        displayName: doc.displayName,
        photoURL: doc.photoURL,
        hskLevel: doc.hskLevel,
        preferences: doc.preferences,
        gems: doc.gems,
        currentStreak: doc.currentStreak,
        highestStreak: doc.highestStreak,
        streakFreezeCount: doc.streakFreezeCount,
        tutorialStep: metaRow.tutorialStep,
      };
    });
  }

  async updatePreferences(uid: string, dto: UpdatePreferencesDto): Promise<UserDto> {
    const partial: Record<string, any> = {};

    if (dto.narratorLanguage !== undefined) {
      partial['preferences.narratorLanguage'] = dto.narratorLanguage;
    }
    if (dto.showPinyin !== undefined) {
      partial['preferences.showPinyin'] = dto.showPinyin;
    }
    if (dto.ttsSpeed !== undefined) {
      partial['preferences.ttsSpeed'] = dto.ttsSpeed;
    }
    if (dto.hskLevel !== undefined) {
      partial['hskLevel'] = dto.hskLevel;
    }

    if (Object.keys(partial).length > 0) {
      try {
        await this.firestore.updateUserDoc(uid, partial);
      } catch (error: any) {
        if (error.status === 404 || error.name === 'NotFoundException') {
          throw new AppException(ERR.NOT_FOUND as string, 'Không tìm thấy hồ sơ người dùng');
        }
        throw new AppException(ERR.INTERNAL_ERROR as string, error.message);
      }
    }

    await this.invalidateCache(uid);
    return this.getProfile(uid);
  }

  async uploadAvatar(uid: string, file: FastifyFile): Promise<{ photoURL: string }> {
    if (!file) {
      throw new AppException(ERR.INVALID_PAYLOAD as string, 'Không có file nào được upload');
    }

    if (file.size > 2 * 1024 * 1024) {
      throw new AppException(ERR.INVALID_PAYLOAD as string, 'Dung lượng avatar không được vượt quá 2MB');
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      throw new AppException(ERR.INVALID_PAYLOAD as string, 'Định dạng ảnh không hợp lệ (chỉ hỗ trợ jpeg, png, webp)');
    }

    let urls;
    try {
      urls = await this.storage.uploadAvatar(uid, file.buffer, file.mimetype);
      await this.firestore.updateUserDoc(uid, { photoURL: urls.publicUrl });
    } catch (error: any) {
      this.logger.error(`Error uploading avatar for ${uid}: ${error.message}`);
      throw new AppException(ERR.INTERNAL_ERROR as string, 'Lỗi trong quá trình lưu trữ avatar');
    }

    await this.invalidateCache(uid);
    return { photoURL: urls.publicUrl };
  }

  private async invalidateCache(uid: string): Promise<void> {
    const cacheKey = REDIS_PREFIX.USER_CACHE + uid;
    await this.redis.del(cacheKey);
  }
}
