/**
 * MCP Tool: get_topic
 * Fetch a documentation topic with caching support
 */

import type { ErrorPayload, Topic } from "../types.js";
import { getConfig } from "../config.js";
import { CacheManager } from "../lib/cache/cache-manager.js";
import type { DocProvider } from "../types.js";
import { topicNotFoundError, invalidInputError, internalError, networkError } from "../lib/utils/errors.js";
import { logger } from "../lib/utils/logger.js";
import { normalizeUrlToTopicId } from "../lib/parser/index.js";

interface GetTopicInput {
  topic_id?: string;
  url?: string;
  version?: string;
  max_chunks?: number;
}

/**
 * Get a documentation topic
 * 
 * @param args - Topic lookup parameters
 * @param provider - The documentation provider
 * @param cache - The cache manager instance
 * @returns Topic or error payload
 */
export async function getTopic(
  args: GetTopicInput,
  provider: DocProvider,
  cache: CacheManager
): Promise<Topic | ErrorPayload> {
  try {
    // Validate input - must have either topic_id or url
    if (!args.topic_id && !args.url) {
      return invalidInputError("topic_id or url", undefined, "at least one must be provided");
    }

    // Get default version from config if not provided
    const version = args.version || getConfig().defaultVersion;
    const maxChunks = args.max_chunks ?? 3;

    // Validate max_chunks
    if (maxChunks < 0) {
      return invalidInputError("max_chunks", maxChunks, "must be non-negative");
    }

    // Determine lookup key and provider input
    // For URLs: use original URL for provider, normalized ID for cache/search
    // For topic_id: use as-is for both
    let providerInput: string;
    let cacheKey: string;
    
    if (args.url) {
      // Keep original URL for provider fetch
      providerInput = args.url;
      // Normalize URL to topic ID for cache key
      cacheKey = normalizeUrlToTopicId(args.url, args.url);
    } else {
      providerInput = args.topic_id!;
      cacheKey = args.topic_id!;
    }

    logger.logToolInvocation("get_topic", { 
      topic_id: cacheKey, 
      url: args.url,
      version, 
      max_chunks: maxChunks 
    });

    // Check cache first (using normalized cache key)
    let topic: Topic | null = null;
    try {
      topic = await cache.get(cacheKey, version);
      if (topic) {
        logger.debug("Topic found in cache", { topic_id: cacheKey, version });
      }
    } catch (error) {
      logger.warn("Cache read error (continuing to provider)", {
        topic_id: cacheKey,
        version,
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue to provider on cache error
    }

    // Fetch from provider if not cached (using original URL or topic_id)
    if (!topic) {
      try {
        topic = await provider.fetchTopic(providerInput, version);
        
        // Cache the result (using normalized cache key)
        try {
          await cache.set(cacheKey, version, topic);
        } catch (error) {
          logger.warn("Cache write error (topic still returned)", {
            topic_id: cacheKey,
            version,
            error: error instanceof Error ? error.message : String(error),
          });
          // Continue even if caching fails
        }
      } catch (error) {
        // Check if error is an ErrorPayload (structured error from provider)
        if (error && typeof error === "object" && "code" in error) {
          // Pass through structured errors from provider
          return error as ErrorPayload;
        }
        
        // Check if it's a network error (Error with "fetch" in message)
        if (error instanceof Error && error.message.includes("fetch")) {
          return networkError(
            providerInput,
            error.message,
            true // Network errors are retryable
          );
        }
        
        // Unknown error - treat as topic not found
        return topicNotFoundError(cacheKey, version, {
          lookup_method: "provider",
          provider_source: provider.getSource(),
          original_input: providerInput,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Limit chunks if requested (use slice for chunk count, not token budget)
    if (maxChunks > 0 && topic.body_chunks.length > maxChunks) {
      topic = {
        ...topic,
        body_chunks: topic.body_chunks.slice(0, maxChunks),
      };
    }

    return topic;
  } catch (error) {
    logger.error("Error in get_topic", {
      error: error instanceof Error ? error.message : String(error),
      args,
    });
    return internalError(
      "Failed to get topic",
      {
        topic_id: args.topic_id,
        url: args.url,
        version: args.version,
        error: error instanceof Error ? error.message : String(error),
      }
    );
  }
}

