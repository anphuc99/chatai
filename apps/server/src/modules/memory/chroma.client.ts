import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChromaClient as ChromaApiClient, Collection } from 'chromadb';
import { AppException } from '../../shared/errors/app-exception';
import { ChromaFilter, MemoryChunk, MemoryDocument, MemoryMetadata } from './types/memory-document';

@Injectable()
export class ChromaClient implements OnModuleInit {
  private client!: ChromaApiClient;
  private collection?: Collection;
  private readonly collectionName = 'roleplay_memory';
  private readonly logger = new Logger(ChromaClient.name);

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.configService.get<string>('chromaUrl');
    this.client = new ChromaApiClient({ path: url });

    try {
      this.collection = await this.client.getOrCreateCollection({
        name: this.collectionName,
        metadata: { 'hnsw:space': 'cosine' },
      });
      this.logger.log(`ChromaDB connected at ${url} - Collection: ${this.collectionName}`);
    } catch (e: any) {
      this.logger.warn({ err: e.message }, 'Chroma connect failed on boot. Will retry on demand.');
    }
  }

  private async ensureCollection(): Promise<void> {
    if (this.collection) return;
    try {
      this.collection = await this.client.getOrCreateCollection({
        name: this.collectionName,
        metadata: { 'hnsw:space': 'cosine' },
      });
    } catch (e: any) {
      throw new AppException('CHROMA_UNAVAILABLE', 'ChromaDB is currently down or unreachable');
    }
  }

  async addDocuments(docs: MemoryDocument[]): Promise<void> {
    if (docs.length === 0) return;
    await this.ensureCollection();

    // Validate
    for (const doc of docs) {
      if (
        !doc.id ||
        !doc.embedding ||
        doc.embedding.length === 0 ||
        !doc.content ||
        !doc.metadata
      ) {
        throw new AppException('CHROMA_WRITE_FAIL', 'Invalid document format');
      }
    }

    try {
      await this.collection!.add({
        ids: docs.map((d) => d.id),
        embeddings: docs.map((d) => d.embedding),
        documents: docs.map((d) => d.content),
        metadatas: docs.map((d) => d.metadata as any),
      });
    } catch (e: any) {
      throw new AppException('CHROMA_WRITE_FAIL', e.message);
    }
  }

  async query(emb: number[], filter: ChromaFilter, k = 5): Promise<MemoryChunk[]> {
    await this.ensureCollection();
    try {
      const res = await this.collection!.query({
        queryEmbeddings: [emb],
        where: filter as any,
        nResults: k,
      });

      if (!res.ids || res.ids.length === 0 || !res.ids[0] || res.ids[0].length === 0) {
        return [];
      }

      return res.ids[0].map((id, i) => ({
        id,
        content: res.documents && res.documents[0] ? (res.documents[0][i] as string) : '',
        metadata:
          res.metadatas && res.metadatas[0]
            ? (res.metadatas[0][i] as unknown as MemoryMetadata)
            : ({} as MemoryMetadata),
        distance:
          res.distances && res.distances[0] && res.distances[0][i] !== null
            ? (res.distances[0][i] as number)
            : undefined,
      }));
    } catch (e: any) {
      throw new AppException('CHROMA_QUERY_FAIL', e.message);
    }
  }

  async getByIndexRange(
    filter: ChromaFilter,
    startIdx: number,
    endIdx: number,
  ): Promise<MemoryChunk[]> {
    await this.ensureCollection();
    const finalWhere = {
      $and: [
        ...Object.entries(filter).map(([k, v]) => ({ [k]: v })),
        { chunk_index: { $gte: startIdx } },
        { chunk_index: { $lte: endIdx } },
      ],
    };

    try {
      const res = await this.collection!.get({ where: finalWhere as any });

      if (!res.ids || res.ids.length === 0) return [];

      return res.ids.map((id, i) => ({
        id,
        content: res.documents ? (res.documents[i] as string) : '',
        metadata: res.metadatas
          ? (res.metadatas[i] as unknown as MemoryMetadata)
          : ({} as MemoryMetadata),
      }));
    } catch (e: any) {
      throw new AppException('CHROMA_QUERY_FAIL', e.message);
    }
  }

  async getByIds(ids: string[]): Promise<MemoryChunk[]> {
    if (ids.length === 0) return [];
    await this.ensureCollection();
    try {
      const res = await this.collection!.get({ ids });
      if (!res.ids || res.ids.length === 0) return [];

      return res.ids.map((id, i) => ({
        id,
        content: res.documents ? (res.documents[i] as string) : '',
        metadata: res.metadatas
          ? (res.metadatas[i] as unknown as MemoryMetadata)
          : ({} as MemoryMetadata),
      }));
    } catch (e: any) {
      throw new AppException('CHROMA_QUERY_FAIL', e.message);
    }
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.ensureCollection();
    try {
      await this.collection!.delete({ ids });
    } catch (e: any) {
      throw new AppException('CHROMA_WRITE_FAIL', e.message);
    }
  }

  async count(filter: ChromaFilter): Promise<number> {
    await this.ensureCollection();
    try {
      const res = await this.collection!.get({ where: filter as any, include: [] });
      return res.ids ? res.ids.length : 0;
    } catch (e: any) {
      throw new AppException('CHROMA_QUERY_FAIL', e.message);
    }
  }

  async health(): Promise<boolean> {
    try {
      await this.client.heartbeat();
      return true;
    } catch (e) {
      return false;
    }
  }
}
