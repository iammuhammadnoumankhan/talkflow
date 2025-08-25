import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Plus, Trash2, MessageCircle, Zap, Settings, Moon, Sun } from 'lucide-react';

// const API_BASE_URL = 'http://localhost:8000';
// const API_BASE_URL = 'http://backend:8000';
const API_BASE_URL = "/api";


// Type definitions
interface ModelInfo {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: Record<string, any>;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  error?: boolean;
}

interface SessionInfo {
  session_id: string;
  model: string;
  created_at: string;
  last_updated: string;
  message_count: number;
}

interface SessionDetails {
  session_id: string;
  model: string;
  created_at: string;
  last_updated: string;
  messages: ChatMessage[];
}

interface ChatRequest {
  message: string;
  model: string;
  session_id?: string;
  system_prompt?: string;
}

interface StreamData {
  content?: string;
  session_id?: string;
  done?: boolean;
}

interface CreateSessionResponse {
  session_id: string;
  model: string;
  created_at: string;
}

const OllamaChat: React.FC = () => {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [currentSession, setCurrentSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchModels();
    fetchSessions();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = (): void => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchModels = async (): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/models`);
      if (!response.ok) throw new Error('Failed to fetch models');
      
      const data: ModelInfo[] = await response.json();
      setModels(data);
      if (data.length > 0 && !selectedModel) {
        setSelectedModel(data[0].name);
      }
    } catch (error) {
      console.error('Error fetching models:', error);
    }
  };

  const fetchSessions = async (): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/sessions`);
      if (!response.ok) throw new Error('Failed to fetch sessions');
      
      const data: SessionInfo[] = await response.json();
      setSessions(data);
    } catch (error) {
      console.error('Error fetching sessions:', error);
    }
  };

  const createNewSession = async (): Promise<void> => {
    if (!selectedModel) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/sessions?model=${selectedModel}`, {
        method: 'POST'
      });
      
      if (!response.ok) throw new Error('Failed to create session');
      
      const data: CreateSessionResponse = await response.json();
      
      setCurrentSession(data.session_id);
      setMessages([]);
      await fetchSessions();
    } catch (error) {
      console.error('Error creating session:', error);
    }
  };

  const loadSession = async (sessionId: string): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}`);
      if (!response.ok) throw new Error('Failed to load session');
      
      const data: SessionDetails = await response.json();
      
      setCurrentSession(sessionId);
      setSelectedModel(data.model);
      setMessages(data.messages || []);
    } catch (error) {
      console.error('Error loading session:', error);
    }
  };

  const deleteSession = async (sessionId: string, event: React.MouseEvent): Promise<void> => {
    event.stopPropagation();
    
    try {
      const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) throw new Error('Failed to delete session');
      
      if (currentSession === sessionId) {
        setCurrentSession(null);
        setMessages([]);
      }
      
      await fetchSessions();
    } catch (error) {
      console.error('Error deleting session:', error);
    }
  };

  const sendMessage = async (): Promise<void> => {
    if (!inputMessage.trim() || loading || !selectedModel) return;
    
    const userMessage: ChatMessage = {
      role: 'user',
      content: inputMessage,
      timestamp: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setLoading(true);
    setIsStreaming(true);

    try {
      abortControllerRef.current = new AbortController();
      
      const requestBody: ChatRequest = {
        message: inputMessage,
        model: selectedModel,
        session_id: currentSession || undefined,
        system_prompt: systemPrompt || undefined
      };
      
      const response = await fetch(`${API_BASE_URL}/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) throw new Error('Failed to send message');
      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      let assistantMessage: ChatMessage = {
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, assistantMessage]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data: StreamData = JSON.parse(line.slice(6));
              
              if (data.content) {
                assistantMessage.content += data.content;
                setMessages(prev => {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1] = { ...assistantMessage };
                  return newMessages;
                });
              }
              
              if (data.done && data.session_id) {
                setCurrentSession(data.session_id);
                break;
              }
            } catch (e) {
              console.error('Error parsing stream data:', e);
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Error sending message:', error);
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Sorry, there was an error processing your message.',
          timestamp: new Date().toISOString(),
          error: true
        }]);
      }
    } finally {
      setLoading(false);
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const stopGeneration = (): void => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    setSelectedModel(e.target.value);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setInputMessage(e.target.value);
  };

  const handleSystemPromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setSystemPrompt(e.target.value);
  };

  const formatTime = (timestamp: string): string => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const theme = darkMode ? 'dark' : '';

  return (
    <div className={`${theme} min-h-screen transition-colors duration-200`}>
      <div className="flex h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
        {/* Sidebar */}
        <div className="w-80 bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border-r border-gray-200 dark:border-gray-700 flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Ollama Chat
              </h1>
              <div className="flex gap-2">
                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  aria-label="Toggle dark mode"
                >
                  {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  aria-label="Toggle settings"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            {/* Model Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Select Model
              </label>
              <select
                value={selectedModel}
                onChange={handleModelChange}
                className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              >
                <option value="" disabled>Choose a model...</option>
                {models.map((model) => (
                  <option key={model.name} value={model.name}>
                    {model.name}
                  </option>
                ))}
              </select>
            </div>

            {/* New Chat Button */}
            <button
              onClick={createNewSession}
              disabled={!selectedModel}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-700 hover:to-purple-700 transform hover:scale-105 transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              <Plus className="w-5 h-5" />
              New Chat
            </button>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                System Prompt
              </label>
              <textarea
                value={systemPrompt}
                onChange={handleSystemPromptChange}
                placeholder="Set a system prompt for the AI..."
                className="w-full p-2 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                rows={3}
              />
            </div>
          )}

          {/* Sessions List */}
          <div className="flex-1 overflow-y-auto p-4">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Recent Chats
            </h3>
            <div className="space-y-2">
              {sessions.map((session) => (
                <div
                  key={session.session_id}
                  onClick={() => loadSession(session.session_id)}
                  className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all hover:bg-gray-100 dark:hover:bg-gray-700 ${
                    currentSession === session.session_id 
                      ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700' 
                      : 'hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="p-2 bg-gradient-to-r from-green-400 to-blue-500 rounded-lg">
                      <MessageCircle className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {session.model}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {session.message_count} messages
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => deleteSession(session.session_id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900 rounded-lg transition-all"
                    aria-label="Delete session"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Chat Header */}
          <div className="p-6 bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {selectedModel || 'Select a model'}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {currentSession ? `Session: ${currentSession.slice(0, 8)}...` : 'No active session'}
                </p>
              </div>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="p-4 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full mb-4">
                  <Zap className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                  Ready to Chat!
                </h3>
                <p className="text-gray-500 dark:text-gray-400 max-w-md">
                  Start a conversation with your AI assistant. Ask questions, get help, or just chat!
                </p>
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex gap-4 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    message.role === 'user'
                      ? 'bg-gradient-to-r from-blue-500 to-purple-600'
                      : message.error
                      ? 'bg-gradient-to-r from-red-500 to-pink-500'
                      : 'bg-gradient-to-r from-green-500 to-teal-600'
                  }`}>
                    {message.role === 'user' ? (
                      <User className="w-4 h-4 text-white" />
                    ) : (
                      <Bot className="w-4 h-4 text-white" />
                    )}
                  </div>
                  <div className={`flex-1 max-w-3xl ${message.role === 'user' ? 'text-right' : ''}`}>
                    <div className={`inline-block p-4 rounded-2xl shadow-sm ${
                      message.role === 'user'
                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                        : message.error
                        ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                        : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700'
                    }`}>
                      <div className="whitespace-pre-wrap break-words">
                        {message.content}
                      </div>
                    </div>
                    <div className={`text-xs text-gray-500 dark:text-gray-400 mt-2 ${
                      message.role === 'user' ? 'text-right' : 'text-left'
                    }`}>
                      {formatTime(message.timestamp)}
                    </div>
                  </div>
                </div>
              ))
            )}
            {loading && (
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-r from-green-500 to-teal-600 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1">
                  <div className="inline-block p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-6 bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border-t border-gray-200 dark:border-gray-700">
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <textarea
                  value={inputMessage}
                  onChange={handleInputChange}
                  onKeyPress={handleKeyPress}
                  placeholder={currentSession ? "Type your message..." : "Create a new session to start chatting"}
                  disabled={!currentSession || loading}
                  className="w-full p-4 rounded-2xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none disabled:opacity-50"
                  rows={1}
                  style={{ minHeight: '56px', maxHeight: '120px' }}
                />
              </div>
              {isStreaming ? (
                <button
                  onClick={stopGeneration}
                  className="p-4 bg-red-500 text-white rounded-2xl hover:bg-red-600 transform hover:scale-105 transition-all duration-200 shadow-lg"
                  aria-label="Stop generation"
                >
                  <div className="w-5 h-5 border-2 border-white"></div>
                </button>
              ) : (
                <button
                  onClick={sendMessage}
                  disabled={!inputMessage.trim() || !currentSession || loading}
                  className="p-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 transition-all duration-200 shadow-lg"
                  aria-label="Send message"
                >
                  <Send className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OllamaChat;