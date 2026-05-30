import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { StorageService } from '../../shared/firebase/storage.service';
import { OwnershipService } from '../../shared/ownership/ownership.service';
import { RedisService } from '../../shared/redis/redis.service';
import { REDIS_PREFIX, REDIS_TTL } from '../../shared/redis/redis.constants';
import { AppException, ERR } from '../../shared/errors/app-exception';
import { CharacterDto } from '@chatai/shared-types';
import { CreateCharacterDto } from './dto/create-character.dto';
import { UpdateCharacterDto } from './dto/update-character.dto';
import { CharacterResponseDto } from './dto/character-response.dto';
import { plainToInstance } from 'class-transformer';
import { isValidVoice } from './voice.constants';
import { FastifyFile } from '../users/decorators/uploaded-file.decorator';

@Injectable()
export class CharactersService {
  private readonly logger = new Logger(CharactersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ownership: OwnershipService,
    private readonly redis: RedisService,
  ) {}

  async listByStory(uid: string, storyId: string): Promise<CharacterDto[]> {
    await this.ownership.assertStoryOwner(uid, storyId);

    const cacheKey = `${REDIS_PREFIX.CHAR_CACHE}list:${storyId}`;
    return this.redis.cacheWrap(cacheKey, REDIS_TTL.CHAR_CACHE_SEC, async () => {
      try {
        const rows = await this.prisma.character.findMany({
          where: { storyId },
          orderBy: { createdAt: 'asc' },
        });
        return rows.map((row: any) => this.toDto(row));
      } catch (error: any) {
        this.logger.error(`Error listing characters for story ${storyId}: ${error.message}`);
        throw new AppException(ERR.INTERNAL_ERROR as string, 'Lỗi truy vấn cơ sở dữ liệu');
      }
    });
  }

  async create(uid: string, storyId: string, dto: CreateCharacterDto): Promise<CharacterDto> {
    await this.ownership.assertStoryOwner(uid, storyId);

    if (!isValidVoice(dto.voiceName)) {
      throw new AppException(ERR.INVALID_PAYLOAD as string, 'Giọng nói được chọn không hợp lệ');
    }

    try {
      const row = await this.prisma.character.create({
        data: {
          storyId,
          name: dto.name,
          age: dto.age ?? null,
          personality: dto.personality,
          voiceName: dto.voiceName,
          pitch: dto.pitch,
          avatarUrl: null,
        },
      });

      await this.invalidateCache(storyId, row.id);
      return this.toDto(row);
    } catch (error: any) {
      this.logger.error(`Error creating character in story ${storyId}: ${error.message}`);
      throw new AppException(ERR.INTERNAL_ERROR as string, 'Lỗi trong quá trình tạo nhân vật');
    }
  }

  async update(uid: string, id: string, dto: UpdateCharacterDto): Promise<CharacterDto> {
    const char = await this.ownership.assertCharacterOwner(uid, id);

    if (dto.voiceName && !isValidVoice(dto.voiceName)) {
      throw new AppException(ERR.INVALID_PAYLOAD as string, 'Giọng nói được chọn không hợp lệ');
    }

    try {
      const updated = await this.prisma.character.update({
        where: { id },
        data: {
          name: dto.name,
          age: dto.age !== undefined ? dto.age : undefined,
          personality: dto.personality,
          voiceName: dto.voiceName,
          pitch: dto.pitch,
        },
      });

      await this.invalidateCache(char.storyId, id);
      return this.toDto(updated);
    } catch (error: any) {
      this.logger.error(`Error updating character ${id}: ${error.message}`);
      throw new AppException(ERR.INTERNAL_ERROR as string, 'Lỗi trong quá trình cập nhật nhân vật');
    }
  }

  async delete(uid: string, id: string): Promise<void> {
    const char = await this.ownership.assertCharacterOwner(uid, id);

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.detachMessages(tx, id);
        await tx.character.delete({
          where: { id },
        });
      });

      await this.invalidateCache(char.storyId, id);
    } catch (error: any) {
      this.logger.error(`Error deleting character ${id}: ${error.message}`);
      throw new AppException(ERR.INTERNAL_ERROR as string, 'Lỗi trong quá trình xóa nhân vật');
    }
  }

  async uploadAvatar(uid: string, id: string, file: FastifyFile): Promise<{ avatarUrl: string }> {
    const char = await this.ownership.assertCharacterOwner(uid, id);

    if (!file) {
      throw new AppException(ERR.INVALID_PAYLOAD as string, 'Không có file nào được upload');
    }

    if (file.size > 2 * 1024 * 1024) {
      throw new AppException(ERR.INVALID_PAYLOAD as string, 'Dung lượng avatar không được vượt quá 2MB');
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      throw new AppException(ERR.INVALID_PAYLOAD as string, 'Định dạng ảnh không hợp lệ (chỉ hỗ trợ jpeg, png, webp)');
    }

    let buffer = file.buffer;
    try {
      buffer = await sharp(file.buffer).resize(256, 256).jpeg().toBuffer();
    } catch (error: any) {
      this.logger.warn(`Sharp resize not available or failed, using raw buffer: ${error.message}`);
    }

    const path = `characters/${id}/${Date.now()}.jpg`;
    let urls;
    try {
      urls = await this.storage.uploadToPath(path, buffer, 'image/jpeg');
      await this.prisma.character.update({
        where: { id },
        data: { avatarUrl: urls.publicUrl },
      });
    } catch (error: any) {
      this.logger.error(`Error uploading avatar for character ${id}: ${error.message}`);
      throw new AppException(ERR.INTERNAL_ERROR as string, 'Lỗi trong quá trình lưu trữ avatar');
    }

    await this.invalidateCache(char.storyId, id);
    return { avatarUrl: urls.publicUrl };
  }

  private async detachMessages(tx: any, characterId: string): Promise<void> {
    try {
      if (tx.message) {
        await tx.message.updateMany({
          where: { characterId },
          data: { characterId: null },
        });
      }
    } catch (error: any) {
      this.logger.warn(`Failed to detach messages for character ${characterId}: ${error.message}`);
    }
  }

  private toDto(row: any): CharacterDto {
    return plainToInstance(CharacterResponseDto, {
      id: row.id,
      storyId: row.storyId,
      name: row.name,
      age: row.age,
      personality: row.personality,
      avatarUrl: row.avatarUrl,
      voiceName: row.voiceName,
      pitch: row.pitch,
      createdAt: row.createdAt.toISOString(),
    });
  }

  private async invalidateCache(storyId: string, id?: string): Promise<void> {
    const listCacheKey = `${REDIS_PREFIX.CHAR_CACHE}list:${storyId}`;
    await this.redis.del(listCacheKey);
    if (id) {
      const detailCacheKey = `${REDIS_PREFIX.CHAR_CACHE}${id}`;
      await this.redis.del(detailCacheKey);
    }
  }
}
