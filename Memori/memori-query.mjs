/**
 * Memori Query - Truy vấn semantic search từ VectorDB
 *
 * Sử dụng Gemini Embedding API để tạo vector cho câu hỏi,
 * sau đó tính cosine similarity với tất cả chunks đã index.
 *
 * Cách dùng: node memori-query.mjs "<câu hỏi hoặc từ khóa>"
 * Ví dụ:    node memori-query.mjs "Cấu trúc API là gì?"
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// === Config ===
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_DIR = join(__dirname, 'db');
const VECTORS_FILE = join(DB_DIR, 'vectors.json');
const EMBEDDING_MODEL = 'nomic-embed-text';
const OLLAMA_URL = 'http://127.0.0.1:11434/api/embed';

// === Cosine Similarity ===
function cosineSimilarity(a, b) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (normA * normB);
}

// === Query memory ===
async function queryMemory(queryText, nResults = 3) {
  if (!existsSync(VECTORS_FILE)) {
    console.error('❌ LỖI: Chưa có dữ liệu bộ nhớ. Vui lòng chạy memori-indexer.mjs trước.');
    console.error('   Lệnh: node Memori/memori-indexer.mjs');
    process.exit(1);
  }

  // Đọc VectorDB
  const vectorDB = JSON.parse(readFileSync(VECTORS_FILE, 'utf-8'));
  const entries = vectorDB.entries;

  if (!entries || entries.length === 0) {
    console.log('⚠️  Bộ nhớ trống, không có dữ liệu để truy vấn.');
    return;
  }

  // Tạo embedding cho câu query qua Ollama API
  let queryEmbedding;
  try {
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: queryText,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API lỗi: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    if (!result.embeddings || result.embeddings.length === 0) {
      throw new Error('Ollama không trả về embeddings hợp lệ cho query');
    }
    
    queryEmbedding = result.embeddings[0];
  } catch (error) {
    console.error(`\n❌ LỖI KẾT NỐI OLLAMA: Đảm bảo Ollama đang chạy và đã pull model ${EMBEDDING_MODEL}`);
    throw error;
  }

  // Tính similarity cho tất cả entries
  const scored = entries.map((entry) => ({
    ...entry,
    score: cosineSimilarity(queryEmbedding, entry.embedding),
  }));

  // Sắp xếp theo score giảm dần và lấy top N
  scored.sort((a, b) => b.score - a.score);
  const topResults = scored.slice(0, nResults);

  // Output kết quả
  console.log(`\n--- KẾT QUẢ TRUY VẤN TỪ BỘ NHỚ CHO: '${queryText}' ---\n`);

  for (let i = 0; i < topResults.length; i++) {
    const r = topResults[i];
    console.log(`[${i + 1}] Nguồn: ${r.metadata.source} (score: ${r.score.toFixed(4)})`);
    console.log('-'.repeat(40));
    console.log(r.document.trim());
    console.log('='.repeat(60) + '\n');
  }

  // Trả về JSON cho việc parse tự động bởi AI agent
  return topResults.map((r) => ({
    source: r.metadata.source,
    score: r.score,
    content: r.document.trim(),
  }));
}

// === CLI ===
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Cách sử dụng: node memori-query.mjs "<câu hỏi hoặc từ khóa>"');
  console.log('Ví dụ: node memori-query.mjs "Cấu trúc API là gì?"');
  process.exit(1);
}

const queryText = args.join(' ');
queryMemory(queryText).catch((err) => {
  console.error('❌ Lỗi khi truy vấn:', err.message);
  process.exit(1);
});
