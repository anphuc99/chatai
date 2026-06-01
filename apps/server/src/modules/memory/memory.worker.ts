import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { LlmService } from '../chat/services/llm.service';
import { EmbeddingService } from './embedding.service';
import { ChromaClient } from './chroma.client';
import { MemoryService } from './memory.service';
import { MemoryJob } from './types/memory-job';

@Processor('memory-write')
export class MemoryWorker extends WorkerHost {
  private readonly logger = new Logger(MemoryWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LlmService,
    private readonly embeddingService: EmbeddingService,
    private readonly chroma: ChromaClient,
    private readonly memoryService: MemoryService,
  ) {
    super();
  }

  async process(job: Job<MemoryJob>): Promise<void> {
    const payload = job.data;
    this.logger.log(`Processing memory-write job for session ${payload.sessionId}`);

    try {
      // 1. Load messages
      const messages = await this.prisma.message.findMany({
        where: { sessionId: payload.sessionId },
        orderBy: { turnOrder: 'asc' },
      });

      if (messages.length === 0) {
        this.logger.warn(`No messages found for session ${payload.sessionId}. Skipping memory write.`);
        return;
      }

      // 2. Format text
      const text = this.memoryService.formatMessagesForSummary(messages);

      // 3. Plot summary + embed + write
      await this.writePlot(payload, messages, text);

      // 4. Character memories
      const characters = await this.memoryService.getActiveCharactersInSession(messages);
      if (characters.length > 0) {
        await this.writeCharacterMemories(payload, messages, text, characters);
      }

      this.logger.log(`Successfully completed memory write for session ${payload.sessionId}.`);
    } catch (error: any) {
      this.logger.error(`Failed to process memory-write job for session ${payload.sessionId}: ${error.message}`);
      throw error; // Rethrow to let BullMQ handle retry mechanism
    }
  }

  private async writePlot(
    payload: MemoryJob,
    messages: any[],
    text: string,
  ): Promise<void> {
    const docId = `${payload.sessionId}_plot`;
    const existing = await this.chroma.getByIds([docId]);
    if (existing.length > 0) {
      this.logger.log(`Plot memory already written for session ${payload.sessionId}. Skipping plot generation.`);
      return;
    }

    this.logger.log(`Summarizing and embedding plot for session ${payload.sessionId}`);

    let summary = await this.llmService.summarize(text, 'plot');
    if (summary.length > 2000) {
      summary = summary.slice(0, 2000) + '...';
    }

    const embedding = await this.embeddingService.embed(summary);
    const turnStart = messages[0].turnOrder;
    const turnEnd = messages[messages.length - 1].turnOrder;
    const chunkIdx = await this.memoryService.getNextChunkIndex(payload.userId, payload.storyId, 'plot');

    await this.chroma.addDocuments([
      {
        id: docId,
        content: summary,
        embedding,
        metadata: {
          user_id: payload.userId,
          story_id: payload.storyId,
          session_id: payload.sessionId,
          chunk_index: chunkIdx,
          memory_type: 'plot',
          character_name: null,
          timestamp: Date.now(),
          turn_start: turnStart,
          turn_end: turnEnd,
        },
      },
    ]);
  }

  private async writeCharacterMemories(
    payload: MemoryJob,
    messages: any[],
    text: string,
    characters: any[],
  ): Promise<void> {
    this.logger.log(`Processing character memories for ${characters.length} characters in session ${payload.sessionId}`);
    const turnStart = messages[0].turnOrder;
    const turnEnd = messages[messages.length - 1].turnOrder;

    // Process characters sequentially to avoid overloading Ollama
    for (const char of characters) {
      const docId = `${payload.sessionId}_char_${char.id}`;
      const existing = await this.chroma.getByIds([docId]);
      if (existing.length > 0) {
        this.logger.log(`Character memory already written for ${char.name} in session ${payload.sessionId}. Skipping.`);
        continue;
      }

      this.logger.log(`Generating memory for character ${char.name} (ID: ${char.id})`);

      const summaryRaw = await this.llmService.summarize(text, 'character', { CHAR_NAME: char.name });

      let summary = summaryRaw;
      if (summary.length > 1500) {
        summary = summary.slice(0, 1500) + '...';
      }

      const embedding = await this.embeddingService.embed(summary);
      const chunkIdx = await this.memoryService.getNextChunkIndex(payload.userId, payload.storyId, 'character');

      await this.chroma.addDocuments([
        {
          id: docId,
          content: summary,
          embedding,
          metadata: {
            user_id: payload.userId,
            story_id: payload.storyId,
            session_id: payload.sessionId,
            chunk_index: chunkIdx,
            memory_type: 'character',
            character_name: char.name,
            timestamp: Date.now(),
            turn_start: turnStart,
            turn_end: turnEnd,
          },
        },
      ]);
    }
  }
}
