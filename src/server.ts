/**
 * Main MCP server entry point
 * 
 * This is a stub implementation. The full server will be implemented in Phase 8.
 */

import { initializeConfig } from "./config.js";
import { logger } from "./lib/utils/logger.js";

/**
 * Initialize and start the MCP server
 */
async function main(): Promise<void> {
  try {
    const config = await initializeConfig();
    logger.info("Synergy/DE MCP Server starting...", {
      version: "0.1.0",
      defaultVersion: config.defaultVersion,
      source: config.localDocPath ? "hybrid" : "online",
    });

    // TODO: Initialize MCP server with stdio transport (Phase 8)
    // TODO: Register tools and resources (Phase 8)
    // TODO: Start server (Phase 8)

    logger.warn("Server stub: Full implementation pending Phase 8");
    logger.info("Configuration loaded successfully", {
      docBaseUrl: config.docBaseUrl,
      cacheDir: config.cacheDir,
      logLevel: config.logLevel,
    });

    // Keep process alive for now (will be replaced with actual server in Phase 8)
    process.stdin.resume();
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

