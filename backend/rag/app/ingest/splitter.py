from dotenv import load_dotenv
from langchain_text_splitters import RecursiveCharacterTextSplitter

load_dotenv()

# SemanticChunker embedded every sentence just to find split points, and then Chroma
# embedded the resulting chunks again two full embedding passes per document.
# Recursive splitting costs nothing and keeps retrieval quality comparable at this chunk size.
def semantic_chunk(text):
    splitter = RecursiveCharacterTextSplitter(chunk_size=2000, chunk_overlap=200)
    return splitter.split_text(text)
