import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { OnEvent } from '@nestjs/event-emitter';
import { EVENTS } from '../../shared/events/event-names';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import { ChromaClient } from './chroma.client';
import { MemoryJob } from './types/memory-job';
import { EmbeddingService } from './embedding.service';
import { LlmService } from '../chat/services/llm.service';
import { MultiQueryGenerator } from './services/multi-query-generator';
import { SlidingWindow } from './services/sliding-window';
import { MemoryChunk } from './types/memory-document';

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    @InjectQueue('memory-write') private readonly memoryQueue: Queue<MemoryJob>,
    private readonly chroma: ChromaClient,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly embeddingService: EmbeddingService,
    private readonly llmService: LlmService,
    private readonly multiQueryGenerator: MultiQueryGenerator,
    private readonly slidingWindow: SlidingWindow,
  ) {}

  @OnEvent(EVENTS.MEMORY_TRIGGER)
  async onTrigger(payload: {
    sessionId: string;
    userId: string;
    storyId?: string;
    type?: string;
  }): Promise<void> {
    this.logger.log(`Received MEMORY_TRIGGER for session ${payload.sessionId}`);

    let storyId = payload.storyId;
    if (!storyId) {
      const session = await this.prisma.session.findUnique({
        where: { id: payload.sessionId },
        select: { storyId: true },
      });
      if (session) {
        storyId = session.storyId;
      }
    }

    if (!storyId) {
      this.logger.error(`Cannot enqueue memory write: storyId not found for session ${payload.sessionId}`);
      return;
    }

    await this.enqueueWrite({
      sessionId: payload.sessionId,
      userId: payload.userId,
      storyId,
      type: 'plot',
    });
  }

  async enqueueWrite(payload: MemoryJob): Promise<any> {
    const jobId = `mem:write:${payload.sessionId}`;
    this.logger.log(`Enqueuing memory-write job for session ${payload.sessionId} (jobId: ${jobId})`);

    return this.memoryQueue.add('write-chunk', payload, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 30000 },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

  async getLastChunkIndex(
    userId: string,
    storyId: string,
    type: 'plot' | 'character',
  ): Promise<number> {
    const cacheKey = `mem:lastidx:${userId}:${storyId}:${type}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached !== null && cached !== undefined) {
        return parseInt(cached, 10);
      }
    } catch (e: any) {
      this.logger.warn(`Redis get cache failed for last chunk index: ${e.message}`);
    }

    // Workaround: bge-m3 embedding model size is 1024. Query Chroma with a zeroVector.
    const zeroVector = new Array(1024).fill(0);
    const filter = {
      user_id: userId,
      story_id: storyId,
      memory_type: type,
    };

    try {
      const chunks = await this.chroma.query(zeroVector, filter, 200);
      let maxIdx = 0;
      if (chunks.length > 0) {
        maxIdx = Math.max(...chunks.map((c) => c.metadata.chunk_index));
      }

      try {
        await this.redis.set(cacheKey, maxIdx.toString(), 60); // 60s TTL
      } catch (e: any) {
        this.logger.warn(`Redis set cache failed for last chunk index: ${e.message}`);
      }

      return maxIdx;
    } catch (e: any) {
      this.logger.error(`Chroma query failed in getLastChunkIndex: ${e.message}`);
      throw e;
    }
  }

  async getActiveCharactersInSession(messages: any[]): Promise<any[]> {
    const charIds = new Set<string>();
    for (const m of messages) {
      if (m.role === 'assistant' && m.characterId) {
        charIds.add(m.characterId);
      }
    }

    if (charIds.size === 0) return [];

    return this.prisma.character.findMany({
      where: { id: { in: [...charIds] } },
    });
  }

  formatMessagesForSummary(messages: any[]): string {
    const lines = messages.map((m) => {
      switch (m.role) {
        case 'user':
          return `User: ${m.text}`;
        case 'assistant':
          const emo = m.emotion ? ` (${m.emotion})` : '';
          return `${m.characterName || 'Assistant'}${emo}: ${m.text}`;
        case 'persistent_ooc':
        case 'ephemeral_ooc':
          return `[OOC: ${m.text}]`;
        default:
          return `${m.role}: ${m.text}`;
      }
    });
    return lines.join('\n');
  }

  async retrieveContext(
    userId: string,
    storyId: string,
    userMessage: string,
    activeCharNames: string[],
  ): Promise<string> {
    const PER_QUERY_K_PLOT = 3;
    const PER_QUERY_K_CHAR = 2;
    const MAX_TOTAL_CHARS = 3000;
    const t0 = Date.now();

    try {
      // 1. Multi-query generation
      const queries = await this.multiQueryGenerator.generate(userMessage);

      // 2. Embed queries
      const qEmbs = await this.embeddingService.embedBatch(queries, 3);

      // 3. Parallel Chroma searches
      const baseFilter = { user_id: userId, story_id: storyId };

      const plotSearches = qEmbs.map((emb) =>
        this.chroma.query(emb, { ...baseFilter, memory_type: 'plot' }, PER_QUERY_K_PLOT),
      );

      const charSearches = activeCharNames.flatMap((name) =>
        qEmbs.map((emb) =>
          this.chroma.query(
            emb,
            { ...baseFilter, memory_type: 'character', character_name: name },
            PER_QUERY_K_CHAR,
          ),
        ),
      );

      const [plotResultsArr, charResultsArr] = await Promise.all([
        Promise.all(plotSearches),
        Promise.all(charSearches),
      ]);

      const plotResults = plotResultsArr.flat();
      const charResults = charResultsArr.flat();

      // 4. Merge & Dedup by id
      const seedMap = new Map<string, MemoryChunk>();
      for (const c of [...plotResults, ...charResults]) {
        seedMap.set(c.id, c);
      }
      const seeds = Array.from(seedMap.values());

      if (seeds.length === 0) {
        this.logger.debug({ retrievalTimeMs: Date.now() - t0 }, 'memory: no seeds');
        return '';
      }

      // 5. Sliding window expansion
      const expanded = await this.slidingWindow.expand(seeds, baseFilter, 5);

      // 6. Sort: plot first, then characters, ordered by chunk_index asc
      expanded.sort((a, b) => {
        if (a.metadata.memory_type !== b.metadata.memory_type) {
          return a.metadata.memory_type === 'plot' ? -1 : 1;
        }
        return a.metadata.chunk_index - b.metadata.chunk_index;
      });

      // 7. Format context string
      const pieces = expanded.map((c) => {
        const tag =
          c.metadata.memory_type === 'plot'
            ? `[#${c.metadata.chunk_index} Plot]`
            : `[#${c.metadata.chunk_index} ${c.metadata.character_name}]`;
        return `${tag} ${c.content}`;
      });
      const final = pieces.join('\n\n');

      if (final.length > MAX_TOTAL_CHARS) {
        const condensed = await this.llmService.summarize(final, 'session');
        this.logger.debug(
          {
            originalLen: final.length,
            condensedLen: condensed.length,
            retrievalTimeMs: Date.now() - t0,
          },
          'memory: condensed',
        );
        return condensed;
      }

      this.logger.debug(
        {
          seedCount: seeds.length,
          expandedCount: expanded.length,
          finalLength: final.length,
          retrievalTimeMs: Date.now() - t0,
        },
        'memory: ok',
      );
      return final;
    } catch (e: any) {
      this.logger.warn(
        { err: e.message || e, retrievalTimeMs: Date.now() - t0 },
        'memory: failed → empty fallback',
      );
      return ''; // Graceful degradation
    }
  }
}
