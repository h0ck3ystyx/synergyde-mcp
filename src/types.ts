/**
 * Core type definitions for the Synergy/DE MCP server
 */

/**
 * Source of documentation content
 */
export type DocSource = "online" | "local" | "hybrid";

/**
 * Link type for topic navigation
 */
export type LinkType = "prev" | "next" | "parent" | "related";

/**
 * Navigation link to another topic
 */
export interface TopicLink {
  type: LinkType;
  target_topic_id: string;
  title?: string;
  url?: string;
}

/**
 * A chunk of topic content, optimized for LLM consumption
 */
export interface TopicChunk {
  topic_id: string;
  chunk_index: number;
  text: string;
  /** Approximate token count for this chunk */
  token_count?: number;
}

/**
 * A documentation topic with metadata and chunked content
 */
export interface Topic {
  id: string;
  version: string;
  title: string;
  section: string;
  path: string[];
  summary: string;
  body_chunks: TopicChunk[];
  links: TopicLink[];
  url: string;
  /** Source of the content (online, local, or hybrid) */
  source: DocSource;
}

/**
 * Search result for a topic
 */
export interface SearchResult {
  topic_id: string;
  title: string;
  section: string;
  version: string;
  url: string;
  summary: string;
  source: DocSource;
  /** Relevance score (higher is more relevant) */
  score?: number;
}

/**
 * Standardized error payload
 */
export interface ErrorPayload {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  retryable?: boolean;
}

/**
 * Related topics information
 */
export interface RelatedTopics {
  parent?: {
    topic_id: string;
    title: string;
    url: string;
  };
  previous?: {
    topic_id: string;
    title: string;
    url: string;
  };
  next?: {
    topic_id: string;
    title: string;
    url: string;
  };
  related: Array<{
    topic_id: string;
    title: string;
    url: string;
  }>;
}

/**
 * Documentation metadata
 */
export interface DocMetadata {
  versions: string[];
  sections: string[];
  source: DocSource;
}

/**
 * Abstract interface for documentation providers
 */
export interface DocProvider {
  /**
   * Fetch a single topic by URL or topic ID
   */
  fetchTopic(urlOrId: string, version?: string): Promise<Topic>;

  /**
   * List topics in a specific section
   */
  listTopics(section: string, version?: string, limit?: number): Promise<Topic[]>;

  /**
   * Get available documentation versions
   */
  getAvailableVersions(): Promise<string[]>;

  /**
   * Get available sections for a version
   */
  getAvailableSections(version?: string): Promise<string[]>;

  /**
   * Get the source type of this provider
   */
  getSource(): DocSource;
}

/**
 * Configuration object for the MCP server
 */
export interface ServerConfig {
  docBaseUrl: string;
  defaultVersion: string;
  localDocPath?: string;
  cacheDir: string;
  logLevel: "debug" | "info" | "warn" | "error";
}

