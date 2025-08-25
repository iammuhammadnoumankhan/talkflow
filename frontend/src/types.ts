export interface ModelInfo {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: Record<string, any>;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  error?: boolean;
}

export interface SessionInfo {
  session_id: string;
  model: string;
  created_at: string;
  last_updated: string;
  message_count: number;
}

export interface SessionDetails {
  session_id: string;
  model: string;
  created_at: string;
  last_updated: string;
  messages: ChatMessage[];
}

export interface ChatRequest {
  message: string;
  model: string;
  session_id?: string;
  system_prompt?: string;
}

export interface StreamData {
  content?: string;
  session_id?: string;
  done?: boolean;
}

export interface CreateSessionResponse {
  session_id: string;
  model: string;
  created_at: string;
}