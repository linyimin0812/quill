import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  streamSimple,
  getModel,
  getModels,
  getProviders,
  registerBuiltInApiProviders,
} from '@mariozechner/pi-ai';
import type { Model, Api, SimpleStreamOptions } from '@mariozechner/pi-ai';
import { Agent } from '@mariozechner/pi-agent-core';
import type { ChatRequest, StreamChunk } from './providers/Provider.js';
import { createWritingTools } from './providers/agent-tools.js';

@Injectable()
export class AiService implements OnModuleInit {
  onModuleInit() {
    registerBuiltInApiProviders();
  }

  getAvailableModels() {
    return getProviders().map((provider) => ({
      provider,
      models: getModels(provider).map((m) => ({ id: m.id, name: m.name })),
    }));
  }

  /**
   * Simple chat mode: stream LLM response directly via pi-ai streamSimple.
   */
  async *streamChat(request: ChatRequest): AsyncGenerator<StreamChunk> {
    if (!request.apiKey && request.provider !== 'local') {
      yield { type: 'error', content: '请先在设置中配置 API Key' };
      return;
    }
    if (!request.model) {
      yield { type: 'error', content: '请先在设置中选择模型' };
      return;
    }

    const model = this.resolveModel(request);
    if (!model) {
      yield { type: 'error', content: `未找到模型: ${request.provider}/${request.model}` };
      return;
    }

    const context = this.buildContext(request);
    const options: SimpleStreamOptions = {
      apiKey: request.apiKey,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
    };

    try {
      const stream = streamSimple(model, context, options);
      for await (const event of stream) {
        if (event.type === 'text_delta') {
          yield { type: 'token', content: event.delta };
        } else if (event.type === 'thinking_delta') {
          yield { type: 'thinking', content: event.delta } as StreamChunk;
        } else if (event.type === 'done') {
          yield { type: 'done', content: '' };
        } else if (event.type === 'error') {
          yield { type: 'error', content: event.error?.errorMessage || 'Unknown error' };
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      yield { type: 'error', content: message };
    }
  }

  /**
   * Agent mode: use pi-agent-core Agent with writing tools.
   * The agent can autonomously call tools to polish, translate, rewrite, etc.
   */
  async *streamAgent(request: ChatRequest): AsyncGenerator<StreamChunk> {
    if (!request.apiKey && request.provider !== 'local') {
      yield { type: 'error', content: '请先在设置中配置 API Key' };
      return;
    }
    if (!request.model) {
      yield { type: 'error', content: '请先在设置中选择模型' };
      return;
    }

    const model = this.resolveModel(request);
    if (!model) {
      yield { type: 'error', content: `未找到模型: ${request.provider}/${request.model}` };
      return;
    }

    // Create tools bound to the current document context
    const { tools, documentHolder } = createWritingTools(request.documentContext);

    const docInfo = documentHolder.path
      ? `\n\nThe user currently has the file "${documentHolder.path}" open in the editor. You can use the read_document tool to read its content, and edit_document / replace_document / append_to_document tools to modify it. Always read the document first before making changes.`
      : '\n\nNo document is currently open in the editor. You can still answer questions and provide writing suggestions.';

    const systemPrompt = (request.systemPrompt ||
      'You are Quill AI, a professional writing assistant. You help users polish, translate, rewrite, summarize, and compose articles. Use the available tools when appropriate to fulfill user requests. Always respond in the same language as the user.') + docInfo;

    // Collect events via a queue so we can yield them from the generator
    const eventQueue: StreamChunk[] = [];
    let resolveWaiting: (() => void) | null = null;
    let agentDone = false;

    const pushEvent = (chunk: StreamChunk) => {
      eventQueue.push(chunk);
      if (resolveWaiting) {
        resolveWaiting();
        resolveWaiting = null;
      }
    };

    const agent = new Agent({
      initialState: {
        systemPrompt,
        model: model as Model<any>,
        thinkingLevel: 'low',
        tools: tools as any[],
        messages: [],
      },
      getApiKey: () => request.apiKey,
    });

    agent.subscribe((event) => {
      if (event.type === 'message_update') {
        const assistantEvent = event.assistantMessageEvent;
        if (assistantEvent.type === 'text_delta') {
          pushEvent({ type: 'token', content: assistantEvent.delta });
        } else if (assistantEvent.type === 'thinking_delta') {
          pushEvent({ type: 'thinking', content: assistantEvent.delta } as StreamChunk);
        }
      } else if (event.type === 'tool_execution_start') {
        pushEvent({ type: 'tool_start', content: JSON.stringify({ name: event.toolName, id: event.toolCallId }) } as StreamChunk);
      } else if (event.type === 'tool_execution_end') {
        pushEvent({ type: 'tool_end', content: JSON.stringify({ id: event.toolCallId }) } as StreamChunk);
      } else if (event.type === 'agent_end') {
        // If the document was modified, send the updated content back to the frontend
        if (documentHolder.modified) {
          pushEvent({
            type: 'doc_update',
            content: JSON.stringify({
              path: documentHolder.path,
              content: documentHolder.content,
            }),
          } as StreamChunk);
        }
        pushEvent({ type: 'done', content: '' });
      }
    });

    // Build user message from conversation history
    const lastUserMessage = request.messages
      .filter((m) => m.role === 'user')
      .pop();

    const promptText = lastUserMessage?.content || '';

    // Start agent in background
    agent.prompt(promptText).then(() => {
      agentDone = true;
      if (resolveWaiting) {
        resolveWaiting();
        resolveWaiting = null;
      }
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      pushEvent({ type: 'error', content: message });
      agentDone = true;
      if (resolveWaiting) {
        resolveWaiting();
        resolveWaiting = null;
      }
    });

    // Yield events as they arrive
    while (true) {
      if (eventQueue.length > 0) {
        const chunk = eventQueue.shift()!;
        yield chunk;
        if (chunk.type === 'done' || chunk.type === 'error') return;
      } else if (agentDone) {
        return;
      } else {
        await new Promise<void>((resolve) => {
          resolveWaiting = resolve;
        });
      }
    }
  }

  private resolveModel(request: ChatRequest): Model<Api> | null {
    try {
      return getModel(request.provider as any, request.model as any);
    } catch {
      // Model not found in pi-ai registry; build a manual model descriptor
      // for providers/models not in the built-in registry (e.g. Ollama, custom OpenRouter models)
      return this.buildFallbackModel(request);
    }
  }

  private buildFallbackModel(request: ChatRequest): Model<Api> | null {
    const apiMap: Record<string, string> = {
      anthropic: 'anthropic-messages',
      openai: 'openai-completions',
      google: 'google-generative-ai',
      xai: 'openai-completions',
      mistral: 'mistral-conversations',
      groq: 'openai-completions',
      openrouter: 'openai-completions',
    };

    const baseUrlMap: Record<string, string> = {
      anthropic: 'https://api.anthropic.com',
      openai: 'https://api.openai.com/v1',
      google: 'https://generativelanguage.googleapis.com/v1beta',
      xai: 'https://api.x.ai/v1',
      mistral: 'https://api.mistral.ai/v1',
      groq: 'https://api.groq.com/openai/v1',
      openrouter: 'https://openrouter.ai/api/v1',
    };

    const api = apiMap[request.provider];
    const baseUrl = baseUrlMap[request.provider];
    if (!api || !baseUrl) return null;

    return {
      id: request.model,
      name: request.model,
      api: api as Api,
      provider: request.provider,
      baseUrl,
      reasoning: false,
      input: ['text'] as ('text' | 'image')[],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: request.maxTokens || 4096,
    };
  }

  private buildContext(request: ChatRequest) {
    const messages = request.messages.map((msg) => {
      if (msg.role === 'user') {
        return {
          role: 'user' as const,
          content: msg.content,
          timestamp: Date.now(),
        };
      }
      return {
        role: 'assistant' as const,
        content: [{ type: 'text' as const, text: msg.content }],
        api: '' as Api,
        provider: request.provider,
        model: request.model,
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: 'stop' as const,
        timestamp: Date.now(),
      };
    });

    return {
      systemPrompt: request.systemPrompt,
      messages,
    };
  }
}
