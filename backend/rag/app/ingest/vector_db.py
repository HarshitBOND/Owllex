import os
import time

import chromadb
from dotenv import load_dotenv
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings

load_dotenv()

COLLECTION = "lexvert"
USER_COLLECTION = "lexvert_user"
EMBED_MODEL = "text-embedding-3-small"


def _cloud_client():
    return chromadb.CloudClient(
        api_key=os.getenv("CHROMA_API_KEY"),
        tenant=os.getenv("CHROMA_TENANT"),
        database=os.getenv("CHROMA_DATABASE"),
    )


def get_vector_db(collection=COLLECTION):
    return Chroma(
        client=_cloud_client(),
        collection_name=collection,
        embedding_function=OpenAIEmbeddings(model=EMBED_MODEL),
    )


def store_chunks(document_id, chunks, metadata, collection=COLLECTION):
    """Embed and store a document's chunks.

    Every chunk carries a full copy of the document's metadata -- Chroma has no
    document-level store, and the query API reads title/date/source_url straight
    off the chunk it retrieved. Keep this dict small: each key added here is
    multiplied by the chunk count of every document ever ingested.
    """
    vector_db = get_vector_db(collection)
    ids = [f"{document_id}_{i}" for i in range(len(chunks))]
    metadatas = [{**metadata, "document_id": document_id} for _ in chunks]
    vector_db.add_texts(chunks, metadatas=metadatas, ids=ids)


def delete_by(where, collection=USER_COLLECTION):
    """Delete every chunk matching a metadata filter. No-op if the collection does not exist yet."""
    client = _cloud_client()
    try:
        client.get_collection(collection).delete(where=where)
    except Exception:
        pass


_STATS_CACHE: dict = {"at": 0.0, "value": None}
_STATS_TTL_SECONDS = 300


def collection_stats():
    """Chunk count + distinct document count.

    Talks to Chroma Cloud directly rather than through get_vector_db(), so this
    works as a health check even when no OpenAI key is configured.

    Counting distinct documents means paging the entire collection's metadata,
    1000 rows at a time -- which this used to do on every /rag/status hit, so a
    monitor polling the health check walked the whole corpus each time. The
    numbers move only when something is ingested, so they are cached.
    """
    if not os.getenv("CHROMA_API_KEY"):
        return {"chunk_count": 0, "document_count": 0}

    now = time.monotonic()
    if _STATS_CACHE["value"] is not None and now - _STATS_CACHE["at"] < _STATS_TTL_SECONDS:
        return _STATS_CACHE["value"]

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

    stats = {"chunk_count": chunk_count, "document_count": len(document_ids)}
    _STATS_CACHE["at"] = now
    _STATS_CACHE["value"] = stats
    return stats
