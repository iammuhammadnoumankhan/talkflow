## Key Features:

**🔧 Model Management:**
- List all available Ollama models
- Model validation before starting sessions

**💬 Chat Functionality:**
- Regular chat with complete responses
- Streaming chat for real-time responses
- Support for system prompts
- Message history maintained per session

**📝 Session Management:**
- Create new chat sessions
- List all sessions with metadata
- Get session details and history
- Delete sessions
- Session-based conversation memory

**⚡ Additional Features:**
- Health check endpoints
- CORS enabled for frontend integration
- Error handling with proper HTTP status codes
- Async/await for optimal performance

## Installation & Setup:

1. **Install dependencies:**
```bash
pip install fastapi uvicorn httpx pydantic
```

2. **Make sure Ollama is running:**
```bash
ollama serve
```

3. **Run the FastAPI server:**
```bash
python your_file.py
# or
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## API Endpoints:

- `GET /models` - List available models
- `POST /chat` - Send message and get response
- `POST /chat/stream` - Stream chat responses
- `GET /sessions` - List all chat sessions
- `POST /sessions?model=<model_name>` - Create new session
- `GET /sessions/{session_id}` - Get session details
- `DELETE /sessions/{session_id}` - Delete session
- `GET /health` - Check server status

## Example Usage:

```bash
# List models
curl http://localhost:8000/models

# Create session
curl -X POST "http://localhost:8000/sessions?model=llama2"

# Chat
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello!",
    "model": "llama2",
    "session_id": "your-session-id"
  }'
```

The backend uses in-memory storage for sessions (perfect for development). For production, you'd want to use a proper database like PostgreSQL or Redis. This FastAPI integration with Ollama allows you to create AI-powered web applications that run locally and respond quickly.