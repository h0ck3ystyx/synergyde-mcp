/**
 * MCP Tool: describe_docs
 * Get metadata about available documentation (versions, sections, source)
 */

import type { ErrorPayload, DocMetadata } from "../types.js";
import type { DocProvider } from "../types.js";
import { internalError, providerError } from "../lib/utils/errors.js";
import { logger } from "../lib/utils/logger.js";

/**
 * Describe available documentation
 * 
 * @param provider - The documentation provider
 * @returns Documentation metadata or error payload
 */
export async function describeDocs(
  provider: DocProvider
): Promise<DocMetadata | ErrorPayload> {
  try {
    logger.logToolInvocation("describe_docs", {});

    let versions: string[] = [];
    let sections: string[] = [];
    let lastError: Error | null = null;

    // Get available versions
    try {
      versions = await provider.getAvailableVersions();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.warn("Failed to get available versions", {
        error: lastError.message,
        provider: provider.getSource(),
      });
      // Continue to try getting sections
    }

    // Get available sections (use default version if available)
    try {
      const defaultVersion = versions.length > 0 ? versions[0] : undefined;
      sections = await provider.getAvailableSections(defaultVersion);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.warn("Failed to get available sections", {
        error: lastError.message,
        provider: provider.getSource(),
        version: versions.length > 0 ? versions[0] : undefined,
      });
    }

    // If both calls failed, return an error
    if (versions.length === 0 && sections.length === 0 && lastError) {
      return providerError(
        provider.getSource(),
        lastError.message,
        {
          failed_operations: ["getAvailableVersions", "getAvailableSections"],
          retryable: true,
        }
      );
    }

    // Return metadata (even if some calls failed, return what we have)
    return {
      versions,
      sections,
      source: provider.getSource(),
    };
  } catch (error) {
    logger.error("Error in describe_docs", {
      error: error instanceof Error ? error.message : String(error),
    });
    return internalError(
      "Failed to describe documentation",
      {
        error: error instanceof Error ? error.message : String(error),
        provider: provider.getSource(),
      }
    );
  }
}

