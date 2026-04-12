export interface ChatMessage {
  role: string;
  content: string;
}

export interface DocumentContext {
  /** Current document file path (relative to vault root) */
  path: string;
  /** Current document content */
  content: string;
  /** Vault root directory */
  vaultRoot?: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  provider: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt?: string;
  ollamaUrl?: string;
  /** Current document context for Agent mode */
  documentContext?: DocumentContext;
}

export interface StreamChunk {
  type: 'token' | 'thinking' | 'tool_start' | 'tool_end' | 'doc_update' | 'done' | 'error';
  content: string;
}

export interface AIProvider {
  name: string;
  streamChat(request: ChatRequest): AsyncGenerator<StreamChunk>;
}
