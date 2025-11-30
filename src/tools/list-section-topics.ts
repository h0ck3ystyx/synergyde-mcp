/**
 * MCP Tool: list_section_topics
 * List all topics in a documentation section
 */

import type { ErrorPayload } from "../types.js";
import { getConfig } from "../config.js";
import type { DocProvider } from "../types.js";
import { sectionNotFoundError, invalidInputError, internalError, providerError } from "../lib/utils/errors.js";
import { logger } from "../lib/utils/logger.js";

interface ListSectionTopicsInput {
  section: string;
  version?: string;
  limit?: number;
}

/**
 * List topics in a documentation section
 * 
 * @param args - Section parameters
 * @param provider - The documentation provider
 * @returns Array of topic summaries or error payload
 */
export async function listSectionTopics(
  args: ListSectionTopicsInput,
  provider: DocProvider
): Promise<Array<{ topic_id: string; title: string; url: string; summary: string }> | ErrorPayload> {
  try {
    // Validate input
    if (!args.section || typeof args.section !== "string") {
      return invalidInputError("section", args.section, "must be a non-empty string");
    }

    // Get default version from config if not provided
    const version = args.version || getConfig().defaultVersion;
    const limit = args.limit ?? 50;

    // Validate limit
    if (limit < 0) {
      return invalidInputError("limit", limit, "must be non-negative");
    }

    logger.logToolInvocation("list_section_topics", { section: args.section, version, limit });

    try {
      // Query provider for topics in section
      const topics = await provider.listTopics(args.section, version, limit);

      // Transform to summary format
      const results = topics.map((topic) => ({
        topic_id: topic.id,
        title: topic.title,
        url: topic.url,
        summary: topic.summary,
      }));

      return results;
    } catch (error) {
      // Try to get available sections for better error message
      let availableSections: string[] | undefined;
      try {
        availableSections = await provider.getAvailableSections(version);
      } catch {
        // Ignore error getting sections
      }

      // Check if it's a provider error
      if (error instanceof Error) {
        return providerError(
          provider.getSource(),
          error.message,
          {
            section: args.section,
            version,
            available_sections: availableSections,
          }
        );
      }

      return sectionNotFoundError(args.section, version, availableSections);
    }
  } catch (error) {
    logger.error("Error in list_section_topics", {
      error: error instanceof Error ? error.message : String(error),
      args,
    });
    return internalError(
      "Failed to list section topics",
      {
        section: args.section,
        version: args.version,
        error: error instanceof Error ? error.message : String(error),
      }
    );
  }
}

