/**
 * Main MCP server entry point
 * 
 * Implements Phase 8: MCP Server Integration
 */

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod";
import { initializeConfig } from "./config.js";
import { createProvider } from "./lib/providers/index.js";
import { CacheManager } from "./lib/cache/index.js";
import { SearchIndex } from "./lib/search/index.js";
import { logger } from "./lib/utils/logger.js";
import type { ErrorPayload } from "./types.js";

// Tool handlers
import { searchDocs } from "./tools/search-docs.js";
import { getTopic } from "./tools/get-topic.js";
import { getRelatedTopics } from "./tools/get-related-topics.js";
import { listSectionTopics } from "./tools/list-section-topics.js";
import { describeDocs } from "./tools/describe-docs.js";

// Resource handlers
import { handleTopicResource } from "./resources/topic-resource.js";
import { handleSectionResource } from "./resources/section-resource.js";

/**
 * Convert ErrorPayload to throwable error for MCP
 */
function throwMcpError(error: ErrorPayload): never {
  // Map error codes to MCP error codes
  const codeMap: Record<string, number> = {
    INVALID_INPUT: -32602, // Invalid params
    TOPIC_NOT_FOUND: -32602, // Invalid params (topic not found)
    SECTION_NOT_FOUND: -32602, // Invalid params (section not found)
    NETWORK_ERROR: -32000, // Server error
    CACHE_ERROR: -32000, // Server error
    PROVIDER_ERROR: -32000, // Server error
    INTERNAL_ERROR: -32603, // Internal error
  };

  const mcpError: any = new Error(error.message);
  mcpError.code = codeMap[error.code] || -32603;
  mcpError.data = error.details;
  throw mcpError;
}

/**
 * Initialize and start the MCP server
 */
