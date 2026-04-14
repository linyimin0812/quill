/**
 * Global auth token management.
 * Token is stored in sessionStorage so it persists across page refreshes
 * within the same browser session, but is cleared when the tab is closed.
 */

const SESSION_KEY = 'quill:auth-token';

/** Get the API base URL (same logic as storageClient) */
export function getApiRoot(): string {
  if (typeof window !== 'undefined' && window.location.protocol === 'tauri:') {
    return 'http://localhost:3001/quill/api';
  }
  return '/quill/api';
}

/** Get the current auth token from sessionStorage */
export function getAuthToken(): string | null {
  return sessionStorage.getItem(SESSION_KEY);
}

/** Store the auth token in sessionStorage */
export function setAuthToken(token: string): void {
  sessionStorage.setItem(SESSION_KEY, token);
}

/** Clear the auth token */
export function clearAuthToken(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

/** Build common headers including Authorization if a token is set */
export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/** Check auth status from the backend, retrying until the server is ready */
export async function checkAuthStatus(): Promise<{ enabled: boolean; hasToken: boolean }> {
  const maxRetries = 20;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`${getApiRoot()}/auth/status`);
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // Server not ready yet
    }
    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  // After all retries failed, assume no auth (allow access so app doesn't get stuck)
  return { enabled: false, hasToken: false };
}
