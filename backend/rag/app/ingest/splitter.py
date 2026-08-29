from dotenv import load_dotenv
from langchain_experimental.text_splitter import SemanticChunker
from langchain_openai import OpenAIEmbeddings

load_dotenv()


def semantic_chunk(text):
    splitter = SemanticChunker(OpenAIEmbeddings(model="text-embedding-3-small"))
    return splitter.split_text(text)
