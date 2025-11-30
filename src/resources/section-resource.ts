/**
 * MCP Resource: Section Resource
 * Handles synergyde:section/{version}/{section} URIs
 */

import type { ErrorPayload } from "../types.js";
import { listSectionTopics } from "../tools/list-section-topics.js";
import type { DocProvider } from "../types.js";
import { logger } from "../lib/utils/logger.js";

/**
 * Estimate token count for text (rough approximation: ~4 characters per token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Format section topics as plain text index
 * 
 * @param topics - Array of topic summaries
 * @param section - Section name
 * @param version - Version string
 * @param maxTokens - Maximum token budget (default ~8k)
 * @returns Plain text index content
 */
function formatSectionAsText(
  topics: Array<{ topic_id: string; title: string; url: string; summary: string }>,
  section: string,
  version: string,
  maxTokens: number = 8000
): string {
  const lines: string[] = [];

  // Add header
  lines.push(`# Section: ${section}`);
  lines.push(`Version: ${version}`);
  lines.push(`Total Topics: ${topics.length}`);
  lines.push("");

  // Add topic index
  let remainingTokens = maxTokens - estimateTokens(lines.join("\n"));
  
  for (let i = 0; i < topics.length; i++) {
    const topic = topics[i];
    const topicEntry = [
      `## ${i + 1}. ${topic.title}`,
      `ID: ${topic.topic_id}`,
      `URL: ${topic.url}`,
      topic.summary ? `Summary: ${topic.summary}` : "",
      "",
    ].filter(Boolean).join("\n");

    const entryTokens = estimateTokens(topicEntry);
    
    if (remainingTokens - entryTokens < 0) {
      // Would exceed budget
      lines.push("");
      lines.push(`[Note: Index truncated. Showing ${i} of ${topics.length} topics.]`);
      break;
    }

    lines.push(topicEntry);
    remainingTokens -= entryTokens;
  }

  return lines.join("\n");
}

/**
 * Handle section resource request
 * 
 * @param uri - Resource URI (e.g., "synergyde:section/v111/Language")
 * @param provider - The documentation provider
 * @returns Resource content as plain text or error payload
 */
export async function handleSectionResource(
  uri: string,
  provider: DocProvider
): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> } | ErrorPayload> {
  try {
    logger.debug("Handling section resource", { uri });

    // Parse URI: synergyde:section/{version}/{section}
    const uriMatch = uri.match(/^synergyde:section\/([^\/]+)\/(.+)$/);
    if (!uriMatch) {
      return {
        code: "INVALID_INPUT",
        message: `Invalid section resource URI: ${uri}`,
        details: {
          uri,
          expected_format: "synergyde:section/{version}/{section}",
        },
      };
    }

    // Decode URI components to handle percent-encoded section names
    const version = decodeURIComponent(uriMatch[1]);
    const section = decodeURIComponent(uriMatch[2]);

    // List topics in section
    const topicsResult = await listSectionTopics(
      {
        section,
        version,
        limit: 100, // Get more topics for resource (will be truncated by token budget)
      },
      provider
    );

    // Check if listSectionTopics returned an error
    if ("code" in topicsResult) {
      return topicsResult;
    }

    const topics = topicsResult;

    // Format as plain text
    const text = formatSectionAsText(topics, section, version);

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
    logger.error("Error handling section resource", {
      error: error instanceof Error ? error.message : String(error),
      uri,
    });
    return {
      code: "INTERNAL_ERROR",
      message: `Failed to handle section resource: ${uri}`,
      details: {
        uri,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

