from pathlib import Path

from pypdf import PdfReader

paths = [
    Path(r"D:\陈胜伟\陈胜伟简历\陈胜伟_简历_技.pdf"),
    Path(r"D:\陈胜伟\陈胜伟简历\陈胜伟_简历_文.pdf"),
]

for path in paths:
    print("=" * 60)
    print("FILE:", path.name)
    print("=" * 60)
    reader = PdfReader(str(path))
    print("pages:", len(reader.pages))
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        print(f"--- page {i+1} ---")
        print(text)
        print()
