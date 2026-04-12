import { useCallback } from 'react';
import { useAiStore } from '@/store/aiStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useEditorStore } from '@/store/editorStore';
import { useVaultStore } from '@/store/vaultStore';

const SIDECAR_URL = 'http://localhost:3001/quill';

export function useAiStream() {
  const addMessage = useAiStore((s) => s.addMessage);
  const appendToLastMessage = useAiStore((s) => s.appendToLastMessage);
  const appendThinking = useAiStore((s) => s.appendThinking);
  const addToolCall = useAiStore((s) => s.addToolCall);
  const completeToolCall = useAiStore((s) => s.completeToolCall);
  const setStreaming = useAiStore((s) => s.setStreaming);
  const messages = useAiStore((s) => s.messages);

  const send = useCallback(
    async (prompt: string, mode: 'chat' | 'agent' = 'chat') => {
      const settings = useSettingsStore.getState();

      addMessage('user', prompt);
      addMessage('ai', '');
      setStreaming(true);

      const history = messages.map((msg) => ({
        role: msg.role === 'ai' ? 'assistant' : 'user',
        content: msg.content,
      }));
      history.push({ role: 'user', content: prompt });

      // Build document context for Agent mode
      let documentContext: { path: string; content: string; vaultRoot?: string } | undefined;
      if (mode === 'agent') {
        const editorState = useEditorStore.getState();
        const activeTab = editorState.tabs.find((t) => t.id === editorState.activeTabId);
        if (activeTab) {
          const vaultState = useVaultStore.getState();
          const activeVault = vaultState.vaults.find((v) => v.id === vaultState.activeVaultId);
          documentContext = {
            path: activeTab.path,
            content: activeTab.content,
            vaultRoot: activeVault?.basePath,
          };
        }
      }

      try {
        const response = await fetch(`${SIDECAR_URL}/ai/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: history,
            provider: settings.llmProvider,
            apiKey: settings.llmApiKey,
            model: settings.llmModel,
            temperature: settings.temperature,
            maxTokens: settings.maxTokens,
            systemPrompt: settings.systemPrompt,
            ollamaUrl: settings.ollamaUrl,
            mode,
            documentContext,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          appendToLastMessage(`[错误 ${response.status}] ${errorText}`);
          return;
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  switch (data.type) {
                    case 'token':
                      appendToLastMessage(data.content);
                      break;
                    case 'thinking':
                      appendThinking(data.content);
                      break;
                    case 'tool_start': {
                      const toolInfo = JSON.parse(data.content);
                      addToolCall(toolInfo.id, toolInfo.name);
                      break;
                    }
                    case 'tool_end': {
                      const toolEnd = JSON.parse(data.content);
                      completeToolCall(toolEnd.id);
                      break;
                    }
                    case 'doc_update': {
                      // Agent modified the document — update editor content
                      const docUpdate = JSON.parse(data.content);
                      const editorState = useEditorStore.getState();
                      const targetTab = editorState.tabs.find(
                        (t) => t.path === docUpdate.path,
                      );
                      if (targetTab) {
                        editorState.updateTabContent(targetTab.id, docUpdate.content);
                      }
                      break;
                    }
                    case 'error':
                      appendToLastMessage(`\n\n[错误] ${data.content}`);
                      break;
                  }
                } catch {
                  // skip malformed lines
                }
              }
            }
          }
        }
      } catch {
        appendToLastMessage('\n\n[连接错误，请检查后端服务是否已启动]');
      } finally {
        setStreaming(false);
      }
    },
    [addMessage, appendToLastMessage, appendThinking, addToolCall, completeToolCall, setStreaming, messages],
  );

  return { send };
}
