import os
import sys
import chromadb
from chromadb.utils import embedding_functions

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_DIR = os.path.join(BASE_DIR, "db")

def query_memory(query_text, n_results=3):
    if not os.path.exists(DB_DIR):
        print("LỖI: Chưa có dữ liệu bộ nhớ. Vui lòng chạy memori_indexer.py trước.")
        return

    # Khởi tạo client kết nối với DB đã lưu
    client = chromadb.PersistentClient(path=DB_DIR)
    
    # Sử dụng cùng model embedding như lúc index
    sentence_transformer_ef = embedding_functions.SentenceTransformerEmbeddingFunction(model_name="all-MiniLM-L6-v2")
    
    try:
        collection = client.get_collection(
            name="ai_memory",
            embedding_function=sentence_transformer_ef
        )
    except Exception:
        print("LỖI: Collection 'ai_memory' không tồn tại. Vui lòng chạy memori_indexer.py.")
        return

    # Truy vấn
    results = collection.query(
        query_texts=[query_text],
        n_results=n_results
    )

    if not results['documents'] or not results['documents'][0]:
        print("Không tìm thấy thông tin nào liên quan trong bộ nhớ.")
        return

    print(f"\n--- KẾT QUẢ TRUY VẤN TỪ BỘ NHỚ CHO: '{query_text}' ---\n")
    
    for i, doc in enumerate(results['documents'][0]):
        metadata = results['metadatas'][0][i]
        source = metadata.get('source', 'Unknown')
        
        print(f"[{i+1}] Nguồn: {source}")
        print("-" * 40)
        print(doc.strip())
        print("=" * 60 + "\n")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Cách sử dụng: python memori_query.py \"<câu hỏi hoặc từ khóa>\"")
        print("Ví dụ: python memori_query.py \"Cấu trúc API là gì?\"")
        sys.exit(1)
        
    query_text = " ".join(sys.argv[1:])
    query_memory(query_text)
