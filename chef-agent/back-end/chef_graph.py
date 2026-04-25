import os
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from langchain_openai import ChatOpenAI
from langgraph.graph.message import add_messages
from typing import TypedDict, Annotated
from schema import RecipeStep
from dotenv import load_dotenv

load_dotenv()

# 1. Define State
class ChefState(TypedDict):
    messages: Annotated[list, add_messages]

# 2. Define the Chef Node
llm = ChatOpenAI(model="gpt-4o-mini")

def call_chef(state: ChefState):
    structured_llm = llm.with_structured_output(RecipeStep)
    # The system prompt enforces the "Human-like Chef" persona
    response = structured_llm.invoke([
        ("system", "You are a professional chef. Guide the user step-by-step."),
        *state["messages"]
    ])
    return {"messages": [("assistant", str(response.json()))]}

# 3. Build Graph
builder = StateGraph(ChefState)
builder.add_node("chef", call_chef)
builder.add_edge(START, "chef")
builder.add_edge("chef", END)

# MemorySaver keeps the thread_id alive even if the tab closes
memory = MemorySaver()
chef_app = builder.compile(checkpointer=memory)