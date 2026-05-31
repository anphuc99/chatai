import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AppException, ERR } from '../../shared/errors/app-exception';
import { ListSessionsDto } from './dto/list-sessions.dto';
import { SessionSummaryDto } from './dto/session-summary.dto';
import { SessionDetailDto, MessageDto } from './dto/session-detail.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class JournalService {
  constructor(private readonly prisma: PrismaService) {}

  private encodeCursor(ms: number): string {
    return Buffer.from(String(ms)).toString('base64url');
  }

  private decodeCursor(c: string): number {
    try {
      const decoded = Buffer.from(c, 'base64url').toString('utf8');
      const val = parseInt(decoded, 10);
      return isNaN(val) ? 0 : val;
    } catch {
      return 0;
    }
  }

  async list(uid: string, opts: ListSessionsDto): Promise<{ items: SessionSummaryDto[]; nextCursor: string | null }> {
    const { storyId, cursor, limit } = opts;

    const whereBase: Prisma.SessionWhereInput = {
      userId: uid,
      status: 'ended',
      ...(storyId ? { storyId } : {}),
    };

    if (cursor) {
      const decodedMs = this.decodeCursor(cursor);
      whereBase.endedAt = { lt: BigInt(decodedMs) };
    }

    const sessions = await this.prisma.session.findMany({
      where: whereBase,
      orderBy: { endedAt: 'desc' },
      take: limit + 1,
      include: {
        story: {
          select: {
            title: true,
          },
        },
      },
    });

    const hasMore = sessions.length > limit;
    const page = hasMore ? sessions.slice(0, limit) : sessions;
    const sessionIds = page.map((s) => s.id);

    if (sessionIds.length === 0) {
      return { items: [], nextCursor: null };
    }

    const [counts, wordCounts] = await Promise.all([
      this.prisma.message.groupBy({
        by: ['sessionId'],
        where: { sessionId: { in: sessionIds } },
        _count: { _all: true },
      }),
      this.prisma.message.groupBy({
        by: ['sessionId'],
        where: {
          sessionId: { in: sessionIds },
          words: { not: Prisma.DbNull },
        },
        _count: { _all: true },
      }),
    ]);

    const countMap = new Map<string, number>(
      counts.map((c) => [c.sessionId, c._count._all]),
    );
    const wordMap = new Map<string, number>(
      wordCounts.map((w) => [w.sessionId, w._count._all]),
    );

    const items: SessionSummaryDto[] = page.map((s) => ({
      id: s.id,
      storyId: s.storyId,
      storyTitle: s.story.title,
      summary: s.summary ?? '',
      startedAt: Number(s.startedAt),
      endedAt: s.endedAt ? Number(s.endedAt) : 0,
      messageCount: countMap.get(s.id) ?? 0,
      wordCount: wordMap.get(s.id) ?? 0,
    }));

    const lastSession = page[page.length - 1];
    const nextCursor = hasMore && lastSession && lastSession.endedAt
      ? this.encodeCursor(Number(lastSession.endedAt))
      : null;

    return { items, nextCursor };
  }

  async detail(uid: string, sid: string): Promise<SessionDetailDto> {
    const s = await this.prisma.session.findUnique({
      where: { id: sid },
      include: {
        story: {
          select: {
            title: true,
          },
        },
      },
    });

    if (!s) {
      throw new AppException(ERR.SESSION_NOT_FOUND);
    }
    if (s.userId !== uid) {
      throw new AppException(ERR.FORBIDDEN);
    }
    if (s.status !== 'ended') {
      throw new AppException(ERR.SESSION_ENDED_REQUIRED);
    }

    const messages = await this.prisma.message.findMany({
      where: { sessionId: sid },
      orderBy: { turnOrder: 'asc' },
    });

    const msgCount = messages.length;
    const wordCount = messages.filter((m) => m.words !== null).length;

    const messageDtos: MessageDto[] = messages.map((m) => ({
      id: m.id,
      role: m.role,
      characterId: m.characterId,
      characterName: m.characterName,
      text: m.text,
      translation: m.translation,
      emotion: m.emotion,
      intensity: m.intensity,
      words: m.words,
      shopEvent: m.shopEvent,
      turnOrder: m.turnOrder,
      timestamp: Number(m.timestamp),
    }));

    return {
      id: s.id,
      storyId: s.storyId,
      storyTitle: s.story.title,
      summary: s.summary ?? '',
      startedAt: Number(s.startedAt),
      endedAt: s.endedAt ? Number(s.endedAt) : 0,
      messageCount: msgCount,
      wordCount,
      messages: messageDtos,
    };
  }
}
