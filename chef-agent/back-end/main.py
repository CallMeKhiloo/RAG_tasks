from fastapi import FastAPI
from chef_graph import chef_app
from schema import ChefRequest
import json
from fastapi.middleware.cors import CORSMiddleware
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/chat")
async def chat_with_chef(req: ChefRequest):
    config = {"configurable": {"thread_id": req.thread_id}}
    
    # Run the graph
    input_data = {"messages": [("user", req.message)]}
    result = chef_app.invoke(input_data, config)
    
    # Get the last message (the Chef's response)
    last_msg = result["messages"][-1]
    last_msg_content = getattr(last_msg, "content", last_msg[1] if isinstance(last_msg, tuple) else str(last_msg))
    return json.loads(last_msg_content)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="localhost", port=8000)