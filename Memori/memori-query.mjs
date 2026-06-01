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
const EMBEDDING_MODEL = 'qwen3-embedding';
const OLLAMA_URL = 'http://127.0.0.1:11434/api/embed';

// === Recency config ===
// Tỉ lệ ảnh hưởng của độ mới (0 = chỉ similarity, 1 = chỉ recency)
const RECENCY_WEIGHT = 0.15;
// Sau DECAY_HALF_LIFE_DAYS ngày, recency score giảm còn 50%
const DECAY_HALF_LIFE_DAYS = 30;

// === Recency Score: exponential decay theo tuổi tài liệu ===
// docDate (frontmatter) được ưu tiên, không bị git pull reset như mtime
function getDocTimestamp(metadata) {
  return metadata?.docDate ?? metadata?.mtime ?? 0;
}

function recencyScore(metadata) {
  const ts = getDocTimestamp(metadata);
  if (!ts) return 0;
  const ageMs = Date.now() - ts;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return Math.exp((-Math.LN2 * ageDays) / DECAY_HALF_LIFE_DAYS);
}

// === Combined Score ===
function combinedScore(similarity, metadata) {
  const recency = recencyScore(metadata);
  return (1 - RECENCY_WEIGHT) * similarity + RECENCY_WEIGHT * recency;
}

// === Format ngày + freshness label ===
function freshnessLabel(metadata) {
  const ts = getDocTimestamp(metadata);
  const ageDays = ts ? (Date.now() - ts) / (1000 * 60 * 60 * 24) : Infinity;
  const dateStr = ts ? new Date(ts).toLocaleDateString('vi-VN') : 'N/A';
  const dateSource = metadata?.docDate ? '' : ' ⚠️(mtime - dễ sai sau git pull)';
  let label;
  if (ageDays < 1)       label = '🟢 Hôm nay';
  else if (ageDays < 7)  label = '🟢 Tuần này';
  else if (ageDays < 30) label = '🟡 Tháng này';
  else if (ageDays < 90) label = '🟠 Cũ (>1 tháng)';
  else                   label = '🔴 Rất cũ (>3 tháng)';
  return `${label} | Cập nhật: ${dateStr}${dateSource}`;
}

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

  // Tính combined score (similarity + recency boost) cho tất cả entries
  const scored = entries.map((entry) => {
    const similarity = cosineSimilarity(queryEmbedding, entry.embedding);
    return {
      ...entry,
      similarity,
      recency: recencyScore(entry.metadata),
      score: combinedScore(similarity, entry.metadata),
    };
  });

  // Sắp xếp theo combined score giảm dần và lấy top N
  scored.sort((a, b) => b.score - a.score);
  const topResults = scored.slice(0, nResults);

  // Output kết quả
  console.log(`\n--- KẾT QUẢ TRUY VẤN TỪ BỘ NHỚ CHO: '${queryText}' ---\n`);
  console.log(`ℹ️  Scoring: similarity×${(1 - RECENCY_WEIGHT).toFixed(2)} + recency×${RECENCY_WEIGHT.toFixed(2)} (half-life ${DECAY_HALF_LIFE_DAYS} ngày)\n`);

  for (let i = 0; i < topResults.length; i++) {
    const r = topResults[i];
    console.log(`[${i + 1}] Nguồn: ${r.metadata.source}`);
    console.log(`    Score tổng: ${r.score.toFixed(4)} | Similarity: ${r.similarity.toFixed(4)} | Recency: ${r.recency.toFixed(4)}`);
    console.log(`    ${freshnessLabel(r.metadata)}`);
    console.log('-'.repeat(60));
    console.log(r.document.trim());
    console.log('='.repeat(60) + '\n');
  }

  // Trả về JSON cho việc parse tự động bởi AI agent
  return topResults.map((r) => ({
    source: r.metadata.source,
    score: r.score,
    similarity: r.similarity,
    recency: r.recency,
    docDate: r.metadata?.docDate ?? null,
    freshness: freshnessLabel(r.metadata),
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
