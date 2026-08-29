import os

import chromadb
from dotenv import load_dotenv
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings

load_dotenv()

COLLECTION = "lexvert"
EMBED_MODEL = "text-embedding-3-small"


def _cloud_client():
    return chromadb.CloudClient(
        api_key=os.getenv("CHROMA_API_KEY"),
        tenant=os.getenv("CHROMA_TENANT"),
        database=os.getenv("CHROMA_DATABASE"),
    )


def get_vector_db():
    return Chroma(
        client=_cloud_client(),
        collection_name=COLLECTION,
        embedding_function=OpenAIEmbeddings(model=EMBED_MODEL),
    )


def store_chunks(document_id, chunks, metadata):
    vector_db = get_vector_db()
    ids = [f"{document_id}_{i}" for i in range(len(chunks))]
    metadatas = [{**metadata, "document_id": document_id} for _ in chunks]
    vector_db.add_texts(chunks, metadatas=metadatas, ids=ids)


def collection_stats():
    """Chunk count + distinct document count.

    Talks to Chroma Cloud directly rather than through get_vector_db(), so this
    works as a health check even when no OpenAI key is configured.
    """
    if not os.getenv("CHROMA_API_KEY"):
        return {"chunk_count": 0, "document_count": 0}

    client = _cloud_client()
    try:
        collection = client.get_collection(COLLECTION)
    except Exception:
        return {"chunk_count": 0, "document_count": 0}

    chunk_count = collection.count()
    document_ids = set()
    offset = 0
    while offset < chunk_count:
        batch = collection.get(include=["metadatas"], limit=1000, offset=offset)
        for m in batch["metadatas"] or []:
            if m and m.get("document_id"):
                document_ids.add(m["document_id"])
        offset += 1000

    return {"chunk_count": chunk_count, "document_count": len(document_ids)}
