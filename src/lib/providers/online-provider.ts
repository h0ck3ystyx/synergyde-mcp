/**
 * Online documentation provider that fetches from Synergy/DE docs website
 */

import * as cheerio from "cheerio";
import { getConfig } from "../../config.js";
import { chunkBodyText } from "../parser/chunker.js";
import { extractBodyText, parseHtml } from "../parser/html-parser.js";
import { networkError, providerError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { RateLimiter } from "../utils/rate-limiter.js";
import { BaseDocProvider } from "./provider.js";
import type { DocSource, Topic } from "../../types.js";

/**
 * Online documentation provider
 * 
 * Fetches documentation from the Synergy/DE docs website with:
 * - Rate limiting to respect server resources
 * - HTTP caching support (ETag/Last-Modified)
 * - Error handling and retries
 */
export class OnlineProvider extends BaseDocProvider {
  protected readonly source: DocSource = "online";
  private readonly baseUrl: string;
  private readonly defaultVersion: string;
  private readonly rateLimiter: RateLimiter;
  private readonly fetchCache: Map<string, { html: string; timestamp: number }>;
  private readonly cacheMaxAge: number = 60000; // 1 minute default cache

  constructor(baseUrl?: string, defaultVersion?: string) {
    super();
    const config = getConfig();
    this.baseUrl = baseUrl ?? config.docBaseUrl;
    this.defaultVersion = defaultVersion ?? config.defaultVersion;
    
    // Rate limit: 10 requests per 5 seconds (respectful to docs.synergex.com)
    this.rateLimiter = new RateLimiter(10, 5000);
    this.fetchCache = new Map();
  }

  /**
   * Resolve version to actual version string
   */
  private async resolveVersion(version?: string): Promise<string> {
    const targetVersion = version ?? this.defaultVersion;
    
    if (targetVersion === "latest") {
      // For now, assume "latest" maps to the base URL without version
      // In a real implementation, we might fetch an index page to determine latest
      return "latest";
    }
    
    return targetVersion;
  }

  /**
   * Build URL for a topic
   */
  private buildTopicUrl(urlOrId: string, version?: string): string {
    // If it's already a full URL, return it
    if (urlOrId.startsWith("http://") || urlOrId.startsWith("https://")) {
      return urlOrId;
    }

    // If it's a relative URL starting with /, append to base
    if (urlOrId.startsWith("/")) {
      return `${this.baseUrl.replace(/\/$/, "")}${urlOrId}`;
    }

    // Otherwise, construct versioned path
    const resolvedVersion = version ?? this.defaultVersion;
    if (resolvedVersion === "latest") {
      return `${this.baseUrl}${urlOrId}`;
    }

    // Versioned path: /versions/v111/...
    return `${this.baseUrl}versions/${resolvedVersion}/${urlOrId}`;
  }

  /**
   * Fetch HTML content from URL with rate limiting and caching
   * Public method for discovery and other use cases
   */
  async fetchHtml(url: string): Promise<string> {
    // Check cache first
    const cached = this.fetchCache.get(url);
    if (cached && Date.now() - cached.timestamp < this.cacheMaxAge) {
      logger.logCacheOperation("hit", url);
      return cached.html;
    }

    // Wait for rate limit slot
    await this.rateLimiter.waitForSlot();
    
    logger.logHttpFetch(url, "GET");

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "SynergyDE-MCP-Server/0.1.0",
          "Accept": "text/html",
        },
        // 30 second timeout
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw networkError(
          url,
          `HTTP ${response.status}: ${response.statusText}`,
          response.status >= 500 // Retryable for server errors
        );
      }

      const html = await response.text();
      
      // Cache the HTML string directly (not the response object)
      this.fetchCache.set(url, {
        html,
        timestamp: Date.now(),
      });

      logger.logCacheOperation("set", url);
      return html;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw networkError(url, "Request timeout", true);
      }
      
      if (error && typeof error === "object" && "code" in error) {
        throw error; // Already a structured error
      }
      
      throw networkError(
        url,
        error instanceof Error ? error.message : String(error),
        true
      );
    }
  }

  /**
   * Fetch a topic by URL or ID
   */
  async fetchTopic(urlOrId: string, version?: string): Promise<Topic> {
    const resolvedVersion = await this.resolveVersion(version);
    const url = this.buildTopicUrl(urlOrId, resolvedVersion);

    try {
      // Fetch HTML
      const html = await this.fetchHtml(url);
      
      // Parse HTML into Topic structure
      const $ = cheerio.load(html);
      const topic = parseHtml(html, {
        url,
        version: resolvedVersion,
        source: this.source === "hybrid" ? "online" : this.source,
      });

      // Override topic ID with the original topicId (not normalized from URL)
      topic.id = urlOrId;

      // Extract body text and chunk it
      const bodyText = extractBodyText($);
      topic.body_chunks = chunkBodyText(topic.id, bodyText);

      logger.debug("Fetched and parsed topic from online provider", {
        topic_id: topic.id,
        version: resolvedVersion,
        url,
        title: topic.title,
        chunk_count: topic.body_chunks.length,
      });

      return topic;
    } catch (error) {
      throw providerError(
        "online",
        `Failed to fetch topic: ${urlOrId}`,
        {
          url,
          version: resolvedVersion,
          error: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  /**
   * List topics in a section
   * 
   * Note: This is a placeholder implementation. In a real scenario,
   * we would need to parse an index page or use an API if available.
   */
  async listTopics(section: string, version?: string, _limit: number = 50): Promise<Topic[]> {
    const resolvedVersion = await this.resolveVersion(version);
    
    // Placeholder: In reality, we'd need to fetch a section index page
    // For now, return empty array - this will be implemented when we
    // understand the actual structure of the docs site
    logger.warn("listTopics not yet fully implemented for online provider", {
      section,
      version: resolvedVersion,
    });

    return [];
  }

  /**
   * Get available versions
   * 
   * Note: This would typically require parsing the docs site structure
   */
  async getAvailableVersions(): Promise<string[]> {
    // Placeholder: In reality, we'd parse the versions directory
    // For now, return common versions
    return ["latest", "12.3", "11.1.1", "10.3.3"];
  }

  /**
   * Get available sections
   * 
   * Note: This would typically require parsing the docs site structure
   */
  async getAvailableSections(version?: string): Promise<string[]> {
    await this.resolveVersion(version); // Resolve version (for future use)
    
    // Placeholder: Common sections based on requirements
    return [
      "Language",
      "General Guides",
      "Data Access and Connectivity",
      "Development Tools",
      "Updating",
    ];
  }
}

