/**
 * Factory for creating and managing documentation providers
 */

import { getConfig } from "../../config.js";
import { logger } from "../utils/logger.js";
import { LocalProvider } from "./local-provider.js";
import { OnlineProvider } from "./online-provider.js";
import type { DocProvider, DocSource } from "../../types.js";

/**
 * Hybrid provider that tries local first, then falls back to online
 */
class HybridProvider implements DocProvider {
  private readonly localProvider: LocalProvider | null;
  private readonly onlineProvider: OnlineProvider;
  private readonly source: DocSource = "hybrid";

  constructor(localProvider: LocalProvider | null, onlineProvider: OnlineProvider) {
    this.localProvider = localProvider;
    this.onlineProvider = onlineProvider;
  }

  getSource(): DocSource {
    return this.source;
  }

  /**
   * Fetch topic with Local → Online fallback
   */
  async fetchTopic(urlOrId: string, version?: string): Promise<import("../../types.js").Topic> {
    // Try local first if available
    if (this.localProvider) {
      try {
        const topic = await this.localProvider.fetchTopic(urlOrId, version);
        logger.debug("Topic served from local provider", {
          topic_id: urlOrId,
          provider: "local",
        });
        return topic;
      } catch (error) {
        logger.debug("Local provider failed, falling back to online", {
          topic_id: urlOrId,
          error: error instanceof Error ? error.message : String(error),
        });
        // Fall through to online provider
      }
    }

    // Fallback to online
    const topic = await this.onlineProvider.fetchTopic(urlOrId, version);
    logger.debug("Topic served from online provider", {
      topic_id: urlOrId,
      provider: "online",
    });
    return topic;
  }

  /**
   * List topics with Local → Online fallback
   */
  async listTopics(
    section: string,
    version?: string,
    limit?: number
  ): Promise<import("../../types.js").Topic[]> {
    // Try local first if available
    if (this.localProvider) {
      try {
        const topics = await this.localProvider.listTopics(section, version, limit);
        if (topics.length > 0) {
          logger.debug("Topics served from local provider", {
            section,
            count: topics.length,
            provider: "local",
          });
          return topics;
        }
      } catch (error) {
        logger.debug("Local provider failed, falling back to online", {
          section,
          error: error instanceof Error ? error.message : String(error),
        });
        // Fall through to online provider
      }
    }

    // Fallback to online
    const topics = await this.onlineProvider.listTopics(section, version, limit);
    logger.debug("Topics served from online provider", {
      section,
      count: topics.length,
      provider: "online",
    });
    return topics;
  }

  /**
   * Get available versions (merge from both providers)
   */
  async getAvailableVersions(): Promise<string[]> {
    const versions = new Set<string>();

    // Get local versions
    if (this.localProvider) {
      try {
        const localVersions = await this.localProvider.getAvailableVersions();
        localVersions.forEach((v) => versions.add(v));
      } catch {
        // Ignore errors
      }
    }

    // Get online versions
    try {
      const onlineVersions = await this.onlineProvider.getAvailableVersions();
      onlineVersions.forEach((v) => versions.add(v));
    } catch {
      // Ignore errors
    }

    return Array.from(versions).sort();
  }

  /**
   * Get available sections (try local first, fallback to online)
   */
  async getAvailableSections(version?: string): Promise<string[]> {
    // Try local first if available
    if (this.localProvider) {
      try {
        const sections = await this.localProvider.getAvailableSections(version);
        if (sections.length > 0) {
          return sections;
        }
      } catch {
        // Fall through to online
      }
    }

    // Fallback to online
    return await this.onlineProvider.getAvailableSections(version);
  }
}

/**
 * Create a documentation provider based on configuration
 * 
 * @returns A provider instance (LocalProvider, OnlineProvider, or HybridProvider)
 */
export function createProvider(): DocProvider {
  const config = getConfig();
  const onlineProvider = new OnlineProvider();

  // If local path is configured, create hybrid provider
  if (config.localDocPath) {
    try {
      const localProvider = new LocalProvider();
      logger.info("Created hybrid provider (local → online fallback)", {
        local_path: config.localDocPath,
      });
      return new HybridProvider(localProvider, onlineProvider);
    } catch (error) {
      logger.warn("Failed to create local provider, using online only", {
        error: error instanceof Error ? error.message : String(error),
      });
      return onlineProvider;
    }
  }

  // Otherwise, use online only
  logger.info("Created online provider", {
    base_url: config.docBaseUrl,
  });
  return onlineProvider;
}

/**
 * Provider precedence rules for documentation
 * 
 * When using hybrid mode:
 * 1. Local provider is tried first
 * 2. If local fails or returns empty, online provider is used
 * 3. Source field in Topic indicates which provider served the content
 */
export const PROVIDER_PRECEDENCE = {
  HYBRID: ["local", "online"] as const,
  LOCAL_ONLY: ["local"] as const,
  ONLINE_ONLY: ["online"] as const,
} as const;

