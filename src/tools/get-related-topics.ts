/**
 * MCP Tool: get_related_topics
 * Get related topics from a topic's navigation links
 */

import type { ErrorPayload, RelatedTopics } from "../types.js";
import type { DocProvider } from "../types.js";
import { CacheManager } from "../lib/cache/cache-manager.js";
import { getTopic } from "./get-topic.js";
import { invalidInputError, internalError } from "../lib/utils/errors.js";
import { logger } from "../lib/utils/logger.js";

interface GetRelatedTopicsInput {
  topic_id: string;
  version?: string;
}

/**
 * Get related topics for a given topic
 * 
 * @param args - Topic parameters
 * @param provider - The documentation provider
 * @param cache - The cache manager instance
 * @returns Related topics or error payload
 */
export async function getRelatedTopics(
  args: GetRelatedTopicsInput,
  provider: DocProvider,
  cache: CacheManager
): Promise<RelatedTopics | ErrorPayload> {
  try {
    // Validate input
    if (!args.topic_id || typeof args.topic_id !== "string") {
      return invalidInputError("topic_id", args.topic_id, "must be a non-empty string");
    }

    logger.logToolInvocation("get_related_topics", args);

    // Fetch the topic (this will use cache if available)
    const topicResult = await getTopic(
      { topic_id: args.topic_id, version: args.version },
      provider,
      cache
    );

    // Check if getTopic returned an error
    if ("code" in topicResult) {
      return topicResult;
    }

    const topic = topicResult;

    // Extract links and organize them
    const related: RelatedTopics = {
      related: [],
    };

    let linksInspected = 0;
    for (const link of topic.links) {
      linksInspected++;
      
      switch (link.type) {
        case "parent":
          related.parent = {
            topic_id: link.target_topic_id,
            title: link.title || link.target_topic_id,
            url: link.url || link.target_topic_id,
          };
          break;
        case "prev":
          related.previous = {
            topic_id: link.target_topic_id,
            title: link.title || link.target_topic_id,
            url: link.url || link.target_topic_id,
          };
          break;
        case "next":
          related.next = {
            topic_id: link.target_topic_id,
            title: link.title || link.target_topic_id,
            url: link.url || link.target_topic_id,
          };
          break;
        case "related":
          related.related.push({
            topic_id: link.target_topic_id,
            title: link.title || link.target_topic_id,
            url: link.url || link.target_topic_id,
          });
          break;
      }
    }

    return related;
  } catch (error) {
    logger.error("Error in get_related_topics", {
      error: error instanceof Error ? error.message : String(error),
      args,
    });
    return internalError(
      "Failed to get related topics",
      {
        topic_id: args.topic_id,
        version: args.version,
        error: error instanceof Error ? error.message : String(error),
      }
    );
  }
}

