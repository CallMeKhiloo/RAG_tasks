import os
import json
from pathlib import Path

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Load .env from the project root (one level above this file's directory)
_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=_ENV_PATH)

from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from langchain_core.tools import tool
from langchain_core.messages import HumanMessage

from langchain.agents import create_agent
from langgraph.checkpoint.memory import MemorySaver

# Config

PDF_PATH = "/home/mo-khalil/iti/notes/RAG/day3/nasa_artemis_plan-20200921.pdf"
# Store Chroma DB next to this file so path is stable regardless of cwd
_BASE_DIR = Path(__file__).resolve().parent
CHROMA_DIR = str(_BASE_DIR / "chroma_db_artemis")
COLLECTION_NAME = "artemis_collection"

embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
vector_store: Chroma = None


def build_vector_store() -> Chroma:
    """Load the PDF, split into chunks, embed and persist to Chroma."""
    print("[RAG] Building vector store from PDF …")
    loader = PyPDFLoader(PDF_PATH)
    docs = loader.load()

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=600,
        chunk_overlap=100,
        separators=["\n\n", "\n", " ", ""],
    )
    chunks = splitter.split_documents(docs)
    print(f"[RAG] Created {len(chunks)} chunks from {len(docs)} pages.")

    db = Chroma.from_documents(
        chunks,
        embeddings,
        collection_name=COLLECTION_NAME,
        persist_directory=CHROMA_DIR,
    )
    print("[RAG] Vector store built and persisted.")
    return db


def load_vector_store() -> Chroma:
    """Re-open an already-persisted Chroma collection."""
    return Chroma(
        collection_name=COLLECTION_NAME,
        embedding_function=embeddings,
        persist_directory=CHROMA_DIR,
    )


# RAG Tool

@tool
def search_nasa_document(query: str) -> str:
    """
    Search the NASA Artemis Plan document for information relevant to the query.

    Returns the most relevant passages from the document along with their
    relevance scores (0-1, higher is more similar).  If no passages are
    sufficiently relevant (score < 0.35) an explicit notice is returned so the
    agent knows the document does not contain this information.

    Use this tool whenever you need to retrieve facts from the Artemis Plan.
    You may call it multiple times with different queries to collect partial
    information and piece together a complete answer.
    """
    global vector_store
    results = vector_store.similarity_search_with_relevance_scores(query, k=5)

    # Filter by a minimum relevance threshold
    relevant = [(doc, score) for doc, score in results if score >= 0.35]

    if not relevant:
        return (
            "NO_RELEVANT_CONTENT: The document does not appear to contain "
            "information relevant to this query."
        )

    passages = []
    for i, (doc, score) in enumerate(relevant, 1):
        page = doc.metadata.get("page", "?")
        passages.append(
            f"[Passage {i} | Page {page} | Relevance {score:.2f}]\n"
            f"{doc.page_content.strip()}"
        )

    return "\n\n---\n\n".join(passages)


tools = [search_nasa_document]


# LLM & Agent

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.2)

SYSTEM_PROMPT = """You are the **NASA Artemis Plan Assistant** — an AI assistant \
whose knowledge is strictly limited to the contents of the official \
*NASA Artemis Plan* document.

## Your Responsibilities
1. **Greet users** and make clear that you can only answer questions about \
the NASA Artemis Plan document.
2. **Always use the `search_nasa_document` tool** to look up information \
before answering.  Never answer from general knowledge alone.
3. **Evaluate search results carefully:**
   - If the tool returns `NO_RELEVANT_CONTENT`, tell the user you could not \
find information about that topic *in this document* and apologise.
   - If the results are partially relevant, call the tool again with a \
refined or different query to gather more information, then synthesise \
a complete answer from all retrieved passages.
   - If the results are clearly relevant, answer the question using only \
those passages.
4. **Never fabricate information.** If after multiple searches the document \
genuinely does not cover the topic, honestly say so.
5. **Cite page numbers** from the retrieved passages when available.
6. For off-topic questions (e.g. unrelated science, personal questions), \
politely clarify that you are specialised in the Artemis Plan only.

## Tone
Professional, clear, and concise.  You represent NASA documentation.
"""

memory = MemorySaver()

agent = create_agent(
    model=llm,
    tools=tools,
    prompt=SYSTEM_PROMPT,
    checkpointer=memory,
)

# Lifespan — initialise vector store on startup

@asynccontextmanager
async def lifespan(app: FastAPI):
    global vector_store
    if os.path.exists(CHROMA_DIR) and os.listdir(CHROMA_DIR):
        print("[RAG] Loading existing vector store …")
        vector_store = load_vector_store()
    else:
        vector_store = build_vector_store()
    print("[RAG] Ready.")
    yield
    print("[RAG] Shutting down.")

# FastAPI App

app = FastAPI(
    title="NASA Artemis RAG Agent API",
    description="A RAG-powered agent that answers questions about the NASA Artemis Plan.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Schemas

class ChatRequest(BaseModel):
    session_id: str
    message: str

class ChatResponse(BaseModel):
    answer: str
    session_id: str


# Endpoints

@app.get("/health")
async def health():
    return {"status": "ok", "document": "NASA Artemis Plan"}


@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(req: ChatRequest):
    """
    Send a message to the NASA Artemis RAG agent and receive an answer.

    - `session_id`: unique conversation identifier (used for memory / history).
    - `message`: the user's question or message.
    """
    config = {"configurable": {"thread_id": req.session_id}}

    try:
        result = agent.invoke(
            {"messages": [HumanMessage(content=req.message)]},
            config=config,
        )

        # The last message from the agent contains the final answer
        last_msg = result["messages"][-1]
        answer = last_msg.content if hasattr(last_msg, "content") else str(last_msg)

        return ChatResponse(answer=answer, session_id=req.session_id)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/reset/{session_id}")
async def reset_session(session_id: str):
    """Clear the conversation history for a given session (informational only — memory is in-process)."""
    return {"message": f"Session '{session_id}' will start fresh on the next request.", "session_id": session_id}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
