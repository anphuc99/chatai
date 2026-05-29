@echo off
echo [Memori] Dang dong bo VectorDB tu cac file Markdown...
cd /d "%~dp0"

if not exist .venv (
    echo [Memori] Khong tim thay moi truong ao, dang tao moi .venv...
    python -m venv .venv
)

call .venv\Scripts\activate.bat

echo [Memori] Dang kiem tra va cai dat thu vien...
pip install -r requirements.txt -q

echo [Memori] Dang nap du lieu vao ChromaDB...
python memori_indexer.py

echo [Memori] Hoan tat dong bo!
