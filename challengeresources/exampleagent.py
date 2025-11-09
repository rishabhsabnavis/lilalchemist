"""
Executable helper script that wires up a LangChain + NVIDIA RAG agent.

Usage:
    python main.py                              # runs the sample question
    python main.py --question "..."             # ask a custom question
    python main.py --dry-run                    # build the pipeline without hitting the LLM
"""

import argparse
import logging
import os
from pathlib import Path
from typing import List

from langchain_community.document_loaders import DirectoryLoader, TextLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.schema import BaseRetriever
from langchain.tools.retriever import create_retriever_tool
from langchain_core.documents import Document
from langchain_core.messages import HumanMessage
from langchain_nvidia_ai_endpoints import (
    ChatNVIDIA,
    NVIDIAEmbeddings,
    NVIDIARerank,
)
from langgraph.prebuilt import create_react_agent
from langchain.retrievers import ContextualCompressionRetriever

LOGGER = logging.getLogger(__name__)

DEFAULT_LLM_MODEL = "nvidia/nvidia-nemotron-nano-9b-v2"
DEFAULT_EMBEDDING_MODEL = "nvidia/llama-3.2-nv-embedqa-1b-v2"
DEFAULT_RERANK_MODEL = "nvidia/llama-3.2-nv-rerankqa-1b-v2"
DEFAULT_QUESTION = "How do I reset my system password?"
DATA_DIR = Path("data/it-knowledge-base")
BASE_URL = "https://integrate.api.nvidia.com/v1"


def load_api_key_from_env_file(path: Path = Path(".env")) -> None:
    if "NVIDIA_API_KEY" in os.environ or not path.exists():
        return

    with path.open("r", encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, value = line.split("=", 1)
            if key.strip() != "NVIDIA_API_KEY":
                continue
            cleaned = value.strip().strip('"').strip("'")
            if cleaned:
                os.environ.setdefault("NVIDIA_API_KEY", cleaned)
            break


def get_api_key() -> str:
    api_key = os.environ.get("NVIDIA_API_KEY")
    if not api_key:
        raise RuntimeError(
            "Set the NVIDIA_API_KEY environment variable with your NVIDIA API key."
        )
    return api_key


def ensure_data_dir() -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return DATA_DIR


def load_documents(data_dir: Path) -> List[Document]:
    if not any(data_dir.iterdir()):
        raise RuntimeError(
            f"No documents found in {data_dir}. Add .txt or .md files for retrieval."
        )

    loader = DirectoryLoader(
        str(data_dir),
        glob="**/*",
        loader_cls=TextLoader,
        show_progress=True,
    )
    return loader.load()


class StaticRetriever(BaseRetriever):
    """Simple retriever that returns the first N documents. Useful for offline checks."""

    documents: List[Document]
    limit: int = 3

    def _get_relevant_documents(self, query: str) -> List[Document]:
        return self.documents[: self.limit]

    async def _aget_relevant_documents(self, query: str) -> List[Document]:
        return self._get_relevant_documents(query)


def build_retriever(
    documents: List[Document],
    api_key: str | None,
    *,
    offline: bool = False,
) -> BaseRetriever:
    splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=120)
    chunks = splitter.split_documents(documents)

    if offline:
        return StaticRetriever(documents=chunks)

    if not api_key:
        raise RuntimeError("API key required when offline mode is disabled.")

    from langchain_community.vectorstores import FAISS

    embeddings = NVIDIAEmbeddings(
        model=DEFAULT_EMBEDDING_MODEL,
        api_key=api_key,
        base_url=BASE_URL,
        truncate="END",
    )

    vectordb = FAISS.from_documents(chunks, embeddings)
    kb_retriever = vectordb.as_retriever(search_type="similarity", search_kwargs={"k": 6})

    reranker = NVIDIARerank(
        model=DEFAULT_RERANK_MODEL,
        api_key=api_key,
        base_url=BASE_URL,
    )

    return ContextualCompressionRetriever(
        base_retriever=kb_retriever,
        base_compressor=reranker,
    )


def build_agent(api_key: str, retriever: ContextualCompressionRetriever):
    llm = ChatNVIDIA(
        model=DEFAULT_LLM_MODEL,
        temperature=0.6,
        top_p=0.95,
        max_tokens=2048,
        api_key=api_key,
        base_url=BASE_URL,
    )

    retriever_tool = create_retriever_tool(
        retriever=retriever,
        name="company_llc_it_knowledge_base",
        description="Search the internal IT knowledge base for IT related questions and policies.",
    )

    system_prompt = (
        "You are an IT help desk support agent.\n"
        "- Use the 'company_llc_it_knowledge_base' tool for questions likely covered by the internal IT knowledge base.\n"
        "- Always write grounded answers; if unsure, say you don't know.\n"
        "- Cite sources inline using [KB] for knowledge base snippets.\n"
        "- If the knowledge base doesn't contain sufficient information, clearly state what information is missing.\n"
        "- Keep answers brief, to the point, and conversational."
    )

    return create_react_agent(
        model=llm,
        tools=[retriever_tool],
        prompt=system_prompt,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the IT help desk NVIDIA RAG agent.")
    parser.add_argument("--question", type=str, default=DEFAULT_QUESTION, help="Question to ask the agent.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Build the pipeline but skip calling the LLM (useful for validation).",
    )
    return parser.parse_args()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    args = parse_args()
    load_api_key_from_env_file()

    data_dir = ensure_data_dir()
    LOGGER.info("Loading documents from %s", data_dir)
    documents = load_documents(data_dir)

    if args.dry_run:
        LOGGER.info("Building offline static retriever for validation.")
        build_retriever(documents, api_key=None, offline=True)
        LOGGER.info("Dry run complete. Documents loaded and offline retriever ready.")
        return

    api_key = get_api_key()
    retriever = build_retriever(documents, api_key, offline=False)
    agent = build_agent(api_key, retriever)

    LOGGER.info("Submitting question to agent: %s", args.question)
    payload = {
        "messages": [HumanMessage(content=args.question)],
        "chat_history": [],
    }
    result = agent.invoke(payload)
    print(result)


if __name__ == "__main__":
    main()

