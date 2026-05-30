import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import { REDIS_PREFIX, REDIS_TTL } from '../../shared/redis/redis.constants';
import { AppException, ERR } from '../../shared/errors/app-exception';
import { StoryDto } from '@chatai/shared-types';
import { CreateStoryDto } from './dto/create-story.dto';
import { UpdateStoryDto } from './dto/update-story.dto';

@Injectable()
export class StoriesService {
  private readonly logger = new Logger(StoriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async list(
    uid: string,
    cursor?: string,
    limit: number = 20,
  ): Promise<{ items: StoryDto[]; nextCursor?: string }> {
    // Chỉ cache trang đầu (khi không có cursor) và limit mặc định là 20
    if (!cursor && limit === 20) {
      const cacheKey = `${REDIS_PREFIX.STORY_CACHE}list:${uid}`;
      return this.redis.cacheWrap(cacheKey, REDIS_TTL.STORY_CACHE_SEC, () =>
        this.fetchListFromDb(uid, cursor, limit),
      );
    }
    return this.fetchListFromDb(uid, cursor, limit);
  }

  private async fetchListFromDb(
    uid: string,
    cursor?: string,
    limit: number = 20,
  ): Promise<{ items: StoryDto[]; nextCursor?: string }> {
    try {
      const rows = await this.prisma.story.findMany({
        where: { userId: uid },
        take: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        skip: cursor ? 1 : 0,
        orderBy: { updatedAt: 'desc' },
        include: {
          _count: {
            select: { characters: true },
          },
        },
      });

      const hasMore = rows.length > limit;
      const items = (hasMore ? rows.slice(0, limit) : rows).map((row) => this.toDto(row));
      const nextCursor = hasMore ? items[items.length - 1].id : undefined;

      return { items, nextCursor };
    } catch (error: any) {
      this.logger.error(`Error fetching story list for user ${uid}: ${error.message}`);
      throw new AppException(ERR.INTERNAL_ERROR as string, 'Lỗi truy vấn cơ sở dữ liệu');
    }
  }

  async getById(uid: string, id: string): Promise<StoryDto> {
    const cacheKey = `${REDIS_PREFIX.STORY_CACHE}${id}`;
    
    const story = await this.redis.cacheWrap(cacheKey, REDIS_TTL.STORY_CACHE_SEC, async () => {
      const row = await this.prisma.story.findUnique({
        where: { id },
        include: {
          _count: {
            select: { characters: true },
          },
        },
      });
      if (!row) {
        throw new AppException(ERR.NOT_FOUND as string, 'Không tìm thấy câu chuyện');
      }
      return this.toDto(row);
    });

    if (story.userId !== uid) {
      throw new AppException(ERR.FORBIDDEN as string, 'Không có quyền truy cập câu chuyện này');
    }

    return story;
  }

  async create(uid: string, dto: CreateStoryDto): Promise<StoryDto> {
    try {
      const row = await this.prisma.story.create({
        data: {
          userId: uid,
          title: dto.title,
          initialSetting: dto.initialSetting,
        },
      });
      await this.invalidateCache(uid);
      return this.toDto(row, { characters: 0 });
    } catch (error: any) {
      this.logger.error(`Error creating story for user ${uid}: ${error.message}`);
      throw new AppException(ERR.INTERNAL_ERROR as string, 'Lỗi trong quá trình tạo câu chuyện');
    }
  }

  async update(uid: string, id: string, dto: UpdateStoryDto): Promise<StoryDto> {
    await this.assertOwnership(uid, id);
    try {
      const updated = await this.prisma.story.update({
        where: { id },
        data: dto,
        include: {
          _count: {
            select: { characters: true },
          },
        },
      });
      await this.invalidateCache(uid, id);
      return this.toDto(updated);
    } catch (error: any) {
      this.logger.error(`Error updating story ${id} for user ${uid}: ${error.message}`);
      throw new AppException(ERR.INTERNAL_ERROR as string, 'Lỗi trong quá trình cập nhật câu chuyện');
    }
  }

  async delete(uid: string, id: string): Promise<void> {
    await this.assertOwnership(uid, id);

    const activeSession = await this.hasActiveSession(id);
    if (activeSession) {
      throw new AppException(
        ERR.STORY_HAS_ACTIVE_SESSION as string,
        'Không thể xóa câu chuyện đang có phiên hội thoại hoạt động',
      );
    }

    try {
      await this.prisma.story.delete({
        where: { id },
      });
      await this.invalidateCache(uid, id);
    } catch (error: any) {
      this.logger.error(`Error deleting story ${id} for user ${uid}: ${error.message}`);
      throw new AppException(ERR.INTERNAL_ERROR as string, 'Lỗi trong quá trình xóa câu chuyện');
    }
  }

  private async assertOwnership(uid: string, id: string) {
    const row = await this.prisma.story.findUnique({
      where: { id },
      include: {
        _count: {
          select: { characters: true },
        },
      },
    });
    if (!row) {
      throw new AppException(ERR.NOT_FOUND as string, 'Không tìm thấy câu chuyện');
    }
    if (row.userId !== uid) {
      throw new AppException(ERR.FORBIDDEN as string, 'Không có quyền truy cập câu chuyện này');
    }
    return row;
  }

  private async hasActiveSession(storyId: string): Promise<boolean> {
    try {
      // Bảng Session chưa tồn tại ở phase 2.
      // Dùng Prisma dynamic query hoặc check nếu có model Session.
      // Tạm thời mock trả về false. Khi có Session model, ta sẽ triển khai thực tế.
      const prismaAny = this.prisma as any;
      if (prismaAny.session) {
        const count = await prismaAny.session.count({
          where: { storyId, status: 'active' },
        });
        return count > 0;
      }
      return false;
    } catch {
      return false;
    }
  }

  private toDto(row: any, counts?: { characters: number }): StoryDto {
    return {
      id: row.id,
      userId: row.userId,
      title: row.title,
      initialSetting: row.initialSetting,
      currentProgress: row.currentProgress || '',
      characterCount: counts ? counts.characters : (row._count?.characters ?? 0),
      sessionCount: 0, // Mock return 0 ở phase này
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async invalidateCache(uid: string, id?: string): Promise<void> {
    const listCacheKey = `${REDIS_PREFIX.STORY_CACHE}list:${uid}`;
    await this.redis.del(listCacheKey);
    if (id) {
      const detailCacheKey = `${REDIS_PREFIX.STORY_CACHE}${id}`;
      await this.redis.del(detailCacheKey);
    }
  }
}
