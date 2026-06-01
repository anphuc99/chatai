/**
 * Memori Indexer - Đọc file Markdown, tạo embedding và lưu vào VectorDB (JSON)
 *
 * Sử dụng Gemini Embedding API (text-embedding-004) để tạo vector.
 * Lưu trữ dưới dạng JSON file đơn giản tại db/vectors.json.
 *
 * Cách dùng: node memori-indexer.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, createWriteStream } from 'fs';
import { createHash } from 'crypto';
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

// === Hash nội dung file (dùng thay mtime, không bị git pull reset) ===
function hashContent(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

// === Đọc ngày cập nhật từ YAML frontmatter (--- date: YYYY-MM-DD ---) ===
// Trả về timestamp ms hoặc null nếu không có
function parseFrontmatterDate(text) {
  const match = text.match(/^---[\r\n]+(?:[\s\S]*?[\r\n])?date:\s*(\d{4}-\d{2}-\d{2})[\s\S]*?[\r\n]---/);
  if (!match) return null;
  const ts = new Date(match[1]).getTime();
  return isNaN(ts) ? null : ts;
}

// === Xóa YAML frontmatter khỏi nội dung trước khi chunk ===
function stripFrontmatter(text) {
  return text.replace(/^---[\r\n][\s\S]*?[\r\n]---[\r\n]?/, '');
}

// === Tách văn bản thành sections dựa theo Markdown headings ===
function splitByMarkdownSections(text) {
  const lines = text.split('\n');
  const sections = [];
  let currentHeading = '';
  let currentLines = [];

  for (const line of lines) {
    if (/^#{1,6}\s/.test(line)) {
      // Lưu section trước khi bắt đầu section mới
      if (currentLines.length > 0 || currentHeading) {
        sections.push({ heading: currentHeading, content: currentLines.join('\n') });
      }
      currentHeading = line;
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  // Section cuối cùng
  if (currentLines.length > 0 || currentHeading) {
    sections.push({ heading: currentHeading, content: currentLines.join('\n') });
  }

  return sections;
}

// === Hàm cắt văn bản thành chunks (Markdown-aware + sliding window) ===
function chunkText(text, maxChars = MAX_CHARS, overlap = OVERLAP) {
  const chunks = [];
  const sections = splitByMarkdownSections(text);

  for (const { heading, content } of sections) {
    const prefix = heading ? heading + '\n' : '';

    // Bỏ qua section chỉ có heading mà không có nội dung thực sự
    if (!content.trim()) continue;

    const fullSection = (prefix + content).trim();
    if (!fullSection) continue;

    // Section vừa đủ → 1 chunk duy nhất, giữ nguyên ranh giới section
    if (fullSection.length <= maxChars) {
      chunks.push(fullSection);
      continue;
    }

    // Section quá lớn → sliding window trên phần body, prepend heading vào mỗi sub-chunk
    const bodyMaxChars = maxChars - prefix.length;
    let start = 0;

    while (start < content.length) {
      let end = Math.min(start + bodyMaxChars, content.length);

      // Snap về ký tự xuống dòng gần nhất (nửa sau của window)
      if (end < content.length) {
        const lastNewline = content.lastIndexOf('\n', end);
        if (lastNewline !== -1 && lastNewline > start + bodyMaxChars / 2) {
          end = lastNewline + 1;
        }
      }

      const chunkBody = content.slice(start, end).trim();
      if (chunkBody) {
        chunks.push(heading ? `${heading}\n${chunkBody}` : chunkBody);
      }

      if (end >= content.length) break;
      start = end - overlap;
    }
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

  // Tạo map contentHash cũ theo từng file (git-proof, không bị reset sau pull)
  const oldFileHashes = {};
  for (const entry of existingEntries) {
    if (entry.metadata?.source && entry.metadata?.contentHash) {
      oldFileHashes[entry.metadata.source] = entry.metadata.contentHash;
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

    const content = readFileSync(filePath, 'utf-8');
    // So sánh content hash — git-proof, không bị reset sau git pull
    const contentHash = hashContent(content);
    if (oldFileHashes[filename] && oldFileHashes[filename] === contentHash) {
      console.log(`  ⏩ Bỏ qua: ${filename} (Nội dung không thay đổi)`);
      const fileEntries = existingEntries.filter(e => e.metadata.source === filename);
      reusedEntries.push(...fileEntries);
      continue;
    }

    // Lấy ngày từ frontmatter; nếu thiếu → tự động ghi vào file với ngày hôm nay
    let docDate = parseFrontmatterDate(content);
    let finalContent = content;
    const hasFrontmatter = content.startsWith('---');

    if (docDate === null && !hasFrontmatter) {
      // Chỉ thêm frontmatter khi file HOÀN TOÀN chưa có --- block nào
      const todayStr = new Date().toISOString().slice(0, 10);
      docDate = new Date(todayStr).getTime();
      finalContent = `---\ndate: ${todayStr}\n---\n` + content;
      writeFileSync(filePath, finalContent, 'utf-8');
      console.log(`  📝 Phân tích: ${filename} (Ngày tài liệu: ${todayStr} [tự động thêm frontmatter])`);
    } else {
      // Có frontmatter (dù có date hay không) → không đụng vào file
      docDate = docDate ?? Date.now();
      const docDateStr = new Date(docDate).toISOString().slice(0, 10);
      console.log(`  📝 Phân tích: ${filename} (Ngày tài liệu: ${docDateStr})`);
    }

    // Hash của nội dung cuối cùng (sau khi thêm frontmatter nếu có) để cache lần sau
    const finalContentHash = hashContent(finalContent);

    // Strip frontmatter trước khi chunk để không embed YAML vào vector
    const bodyContent = stripFrontmatter(finalContent);
    const chunks = chunkText(bodyContent);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk.trim()) continue;

      documentsToEmbed.push(chunk);
      metadatasToEmbed.push({
        source: filename,
        chunkIndex: i,
        contentHash: finalContentHash,
        docDate,
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

  console.log(`\n💾 Đang ghi dữ liệu vào chỉ mục (Stream Write)...`);

  // Lưu vào file JSON bằng write stream để tránh lỗi "Invalid string length" với file dung lượng lớn
  const writeStream = createWriteStream(VECTORS_FILE, { encoding: 'utf-8' });

  writeStream.write('{\n');
  writeStream.write(`  "model": ${JSON.stringify(EMBEDDING_MODEL)},\n`);
  writeStream.write(`  "updatedAt": ${JSON.stringify(new Date().toISOString())},\n`);
  writeStream.write(`  "totalChunks": ${finalEntries.length},\n`);
  writeStream.write(`  "totalFiles": ${currentFiles.size},\n`);
  writeStream.write('  "entries": [\n');

  for (let i = 0; i < finalEntries.length; i++) {
    const entry = finalEntries[i];
    writeStream.write('    ' + JSON.stringify(entry));
    if (i < finalEntries.length - 1) {
      writeStream.write(',\n');
    } else {
      writeStream.write('\n');
    }
  }

  writeStream.write('  ]\n');
  writeStream.write('}\n');

  await new Promise((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
    writeStream.end();
  });

  console.log(`\n🎉 Đã cập nhật chỉ mục (Incremental Sync) thành công!`);
  console.log(`   📁 Tổng cộng: ${currentFiles.size} file(s) → ${finalEntries.length} chunk(s)`);
  console.log(`   💾 Lưu tại: ${VECTORS_FILE}`);
}

// === Run ===
indexDocuments().catch((err) => {
  console.error('❌ Lỗi khi index:', err.message);
  process.exit(1);
});
