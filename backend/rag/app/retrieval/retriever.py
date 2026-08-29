from ..ingest.vector_db import get_vector_db


def retrieve(query, k=5, filter=None):
    retriever = get_vector_db().as_retriever(
        search_type="mmr",
        search_kwargs={"k": k, "fetch_k": k * 4, "filter": filter},
    )
    return retriever.invoke(query)
