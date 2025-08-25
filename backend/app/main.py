from fastapi import FastAPI, HTTPException, Depends
from fastapi import APIRouter
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import httpx
import json
import uuid
from datetime import datetime
import asyncio
import os

app = FastAPI(title="Ollama Chat API", version="1.0.0")

# # mount all endoinst woth a prefix /api
api_router = APIRouter(prefix="/api")

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ollama server configuration
# OLLAMA_BASE_URL = "http://localhost:11434"
OLLAMA_BASE_URL = os.environ.get("OLLAMA_HOST", "http://localhost:11434")

# In-memory storage for sessions (use database in production)
chat_sessions: Dict[str, Dict[str, Any]] = {}

# Pydantic models
class ChatMessage(BaseModel):
    role: str  # "user", "assistant", "system"
    content: str
    timestamp: Optional[datetime] = None

class ChatRequest(BaseModel):
    message: str
    model: str
    session_id: Optional[str] = None
    system_prompt: Optional[str] = None

class ChatResponse(BaseModel):
    response: str
    session_id: str
    model: str
    timestamp: datetime

class ModelInfo(BaseModel):
    name: str
    modified_at: str
    size: int
    digest: str
    details: Optional[Dict[str, Any]] = None

class SessionInfo(BaseModel):
    session_id: str
    model: str
    created_at: datetime
    last_updated: datetime
    message_count: int

# Helper functions
async def get_ollama_client():
    """Get HTTP client for Ollama API"""
    return httpx.AsyncClient(base_url=OLLAMA_BASE_URL, timeout=60.0)

def create_session(model: str) -> str:
    """Create a new chat session"""
    session_id = str(uuid.uuid4())
    chat_sessions[session_id] = {
        "model": model,
        "messages": [],
        "created_at": datetime.now(),
        "last_updated": datetime.now()
    }
    return session_id

def get_session_messages(session_id: str) -> List[Dict[str, str]]:
    """Get messages for a session in Ollama format"""
    if session_id not in chat_sessions:
        return []
    
    messages = []
    for msg in chat_sessions[session_id]["messages"]:
        messages.append({
            "role": msg["role"],
            "content": msg["content"]
        })
    return messages

# API Endpoints

@api_router.get("/")
async def root():
    """Health check endpoint"""
    return {"message": "Ollama Chat API is running"}

@api_router.get("/models", response_model=List[ModelInfo])
async def list_models():
    """List available models from Ollama"""
    try:
        async with await get_ollama_client() as client:
            response = await client.get("/api/tags")
            response.raise_for_status()
            data = response.json()
            
            models = []
            for model in data.get("models", []):
                models.append(ModelInfo(
                    name=model["name"],
                    modified_at=model["modified_at"],
                    size=model["size"],
                    digest=model["digest"],
                    details=model.get("details")
                ))
            return models
    except httpx.RequestError:
        raise HTTPException(status_code=503, detail="Ollama server is not available")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching models: {str(e)}")

@api_router.post("/chat", response_model=ChatResponse)
async def chat_with_model(request: ChatRequest):
    """Chat with a selected model"""
    try:
        # Create or get existing session
        session_id = request.session_id or create_session(request.model)
        
        if session_id not in chat_sessions:
            raise HTTPException(status_code=404, detail="Session not found")
        
        session = chat_sessions[session_id]
        
        # Verify model matches session
        if session["model"] != request.model:
            raise HTTPException(status_code=400, detail="Model mismatch with session")
        
        # Add user message to session
        user_message = {
            "role": "user",
            "content": request.message,
            "timestamp": datetime.now()
        }
        session["messages"].append(user_message)
        
        # Prepare messages for Ollama
        messages = get_session_messages(session_id)
        
        # Add system prompt if provided
        if request.system_prompt:
            messages.insert(0, {
                "role": "system",
                "content": request.system_prompt
            })
        
        # Send request to Ollama
        async with await get_ollama_client() as client:
            chat_payload = {
                "model": request.model,
                "messages": messages,
                "stream": False
            }
            
            response = await client.post("/api/chat", json=chat_payload)
            response.raise_for_status()
            data = response.json()
            
            # Extract assistant response
            assistant_content = data["message"]["content"]
            
            # Add assistant message to session
            assistant_message = {
                "role": "assistant",
                "content": assistant_content,
                "timestamp": datetime.now()
            }
            session["messages"].append(assistant_message)
            session["last_updated"] = datetime.now()
            
            return ChatResponse(
                response=assistant_content,
                session_id=session_id,
                model=request.model,
                timestamp=datetime.now()
            )
            
    except httpx.RequestError:
        raise HTTPException(status_code=503, detail="Ollama server is not available")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=f"Ollama error: {e.response.text}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat error: {str(e)}")

