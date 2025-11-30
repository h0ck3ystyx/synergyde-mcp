/**
 * In-memory search index for documentation topics
 * Uses simple term frequency scoring for relevance ranking
 */

import type { Topic, SearchResult } from "../../types.js";

/**
 * Internal index entry for a topic
 */
interface IndexEntry {
  topic: Topic;
  /** Normalized title tokens */
  titleTokens: string[];
  /** Normalized summary tokens */
  summaryTokens: string[];
  /** Normalized body text tokens (from all chunks) */
  bodyTokens: string[];
}

/**
 * Search index for documentation topics
 */
export class SearchIndex {
  private index: Map<string, IndexEntry> = new Map();

  /**
   * Add a topic to the search index
   * @param topic - The topic to index
   */
  addTopic(topic: Topic): void {
    const titleTokens = this.tokenize(topic.title);
    const summaryTokens = this.tokenize(topic.summary);
    const bodyTokens = this.tokenize(
      topic.body_chunks.map((chunk) => chunk.text).join(" ")
    );

    // Use version:id as key to prevent collisions across versions
    const indexKey = `${topic.version}:${topic.id}`;
    this.index.set(indexKey, {
      topic,
      titleTokens,
      summaryTokens,
      bodyTokens,
    });
  }

  /**
   * Search for topics matching the query
   * @param query - Search query string
   * @param version - Optional version filter
   * @param section - Optional section filter
   * @param limit - Maximum number of results to return
   * @returns Array of search results sorted by relevance
   */
  search(
    query: string,
    version?: string,
    section?: string,
    limit?: number
  ): SearchResult[] {
    // Handle empty or whitespace-only queries
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return [];
    }

    const queryTokens = this.tokenize(normalizedQuery);
    if (queryTokens.length === 0) {
      return [];
    }

    const results: SearchResult[] = [];

    // Score each indexed topic
    for (const entry of this.index.values()) {
      // Apply filters
      if (version && entry.topic.version !== version) {
        continue;
      }
      if (section && entry.topic.section !== section) {
        continue;
      }

      // Calculate relevance score
      const score = this.calculateScore(queryTokens, entry);

      if (score > 0) {
        results.push({
          topic_id: entry.topic.id,
          title: entry.topic.title,
          section: entry.topic.section,
          version: entry.topic.version,
          url: entry.topic.url,
          summary: entry.topic.summary,
          source: entry.topic.source,
          score,
        });
      }
    }

    // Sort by score (highest first)
    results.sort((a, b) => (b.score || 0) - (a.score || 0));

    // Apply limit
    if (limit !== undefined) {
      // Clamp negative values to 0
      const clampedLimit = Math.max(0, limit);
      // Return empty array if limit is 0, otherwise slice to limit
      return clampedLimit === 0 ? [] : results.slice(0, clampedLimit);
    }

    return results;
  }

  /**
   * Clear all topics from the index
   */
  clear(): void {
    this.index.clear();
  }

  /**
   * Calculate relevance score for a query against an index entry
   * Uses term frequency with higher weights for title matches
   * @param queryTokens - Tokenized query terms
   * @param entry - Index entry to score
   * @returns Relevance score (higher is more relevant)
   */
  private calculateScore(queryTokens: string[], entry: IndexEntry): number {
    let score = 0;

    // Weight title matches highest (weight: 3)
    for (const token of queryTokens) {
      const titleCount = this.countToken(entry.titleTokens, token);
      score += titleCount * 3;
    }

    // Weight summary matches medium (weight: 2)
    for (const token of queryTokens) {
      const summaryCount = this.countToken(entry.summaryTokens, token);
      score += summaryCount * 2;
    }

    // Weight body matches lowest (weight: 1)
    for (const token of queryTokens) {
      const bodyCount = this.countToken(entry.bodyTokens, token);
      score += bodyCount * 1;
    }

    return score;
  }

  /**
   * Count occurrences of a token in a token array
   * @param tokens - Array of tokens to search
   * @param token - Token to count
   * @returns Number of occurrences
   */
  private countToken(tokens: string[], token: string): number {
    return tokens.filter((t) => t === token).length;
  }

  /**
   * Tokenize text into lowercase words
   * Preserves important programming language symbols and normalizes them
   * @param text - Text to tokenize
   * @returns Array of normalized tokens
   */
  private tokenize(text: string): string[] {
    const lower = text.toLowerCase();
    
    // Normalize important programming language symbols before tokenization
    // This preserves meaning for searches like "C++", "C#", ".NET", etc.
    const normalized = lower
      .replace(/c\+\+/g, "c-plus-plus") // C++ → c-plus-plus
      .replace(/c#/g, "c-sharp") // C# → c-sharp
      .replace(/\.net/g, "dot-net") // .NET → dot-net
      .replace(/\//g, " ") // Forward slashes become spaces (e.g., "XFILENAME.DBR" → "xfilename dbr")
      .replace(/\./g, " ") // Dots become spaces (e.g., "XFILENAME.DBR" → "xfilename dbr")
      .replace(/[^\w\s-]/g, " "); // Replace other punctuation with spaces (but keep hyphens)
    
    return normalized
      .split(/\s+/) // Split on whitespace
      .filter((token) => token.length > 0); // Remove empty strings
  }
}
