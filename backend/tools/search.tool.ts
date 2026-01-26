import axios from 'axios';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

class SearchTool {
  /**
   * Search the web for information using SerpAPI
   * Used for fact-checking claims in the explanation pipeline
   */
  async search(query: string, limit: number = 3): Promise<SearchResult[]> {
    if (!process.env.SERPAPI_KEY) {
      console.warn('[SearchTool] SERPAPI_KEY not found. Search tool will return empty results.');
      return [];
    }

    try {
      console.log(`[SearchTool] Searching for: "${query}"`);

      const response = await axios.get('https://serpapi.com/search', {
        params: {
          q: query,
          api_key: process.env.SERPAPI_KEY,
          num: limit,
        },
        timeout: 10000, // 10 second timeout
      });

      const results: SearchResult[] = (response.data.organic_results || []).map(
        (result: any) => ({
          title: result.title || '',
          url: result.link || '',
          snippet: result.snippet || '',
        })
      );

      console.log(`[SearchTool] Found ${results.length} results`);
      return results;
    } catch (error: any) {
      console.error('[SearchTool] Search failed:', error.message);
      return [];
    }
  }

  /**
   * Verify a factual claim by searching for corroborating sources
   */
  async verifyClaim(claim: string): Promise<{
    verified: boolean;
    confidence: number;
    sources: SearchResult[];
  }> {
    const results = await this.search(claim, 3);

    if (results.length === 0) {
      return {
        verified: false,
        confidence: 0,
        sources: [],
      };
    }

    // Simple verification: check if claim keywords appear in snippets
    const claimWords = claim
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);
    let matchCount = 0;

    for (const result of results) {
      const snippetLower = result.snippet.toLowerCase();
      const matches = claimWords.filter((word) => snippetLower.includes(word));
      if (matches.length >= claimWords.length * 0.5) {
        matchCount++;
      }
    }

    const confidence = matchCount / results.length;

    return {
      verified: confidence >= 0.5,
      confidence,
      sources: results,
    };
  }
}

export const searchTool = new SearchTool();
