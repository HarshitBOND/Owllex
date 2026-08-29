from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from pydantic import BaseModel

load_dotenv()


class DocumentMetadata(BaseModel):
    title: str
    document_type: str
    date: str
    subject_tags: list[str]


def extract_metadata(front_matter_text):
    llm = ChatOpenAI(model="gpt-4o-mini").with_structured_output(DocumentMetadata)
    return llm.invoke(front_matter_text)
