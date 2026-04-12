import { Injectable } from '@nestjs/common';

export interface SearchResult {
  path: string;
  title: string;
  snippet: string;
  score: number;
}

@Injectable()
export class SearchService {
  private index: Map<string, { title: string; content: string }> = new Map();

  async addToIndex(path: string, title: string, content: string) {
    this.index.set(path, { title, content });
    return { indexed: true, path };
  }

  async search(query: string): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const lowerQuery = query.toLowerCase();

    for (const [path, { title, content }] of this.index.entries()) {
      const lowerContent = content.toLowerCase();
      const idx = lowerContent.indexOf(lowerQuery);
      if (idx !== -1 || title.toLowerCase().includes(lowerQuery)) {
        const snippetStart = Math.max(0, idx - 40);
        const snippetEnd = Math.min(content.length, idx + query.length + 40);
        results.push({
          path,
          title,
          snippet: content.slice(snippetStart, snippetEnd),
          score: title.toLowerCase().includes(lowerQuery) ? 1.0 : 0.5,
        });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  async rebuildIndex() {
    return { total: this.index.size };
  }
}
