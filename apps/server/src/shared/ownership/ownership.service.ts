import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppException, ERR } from '../errors/app-exception';

@Injectable()
export class OwnershipService {
  constructor(private readonly prisma: PrismaService) {}

  async assertStoryOwner(uid: string, sid: string) {
    const story = await this.prisma.story.findUnique({
      where: { id: sid },
    });
    if (!story) {
      throw new AppException(ERR.NOT_FOUND, 'Không tìm thấy câu chuyện');
    }
    if (story.userId !== uid) {
      throw new AppException(ERR.FORBIDDEN, 'Không có quyền truy cập câu chuyện này');
    }
    return story;
  }

  async assertCharacterOwner(uid: string, cid: string) {
    const char = await this.prisma.character.findUnique({
      where: { id: cid },
      include: { story: true },
    });
    if (!char) {
      throw new AppException(ERR.NOT_FOUND, 'Không tìm thấy nhân vật');
    }
    if (char.story.userId !== uid) {
      throw new AppException(ERR.FORBIDDEN, 'Không có quyền truy cập nhân vật này');
    }
    return char;
  }
}
