/**
 * Memori Indexer - Đọc file Markdown, tạo embedding và lưu vào VectorDB (JSON)
 *
 * Sử dụng Gemini Embedding API (text-embedding-004) để tạo vector.
 * Lưu trữ dưới dạng JSON file đơn giản tại db/vectors.json.
 *
 * Cách dùng: node memori-indexer.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';

// === Config ===
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DOCS_DIR = join(__dirname, 'docs');
const DB_DIR = join(__dirname, 'db');
const VECTORS_FILE = join(DB_DIR, 'vectors.json');
const EMBEDDING_MODEL = 'qwen3-embedding';
const OLLAMA_URL = 'http://127.0.0.1:11434/api/embed';
const MAX_CHARS = 1000;
const OVERLAP = 100;

// === Hàm cắt văn bản thành chunks ===
function chunkText(text, maxChars = MAX_CHARS, overlap = OVERLAP) {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);

    // Nếu không phải đoạn cuối, cố gắng cắt ở ký tự xuống dòng
    if (end < text.length) {
      const lastNewline = text.lastIndexOf('\n', end);
      if (lastNewline !== -1 && lastNewline > start + maxChars / 2) {
        end = lastNewline + 1;
      }
    }

    chunks.push(text.slice(start, end));

    // Đã đọc hết text → dừng
    if (end >= text.length) break;

    start = end - overlap;
  }

  return chunks;
}

// === Tìm tất cả file .md đệ quy ===
function findMarkdownFiles(dir) {
  const files = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findMarkdownFiles(fullPath));
    } else if (entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

// === Tạo embedding qua Ollama API (batch) ===
async function createEmbeddings(texts) {
  const BATCH_SIZE = 100;
  const allEmbeddings = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);

    try {
      const response = await fetch(OLLAMA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: batch,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API lỗi: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();

      if (result.embeddings && result.embeddings.length > 0) {
        allEmbeddings.push(...result.embeddings);
      } else {
        throw new Error('Ollama không trả về embeddings hợp lệ');
      }

      const processed = Math.min(i + BATCH_SIZE, texts.length);
      console.log(`  📊 Đã tạo embedding: ${processed}/${texts.length} chunks`);
    } catch (error) {
      console.error(`\n❌ LỖI KẾT NỐI OLLAMA: Đảm bảo Ollama đang chạy và đã pull model ${EMBEDDING_MODEL}`);
      throw error;
    }
  }

  return allEmbeddings;
}

// === Main: Index documents ===
async function indexDocuments() {
  console.log(`\n🔍 Đang quét tài liệu tại: ${DOCS_DIR}`);

  if (!existsSync(DOCS_DIR)) {
    mkdirSync(DOCS_DIR, { recursive: true });
    console.log('📁 Thư mục docs chưa tồn tại. Đã tạo mới.');
    return;
  }

  // Tìm tất cả file .md
  const mdFiles = findMarkdownFiles(DOCS_DIR);

  if (mdFiles.length === 0) {
    console.log('⚠️  Không tìm thấy file .md nào trong thư mục docs. Tiến hành xóa dữ liệu cũ (nếu có).');
    const emptyDB = {
      model: EMBEDDING_MODEL,
      updatedAt: new Date().toISOString(),
      totalChunks: 0,
      totalFiles: 0,
      entries: [],
    };
    mkdirSync(DB_DIR, { recursive: true });
    writeFileSync(VECTORS_FILE, JSON.stringify(emptyDB, null, 2), 'utf-8');
    return;
  }

  console.log(`📄 Tìm thấy ${mdFiles.length} file Markdown. Bắt đầu xử lý...\n`);

  // Đọc VectorDB cũ nếu có
  let existingDB = { entries: [] };
  if (existsSync(VECTORS_FILE)) {
    try {
      existingDB = JSON.parse(readFileSync(VECTORS_FILE, 'utf-8'));
    } catch (e) {
      console.log('⚠️ Không thể đọc DB cũ, sẽ tiến hành tạo mới.');
    }
  }

  const existingEntries = existingDB.entries || [];

  // Tạo map mtime cũ theo từng file
  const oldFileMtimes = {};
  for (const entry of existingEntries) {
    if (entry.metadata && entry.metadata.source && entry.metadata.mtime) {
      oldFileMtimes[entry.metadata.source] = entry.metadata.mtime;
    }
  }

  // Phân tích các file
  const documentsToEmbed = [];
  const metadatasToEmbed = [];
  const reusedEntries = [];
  const currentFiles = new Set();

  for (const filePath of mdFiles) {
    const filename = basename(filePath);
    currentFiles.add(filename);

    const stats = statSync(filePath);
    const mtimeMs = stats.mtimeMs;

    // So sánh mtime (thời gian chỉnh sửa)
    if (oldFileMtimes[filename] && oldFileMtimes[filename] === mtimeMs) {
      console.log(`  ⏩ Bỏ qua: ${filename} (Không có thay đổi)`);
      const fileEntries = existingEntries.filter(e => e.metadata.source === filename);
      reusedEntries.push(...fileEntries);
      continue;
    }

    console.log(`  📝 Phân tích: ${filename} (Cần tạo vector)`);
    const content = readFileSync(filePath, 'utf-8');
    const chunks = chunkText(content);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk.trim()) continue;

      documentsToEmbed.push(chunk);
      metadatasToEmbed.push({
        source: filename,
        chunkIndex: i,
        mtime: mtimeMs
      });
    }
  }

  let finalEntries = [...reusedEntries];

  if (documentsToEmbed.length > 0) {
    // Tạo embeddings cho phần dữ liệu mới/thay đổi
    console.log(`\n🧠 Đang tạo embeddings mới cho ${documentsToEmbed.length} chunks...`);
    const embeddings = await createEmbeddings(documentsToEmbed);

    const newEntries = documentsToEmbed.map((doc, i) => ({
      id: `${metadatasToEmbed[i].source}_chunk_${metadatasToEmbed[i].chunkIndex}`,
      document: doc,
      metadata: metadatasToEmbed[i],
      embedding: embeddings[i],
    }));

    finalEntries.push(...newEntries);
  } else {
    console.log(`\n✅ Không có nội dung mới nào cần tạo embeddings (đã cache 100%).`);
  }

  // Dọn dẹp các entry của file đã bị xóa
  finalEntries = finalEntries.filter(entry => currentFiles.has(entry.metadata.source));

  if (finalEntries.length === 0) {
    console.log('⚠️  Dữ liệu sau khi đồng bộ là rỗng.');
    return;
  }

  // Đảm bảo thư mục db tồn tại
  mkdirSync(DB_DIR, { recursive: true });

  // Lưu vào file JSON
  const vectorDB = {
    model: EMBEDDING_MODEL,
    updatedAt: new Date().toISOString(),
    totalChunks: finalEntries.length,
    totalFiles: currentFiles.size,
    entries: finalEntries,
  };

  writeFileSync(VECTORS_FILE, JSON.stringify(vectorDB), 'utf-8');

  console.log(`\n🎉 Đã cập nhật chỉ mục (Incremental Sync) thành công!`);
  console.log(`   📁 Tổng cộng: ${currentFiles.size} file(s) → ${finalEntries.length} chunk(s)`);
  console.log(`   💾 Lưu tại: ${VECTORS_FILE}`);
}

// === Run ===
indexDocuments().catch((err) => {
  console.error('❌ Lỗi khi index:', err.message);
  process.exit(1);
});