@api_router.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    """Stream chat response from model"""
    try:
        from fastapi.responses import StreamingResponse
        import json
        
        # Create or get existing session
        session_id = request.session_id or create_session(request.model)
        
        if session_id not in chat_sessions:
            raise HTTPException(status_code=404, detail="Session not found")
        
        session = chat_sessions[session_id]
        
        # Add user message to session
        user_message = {
            "role": "user",
            "content": request.message,
            "timestamp": datetime.now()
        }
        session["messages"].append(user_message)
        
        # Prepare messages for Ollama
        messages = get_session_messages(session_id)
        
        if request.system_prompt:
            messages.insert(0, {
                "role": "system",
                "content": request.system_prompt
            })
        
        async def generate():
            full_response = ""
            async with await get_ollama_client() as client:
                chat_payload = {
                    "model": request.model,
                    "messages": messages,
                    "stream": True
                }
                
                async with client.stream('POST', '/api/chat', json=chat_payload) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if line:
                            try:
                                data = json.loads(line)
                                if "message" in data and "content" in data["message"]:
                                    content = data["message"]["content"]
                                    full_response += content
                                    
                                    # Send chunk
                                    yield f"data: {json.dumps({'content': content, 'session_id': session_id})}\n\n"
                                
                                # Check if done
                                if data.get("done", False):
                                    # Add complete response to session
                                    assistant_message = {
                                        "role": "assistant",
                                        "content": full_response,
                                        "timestamp": datetime.now()
                                    }
                                    session["messages"].append(assistant_message)
                                    session["last_updated"] = datetime.now()
                                    
                                    yield f"data: {json.dumps({'done': True, 'session_id': session_id})}\n\n"
                                    break
                            except json.JSONDecodeError:
                                continue
        
        return StreamingResponse(generate(), media_type="text/stream")
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Streaming error: {str(e)}")

@api_router.get("/sessions", response_model=List[SessionInfo])
async def list_sessions():
    """List all chat sessions"""
    sessions = []
    for session_id, session_data in chat_sessions.items():
        sessions.append(SessionInfo(
            session_id=session_id,
            model=session_data["model"],
            created_at=session_data["created_at"],
            last_updated=session_data["last_updated"],
            message_count=len(session_data["messages"])
        ))
    return sorted(sessions, key=lambda x: x.last_updated, reverse=True)

@api_router.get("/sessions/{session_id}")
async def get_session(session_id: str):
    """Get session details and message history"""
    if session_id not in chat_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = chat_sessions[session_id]
    return {
        "session_id": session_id,
        "model": session["model"],
        "created_at": session["created_at"],
        "last_updated": session["last_updated"],
        "messages": session["messages"]
    }

@api_router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete a chat session"""
    if session_id not in chat_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    del chat_sessions[session_id]
    return {"message": "Session deleted successfully"}

@api_router.post("/sessions")
async def create_new_session(model: str):
    """Create a new chat session"""
    try:
        # Verify model exists
        async with await get_ollama_client() as client:
            response = await client.get("/api/tags")
            response.raise_for_status()
            data = response.json()
            
            available_models = [m["name"] for m in data.get("models", [])]
            if model not in available_models:
                raise HTTPException(status_code=400, detail=f"Model '{model}' not available")
        
        session_id = create_session(model)
        return {
            "session_id": session_id,
            "model": model,
            "created_at": chat_sessions[session_id]["created_at"]
        }
    except httpx.RequestError:
        raise HTTPException(status_code=503, detail="Ollama server is not available")

@api_router.get("/health")
async def health_check():
    """Check if Ollama server is running"""
    try:
        async with await get_ollama_client() as client:
            response = await client.get("/api/tags")
            response.raise_for_status()
            return {"status": "healthy", "ollama": "connected"}
    except httpx.RequestError:
        return {"status": "unhealthy", "ollama": "disconnected"}
    
app.include_router(api_router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)