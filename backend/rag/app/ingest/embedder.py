from dotenv import load_dotenv
from langchain_openai import OpenAIEmbeddings

load_dotenv()


def embed_chunks(chunks):
    return OpenAIEmbeddings(model="text-embedding-3-small").embed_documents(chunks)
