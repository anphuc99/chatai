export type MemoryType = 'plot' | 'character';

export type MemoryMetadata = {
  user_id: string;
  story_id: string;
  session_id: string;
  chunk_index: number;
  memory_type: MemoryType;
  character_name: string | null;
  timestamp: number;
  turn_start: number;
  turn_end: number;
};

export type MemoryDocument = {
  id: string;
  content: string;
  embedding: number[];
  metadata: MemoryMetadata;
};

export type MemoryChunk = {
  id: string;
  content: string;
  metadata: MemoryMetadata;
  distance?: number;
};

export type ChromaFilter = Partial<MemoryMetadata> | Record<string, unknown>;
