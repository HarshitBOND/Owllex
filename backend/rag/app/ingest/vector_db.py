from dotenv import load_dotenv
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings

load_dotenv()


def store_chunks(document_id, chunks, metadata):
    vector_db = Chroma(
        collection_name="lexvert",
        embedding_function=OpenAIEmbeddings(model="text-embedding-3-small"),
        persist_directory="rag/data/chroma",
    )
    ids = [f"{document_id}_{i}" for i in range(len(chunks))]
    metadatas = [{**metadata, "document_id": document_id} for _ in chunks]
    vector_db.add_texts(chunks, metadatas=metadatas, ids=ids)
