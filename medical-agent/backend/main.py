from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List
import csv
import os
import json
from dotenv import load_dotenv
load_dotenv()

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool

from langchain.agents import create_agent
from langchain.agents.middleware import SummarizationMiddleware
from langgraph.checkpoint.memory import MemorySaver

from tavily import TavilyClient

# Ensure API keys are set in your environment
tavily_client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))

# --- 1. Structured Output Schema ---

class AgentResponse(BaseModel):
    summary: str = Field(description="A structured case summary.")
    insights: str = Field(description="Safe medical insights based on inputs.")
    hospitals: str = Field(description="Information about nearby hospitals if requested, or empty string.")
    disclaimer: str = Field(description="Must always be exactly: 'This is not a medical diagnosis. Consult a doctor.'")

# --- 2. Tool Definitions ---

@tool
def save_case_to_csv(symptoms: str, summary: str, hospitals: str) -> str:
    """Stores structured case data into a local CSV file."""
    file_exists = os.path.isfile("cases.csv")
    with open("cases.csv", "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(["Symptoms", "Summary", "Hospitals"])
        writer.writerow([symptoms, summary, hospitals])
    return "Case data saved to CSV successfully."

@tool
def search_hospitals(location: str) -> str:
    """Searches for nearby hospitals given a location or query."""
    response = tavily_client.search(
        query=f"find hospitals near {location}",
        max_results=3
    )
    return json.dumps(response["results"])

tools = [save_case_to_csv, search_hospitals]

# --- 3. Agent Setup ---

llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.3)

system_prompt = """You are a Medical AI Assistant Agent that analyzes patient cases using MRI descriptions and text symptoms.
You provide structured insights and can search for nearby hospitals using tools.
You must decide dynamically when to use your available tools.

Capabilities & Guidelines:
1. Analyze the text inputs and any attached image descriptions/scans.
2. Generate a structured case summary.
3. Provide safe medical insights.
4. Handle hospital search requests by invoking the `search_hospitals` tool.
5. Store structured case data by invoking the `save_case_to_csv` tool when appropriate.

Constraints (CRITICAL):
- Do not provide actual diagnosis or prescriptions.
- Always populate the disclaimer field exactly as: 'This is not a medical diagnosis. Consult a doctor.'
"""

memory = MemorySaver()

# LangChain's create_agent entrypoint with SummarizationMiddleware
agent = create_agent(
    model=llm,
    tools=tools,
    system_prompt=system_prompt,
    checkpointer=memory,
    response_format=AgentResponse,  # Enforces the structured JSON output using Pydantic
    middleware=[
        SummarizationMiddleware(
            model=llm,
            trigger=("messages", 4),  # Trigger summarization when there are more than 3 messages
            keep=("messages", 3)      # Keep the most recent 3 messages
        )
    ]
)

# --- 4. FastAPI & State Management ---

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    session_id: str
    message: str
    image_url: Optional[str] = None  # Base64 data URL or standard URL

@app.post("/chat", response_model=AgentResponse)
async def chat_endpoint(req: ChatRequest):
    # Handle Multi-modal input
    if req.image_url:
        input_content = [
            {"type": "text", "text": req.message},
            {"type": "image_url", "image_url": {"url": req.image_url}}
        ]
    else:
        input_content = req.message
        
    input_message = HumanMessage(content=input_content)
    
    # Config sets the thread_id for conversation memory
    config = {"configurable": {"thread_id": req.session_id}}
    
    try:
        # Run agent using .invoke and pass messages
        response_state = agent.invoke({"messages": [input_message]}, config=config)
        
        # Extract the final output
        last_msg = response_state["messages"][-1]
        
        # LangChain populates the parsed Pydantic object based on the response_format
        if hasattr(last_msg, "parsed") and last_msg.parsed:
            return last_msg.parsed
        if hasattr(last_msg, "tool_calls") and last_msg.tool_calls:
            # Fallback if using tool calling for structured output
            return AgentResponse(**last_msg.tool_calls[0]["args"])
        if isinstance(last_msg.content, str):
            # Fallback if LLM output string directly
            try:
                return AgentResponse.model_validate_json(last_msg.content)
            except Exception:
                return AgentResponse(
                    summary=last_msg.content, 
                    insights="", 
                    hospitals="", 
                    disclaimer="This is not a medical diagnosis. Consult a doctor."
                )
                
        return last_msg.content
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)