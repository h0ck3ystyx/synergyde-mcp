/**
 * MCP Resource: Topic Resource
 * Handles synergyde:topic/{topic_id} and synergyde:topic/{version}/{topic_id} URIs
 */

import type { ErrorPayload, Topic } from "../types.js";
import { getTopic } from "../tools/get-topic.js";
import type { DocProvider } from "../types.js";
import { CacheManager } from "../lib/cache/cache-manager.js";
import { limitChunks } from "../lib/parser/chunker.js";
import { logger } from "../lib/utils/logger.js";

/**
 * Estimate token count for text (rough approximation: ~4 characters per token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Format topic as plain text resource content
 * 
 * @param topic - The topic to format
 * @param maxTokens - Maximum token budget (default ~8k)
 * @returns Plain text content with metadata
 */
function formatTopicAsText(topic: Topic, maxTokens: number = 8000): string {
  const lines: string[] = [];

  // Add metadata header
  lines.push(`# ${topic.title}`);
  lines.push("");
  if (topic.section) {
    lines.push(`Section: ${topic.section}`);
  }
  if (topic.version) {
    lines.push(`Version: ${topic.version}`);
  }
  if (topic.url) {
    lines.push(`URL: ${topic.url}`);
  }
  if (topic.path && topic.path.length > 0) {
    lines.push(`Path: ${topic.path.join(" > ")}`);
  }
  lines.push(`Source: ${topic.source}`);
  lines.push("");

  // Add summary
  if (topic.summary) {
    lines.push("## Summary");
    lines.push("");
    lines.push(topic.summary);
    lines.push("");
  }

  // Add body content (respecting token budget)
  let remainingTokens = maxTokens - estimateTokens(lines.join("\n"));
  
  if (topic.body_chunks && topic.body_chunks.length > 0) {
    // Limit chunks to fit within token budget
    const limitedChunks = limitChunks(topic.body_chunks, remainingTokens);
    
    for (const chunk of limitedChunks) {
      const chunkText = chunk.text;
      const chunkTokens = estimateTokens(chunkText);
      
      if (remainingTokens - chunkTokens < 0) {
        // Would exceed budget, truncate this chunk
        const availableChars = remainingTokens * 4;
        if (availableChars > 0) {
          lines.push(chunkText.substring(0, availableChars));
          lines.push("\n[... content truncated due to token limit ...]");
        }
        break;
      }
      
      lines.push(chunkText);
      lines.push("");
      remainingTokens -= chunkTokens;
    }

    // Add truncation notice if content was limited
    if (limitedChunks.length < topic.body_chunks.length) {
      lines.push("");
      lines.push(`[Note: Content truncated. Showing ${limitedChunks.length} of ${topic.body_chunks.length} chunks.]`);
    }
  }

  return lines.join("\n");
}

/**
 * Handle topic resource request
 * 
 * @param uri - Resource URI (e.g., "synergyde:topic/topic_id" or "synergyde:topic/v111/topic_id")
 * @param provider - The documentation provider
 * @param cache - The cache manager instance
 * @returns Resource content as plain text or error payload
 */
export async function handleTopicResource(
  uri: string,
  provider: DocProvider,
  cache: CacheManager
): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> } | ErrorPayload> {
  try {
    logger.debug("Handling topic resource", { uri });

    // Parse URI: synergyde:topic/{version}/{topic_id} or synergyde:topic/{topic_id}
    // Use double slash to explicitly separate version from topic_id, or check if first segment looks like a version
    let version: string | undefined;
    let topicId: string;

    // Check for double slash separator (explicit no version)
    if (uri.includes("//")) {
      const parts = uri.split("//");
      if (parts.length === 2 && parts[0].startsWith("synergyde:topic/")) {
        topicId = decodeURIComponent(parts[1]);
        version = undefined;
      } else {
        return {
          code: "INVALID_INPUT",
          message: `Invalid topic resource URI: ${uri}`,
          details: {
            uri,
            expected_format: "synergyde:topic/{topic_id} or synergyde:topic/{version}/{topic_id} or synergyde:topic//{topic_id}",
          },
        };
      }
    } else {
      // Parse: synergyde:topic/{first_segment}/{rest...}
      const uriMatch = uri.match(/^synergyde:topic\/(.+)$/);
      if (!uriMatch) {
        return {
          code: "INVALID_INPUT",
          message: `Invalid topic resource URI: ${uri}`,
          details: {
            uri,
            expected_format: "synergyde:topic/{topic_id} or synergyde:topic/{version}/{topic_id}",
          },
        };
      }

      const path = uriMatch[1];
      const segments = path.split("/");
      
      if (segments.length === 1) {
        // Single segment: treat as topic_id
        topicId = decodeURIComponent(segments[0]);
        version = undefined;
      } else {
        // Multiple segments: check if first segment looks like a version
        const firstSegment = segments[0];
        const looksLikeVersion = /^(v\d+|latest)$/i.test(firstSegment);
        
        if (looksLikeVersion) {
          // First segment is a version
          version = decodeURIComponent(firstSegment);
          topicId = decodeURIComponent(segments.slice(1).join("/"));
        } else {
          // First segment is part of topic_id (hierarchical path)
          topicId = decodeURIComponent(path);
          version = undefined;
        }
      }
    }

    // Fetch topic (request all chunks, we'll limit by token budget in formatter)
    const topicResult = await getTopic(
      {
        topic_id: topicId,
        version,
        max_chunks: 0, // 0 means no limit - get all chunks for resource
      },
      provider,
      cache
    );

    // Check if getTopic returned an error
    if ("code" in topicResult) {
      return topicResult;
    }

    const topic = topicResult;

    // Format as plain text
    const text = formatTopicAsText(topic);

    return {
      contents: [
        {
          uri,
          mimeType: "text/plain",
          text,
        },
      ],
    };
  } catch (error) {
    logger.error("Error handling topic resource", {
      error: error instanceof Error ? error.message : String(error),
      uri,
    });
    return {
      code: "INTERNAL_ERROR",
      message: `Failed to handle topic resource: ${uri}`,
      details: {
        uri,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

