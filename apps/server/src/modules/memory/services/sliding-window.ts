import { Injectable, Logger } from '@nestjs/common';
import { ChromaClient } from '../chroma.client';
import { ChromaFilter, MemoryChunk } from '../types/memory-document';

@Injectable()
export class SlidingWindow {
  private readonly logger = new Logger(SlidingWindow.name);

  constructor(private readonly chroma: ChromaClient) {}

  async expand(
    seeds: MemoryChunk[],
    baseFilter: ChromaFilter,
    window = 5,
  ): Promise<MemoryChunk[]> {
    if (seeds.length === 0) {
      return [];
    }

    // Group seeds by memory_type + character_name (for char filter cohesion)
    const groups = new Map<string, MemoryChunk[]>();
    for (const s of seeds) {
      const charName = s.metadata.character_name ?? '';
      const key = `${s.metadata.memory_type}|${charName}`;
      const existing = groups.get(key) ?? [];
      groups.set(key, [...existing, s]);
    }

    const expanded = new Map<string, MemoryChunk>();

    // For each group, query neighbors in range [minIdx, maxIdx] parallelly
    const expandPromises = Array.from(groups.entries()).map(async ([_, chunks]) => {
      const firstChunk = chunks[0];
      if (!firstChunk) {
        return [];
      }

      const indices = chunks.map((c) => c.metadata.chunk_index);
      const minIdx = Math.max(0, Math.min(...indices) - window);
      const maxIdx = Math.max(...indices) + window;

      const typeFilter: ChromaFilter = {
        ...baseFilter,
        memory_type: firstChunk.metadata.memory_type,
      };

      if (firstChunk.metadata.character_name) {
        typeFilter.character_name = firstChunk.metadata.character_name;
      }

      try {
        const neighbors = await this.chroma.getByIndexRange(typeFilter, minIdx, maxIdx);
        return neighbors;
      } catch (e: any) {
        this.logger.error(
          `Failed to get index range [${minIdx}, ${maxIdx}] for filter ${JSON.stringify(typeFilter)}: ${e.message}`,
        );
        // Fallback: return the original seeds of this group
        return chunks;
      }
    });

    const results = await Promise.all(expandPromises);
    for (const neighbors of results) {
      for (const n of neighbors) {
        expanded.set(n.id, n);
      }
    }

    return Array.from(expanded.values());
  }
}
