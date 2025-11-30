/**
 * MCP Tool: search_docs
 * Search documentation topics using the search index
 */

import type { ErrorPayload, SearchResult } from "../types.js";
import { getConfig } from "../config.js";
import { SearchIndex } from "../lib/search/index.js";
import { invalidInputError, internalError } from "../lib/utils/errors.js";
import { logger } from "../lib/utils/logger.js";

interface SearchDocsInput {
  query: string;
  version?: string;
  section?: string;
  limit?: number;
}

/**
 * Search documentation topics
 * 
 * @param args - Search parameters
 * @param searchIndex - The search index instance
 * @returns Search results or error payload
 */
export async function searchDocs(
  args: SearchDocsInput,
  searchIndex: SearchIndex
): Promise<SearchResult[] | ErrorPayload> {
  try {
    // Validate required input
    if (!args.query || typeof args.query !== "string") {
      return invalidInputError("query", args.query, "must be a non-empty string");
    }

    // Get default version from config if not provided
    const version = args.version || getConfig().defaultVersion;
    const limit = args.limit ?? 10;

    // Validate limit
    if (limit < 0) {
      return invalidInputError("limit", limit, "must be non-negative");
    }

    logger.logToolInvocation("search_docs", args);

    // Perform search
    const results = searchIndex.search(args.query, version, args.section, limit);

    return results;
  } catch (error) {
    logger.error("Error in search_docs", {
      error: error instanceof Error ? error.message : String(error),
      args,
    });
    return internalError(
      "Failed to search documentation",
      {
        query: args.query,
        version: args.version,
        section: args.section,
        error: error instanceof Error ? error.message : String(error),
      }
    );
  }
}

