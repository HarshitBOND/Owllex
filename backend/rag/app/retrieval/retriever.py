from dotenv import load_dotenv
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings

load_dotenv()


def retrieve(query, k=5, filter=None):
    vector_db = Chroma(
        collection_name="lexvert",
        embedding_function=OpenAIEmbeddings(model="text-embedding-3-small"),
        persist_directory="rag/data/chroma",
    )
    retriever = vector_db.as_retriever(
        search_type="mmr",
        search_kwargs={"k": k, "fetch_k": k * 4, "filter": filter},
    )
    return retriever.invoke(query)