async function main(): Promise<void> {
  let server: McpServer | null = null;
  let cache: CacheManager | null = null;

  try {
    // Initialize configuration
    const config = await initializeConfig();
    logger.info("Synergy/DE MCP Server starting...", {
      version: "0.1.0",
      defaultVersion: config.defaultVersion,
      source: config.localDocPath ? "hybrid" : "online",
    });

    // Initialize provider
    const provider = createProvider();
    if (!provider) {
      throw new Error("Failed to create provider");
    }
    logger.info("Provider initialized", {
      source: provider.getSource(),
    });

    // Initialize cache manager
    cache = new CacheManager();
    await cache.initialize();
    logger.info("Cache manager initialized", {
      cacheDir: config.cacheDir,
    });

    // Initialize search index (lazy - will be populated as topics are fetched)
    const searchIndex = new SearchIndex();
    logger.info("Search index initialized (lazy population)");

    // Create MCP server
    server = new McpServer(
      {
        name: "synergyde-docs",
        version: "0.1.0",
      }
    );

    // Register search_docs tool
    server.registerTool(
      "search_docs",
      {
        title: "Search Documentation",
        description: "Search documentation topics using full-text search. Returns a list of matching topics with relevance scores.",
        inputSchema: {
          query: z.string().describe("Search query string"),
          version: z.string().optional().describe("Documentation version (e.g., 'v111', 'latest'). Defaults to configured default version."),
          section: z.string().optional().describe("Optional section filter (e.g., 'Language', 'Reference')"),
          limit: z.number().int().min(0).optional().describe("Maximum number of results to return (default: 10)"),
        },
      },
      async ({ query, version, section, limit }) => {
        const result = await searchDocs(
          { query, version, section, limit },
          searchIndex
        );

        // Check if result is an ErrorPayload
        if (result && typeof result === "object" && "code" in result) {
          throwMcpError(result as ErrorPayload);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }
    );

    // Register get_topic tool
    server.registerTool(
      "get_topic",
      {
        title: "Get Documentation Topic",
        description: "Fetch a documentation topic by ID or URL. Returns the topic with chunked content optimized for LLM consumption.",
        inputSchema: {
          topic_id: z.string().optional().describe("Topic ID (e.g., 'Language/topic.htm')"),
          url: z.string().optional().describe("Full URL to the topic page"),
          version: z.string().optional().describe("Documentation version (e.g., 'v111', 'latest'). Defaults to configured default version."),
          max_chunks: z.number().int().min(0).optional().describe("Maximum number of chunks to return (default: 3, 0 = no limit)"),
        },
      },
      async ({ topic_id, url, version, max_chunks }) => {
        if (!cache) {
          throw new Error("Cache manager not initialized");
        }

        const result = await getTopic(
          { topic_id, url, version, max_chunks },
          provider,
          cache
        );

        // Check if result is an ErrorPayload
        if (result && typeof result === "object" && "code" in result) {
          throwMcpError(result as ErrorPayload);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }
    );

    // Register get_related_topics tool
    server.registerTool(
      "get_related_topics",
      {
        title: "Get Related Topics",
        description: "Get related topics for a given topic (previous, next, parent, and related links).",
        inputSchema: {
          topic_id: z.string().describe("Topic ID (e.g., 'Language/topic.htm')"),
          version: z.string().optional().describe("Documentation version (e.g., 'v111', 'latest'). Defaults to configured default version."),
        },
      },
      async ({ topic_id, version }) => {
        if (!cache) {
          throw new Error("Cache manager not initialized");
        }

        const result = await getRelatedTopics(
          { topic_id, version },
          provider,
          cache
        );

        // Check if result is an ErrorPayload
        if (result && typeof result === "object" && "code" in result) {
          throwMcpError(result as ErrorPayload);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }
    );

    // Register list_section_topics tool
    server.registerTool(
      "list_section_topics",
      {
        title: "List Section Topics",
        description: "List all topics in a documentation section. Returns topic summaries with IDs, titles, URLs, and summaries.",
        inputSchema: {
          section: z.string().describe("Section name (e.g., 'Language', 'Reference')"),
          version: z.string().optional().describe("Documentation version (e.g., 'v111', 'latest'). Defaults to configured default version."),
          limit: z.number().int().min(0).optional().describe("Maximum number of topics to return (default: 50)"),
        },
      },
      async ({ section, version, limit }) => {
        const result = await listSectionTopics(
          { section, version, limit },
          provider
        );

        // Check if result is an ErrorPayload
        if (result && typeof result === "object" && "code" in result) {
          throwMcpError(result as ErrorPayload);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }
    );

    // Register describe_docs tool
    server.registerTool(
      "describe_docs",
      {
        title: "Describe Documentation",
        description: "Get metadata about available documentation (versions, sections, source type).",
        inputSchema: {},
      },
      async () => {
        const result = await describeDocs(provider);

        // Check if result is an ErrorPayload
        if (result && typeof result === "object" && "code" in result) {
          throwMcpError(result as ErrorPayload);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }
    );

    // Register topic resource
    server.registerResource(
      "topic",
      new ResourceTemplate("synergyde:topic/{path}", { list: undefined }),
      {
        title: "Documentation Topic",
        description: "A documentation topic with full content",
        mimeType: "text/plain",
      },
      async (_uri, { path }) => {
        if (!cache) {
          throw new Error("Cache manager not initialized");
        }

        // Reconstruct the full URI for the handler
        const fullUri = `synergyde:topic/${path}`;
        const result = await handleTopicResource(fullUri, provider, cache);

        // Check if result is an ErrorPayload
        if (result && "code" in result) {
          throwMcpError(result as ErrorPayload);
        }

        return result;
      }
    );

    // Register section resource
    server.registerResource(
      "section",
      new ResourceTemplate("synergyde:section/{version}/{section}", { list: undefined }),
      {
        title: "Documentation Section",
        description: "A documentation section index with topic listings",
        mimeType: "text/plain",
      },
      async (_uri, { version, section }) => {
        // Reconstruct the full URI for the handler
        const fullUri = `synergyde:section/${version}/${section}`;
        const result = await handleSectionResource(fullUri, provider);

        // Check if result is an ErrorPayload
        if (result && "code" in result) {
          throwMcpError(result as ErrorPayload);
        }

        return result;
      }
    );

    // Set up graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      
      if (server) {
        try {
          // Server cleanup is handled automatically by the SDK
          await server.close();
        } catch (error) {
          logger.error("Error closing server", { error });
        }
      }

      // Cache cleanup is handled automatically (no persistent state to save)
      // Search index is in-memory only, no cleanup needed

      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

    // Connect to stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.info("MCP server started and connected to stdio transport");
  } catch (error) {
    logger.error("Failed to start server", { error });
    process.exit(1);
  }
}

// Start the server
main().catch((error) => {
  logger.error("Unhandled error in main", { error });
  process.exit(1);
});
