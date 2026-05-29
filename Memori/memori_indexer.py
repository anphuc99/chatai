import os
import glob
import chromadb
from chromadb.utils import embedding_functions

# Thư mục gốc của Memori
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOCS_DIR = os.path.join(BASE_DIR, "docs")
DB_DIR = os.path.join(BASE_DIR, "db")

def chunk_text(text, max_chars=1000, overlap=100):
    """Hàm đơn giản để cắt văn bản thành các đoạn nhỏ (chunk)"""
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + max_chars, len(text))
        # Nếu không phải là đoạn cuối, cố gắng cắt ở ký tự xuống dòng
        if end < len(text):
            last_newline = text.rfind('\n', start, end)
            if last_newline != -1 and last_newline > start + max_chars // 2:
                end = last_newline + 1
        
        chunks.append(text[start:end])
        start = end - overlap
    return chunks

def index_documents():
    print(f"Đang quét tài liệu tại: {DOCS_DIR}")
    if not os.path.exists(DOCS_DIR):
        os.makedirs(DOCS_DIR)
        print("Thư mục docs chưa tồn tại. Đã tạo mới.")
        return

    # Lấy tất cả file markdown
    md_files = glob.glob(os.path.join(DOCS_DIR, "**", "*.md"), recursive=True)
    if not md_files:
        print("Không tìm thấy file .md nào trong thư mục docs.")
        return

    print(f"Tìm thấy {len(md_files)} file Markdown. Bắt đầu xử lý...")

    # Khởi tạo ChromaDB client (lưu local)
    client = chromadb.PersistentClient(path=DB_DIR)
    
    # Sử dụng embedding mặc định (all-MiniLM-L6-v2)
    # Nó sẽ tự động tải về trong lần chạy đầu tiên
    sentence_transformer_ef = embedding_functions.SentenceTransformerEmbeddingFunction(model_name="all-MiniLM-L6-v2")
    
    try:
        # Tạo hoặc lấy collection
        client.delete_collection("ai_memory")
    except Exception:
        pass
        
    collection = client.get_or_create_collection(
        name="ai_memory", 
        embedding_function=sentence_transformer_ef
    )

    documents = []
    metadatas = []
    ids = []

    doc_id_counter = 1

    for file_path in md_files:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        filename = os.path.basename(file_path)
        
        # Chia nhỏ file nếu quá dài
        chunks = chunk_text(content)
        
        for i, chunk in enumerate(chunks):
            if not chunk.strip():
                continue
                
            documents.append(chunk)
            metadatas.append({"source": filename, "chunk_index": i})
            ids.append(f"{filename}_chunk_{i}_{doc_id_counter}")
            doc_id_counter += 1

    # Lưu vào ChromaDB theo batch
    batch_size = 100
    for i in range(0, len(documents), batch_size):
        end = min(i + batch_size, len(documents))
        collection.add(
            documents=documents[i:end],
            metadatas=metadatas[i:end],
            ids=ids[i:end]
        )
        print(f"Đã lưu batch {i//batch_size + 1} ({len(documents[i:end])} chunks)")

    print(f"✅ Đã lập chỉ mục (index) xong {len(md_files)} file. Sẵn sàng để truy vấn!")

if __name__ == "__main__":
    index_documents()
