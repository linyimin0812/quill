import { create } from 'zustand';

export interface ToolCallInfo {
  id: string;
  name: string;
  status: 'running' | 'done';
}

export interface AiMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  thinking?: string;
  toolCalls?: ToolCallInfo[];
  timestamp: number;
}

interface AiState {
  messages: AiMessage[];
  isStreaming: boolean;
  contextScope: 'document' | 'vault';
  addMessage: (role: 'user' | 'ai', content: string) => void;
  appendToLastMessage: (token: string) => void;
  appendThinking: (token: string) => void;
  addToolCall: (id: string, name: string) => void;
  completeToolCall: (id: string) => void;
  setStreaming: (streaming: boolean) => void;
  setContextScope: (scope: 'document' | 'vault') => void;
  clearMessages: () => void;
}

export const useAiStore = create<AiState>((set) => ({
  messages: [],
  isStreaming: false,
  contextScope: 'document',

  addMessage: (role, content) =>
    set((state) => {
      const now = Date.now();
      const uniqueId = `${now}-${Math.random().toString(36).slice(2, 8)}`;
      return {
        messages: [
          ...state.messages,
          { id: uniqueId, role, content, timestamp: now },
        ],
      };
    }),

  appendToLastMessage: (token) =>
    set((state) => {
      const msgs = [...state.messages];
      if (msgs.length > 0) {
        msgs[msgs.length - 1] = {
          ...msgs[msgs.length - 1],
          content: msgs[msgs.length - 1].content + token,
        };
      }
      return { messages: msgs };
    }),

  appendThinking: (token) =>
    set((state) => {
      const msgs = [...state.messages];
      if (msgs.length > 0) {
        const last = msgs[msgs.length - 1];
        msgs[msgs.length - 1] = {
          ...last,
          thinking: (last.thinking || '') + token,
        };
      }
      return { messages: msgs };
    }),

  addToolCall: (id, name) =>
    set((state) => {
      const msgs = [...state.messages];
      if (msgs.length > 0) {
        const last = msgs[msgs.length - 1];
        msgs[msgs.length - 1] = {
          ...last,
          toolCalls: [...(last.toolCalls || []), { id, name, status: 'running' }],
        };
      }
      return { messages: msgs };
    }),

  completeToolCall: (id) =>
    set((state) => {
      const msgs = [...state.messages];
      if (msgs.length > 0) {
        const last = msgs[msgs.length - 1];
        msgs[msgs.length - 1] = {
          ...last,
          toolCalls: (last.toolCalls || []).map((tc) =>
            tc.id === id ? { ...tc, status: 'done' as const } : tc,
          ),
        };
      }
      return { messages: msgs };
    }),

  setStreaming: (streaming) => set({ isStreaming: streaming }),
  setContextScope: (scope) => set({ contextScope: scope }),
  clearMessages: () => set({ messages: [] }),
}));
