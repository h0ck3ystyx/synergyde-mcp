/**
 * Disk-based cache manager for storing parsed Topic objects
 */

import { mkdir, readFile, writeFile, access, constants } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { Topic } from "../../types.js";
import { getConfig } from "../../config.js";
import { logger } from "../utils/logger.js";

/**
 * Cache manager for storing and retrieving Topic objects on disk
 */
export class CacheManager {
  private cacheDir: string | null = null;
  private initialized = false;

  /**
   * Initialize the cache manager and create cache directory if needed
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const config = getConfig();
    this.cacheDir = resolve(config.cacheDir);

    // Create cache directory if it doesn't exist
    try {
      await access(this.cacheDir, constants.F_OK);
    } catch {
      // Directory doesn't exist, create it
      await mkdir(this.cacheDir, { recursive: true });
      logger.debug(`Created cache directory: ${this.cacheDir}`);
    }

    this.initialized = true;
  }

  /**
   * Get a topic from the cache
   * @param topicId - The topic ID
   * @param version - The documentation version
   * @returns The cached topic or null if not found
   */
  async get(topicId: string, version: string): Promise<Topic | null> {
    this.ensureInitialized();

    // Sanitize version to prevent directory traversal
    const sanitizedVersion = this.sanitizeVersion(version);
    const filePath = this.getCacheFilePath(topicId, sanitizedVersion);

    try {
      // Check if file exists (async)
      try {
        await access(filePath, constants.F_OK);
      } catch {
        // File doesn't exist
        logger.logCacheOperation("miss", this.getCacheKey(topicId, sanitizedVersion), {
          topicId,
          version: sanitizedVersion,
        });
        return null;
      }

      const content = await readFile(filePath, "utf-8");
      const topic = JSON.parse(content) as Topic;

      logger.logCacheOperation("hit", this.getCacheKey(topicId, sanitizedVersion), {
        topicId,
        version: sanitizedVersion,
      });

      return topic;
    } catch (error) {
      // Handle corrupted files or read errors
      logger.error("Cache read error", {
        topicId,
        version: sanitizedVersion,
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Store a topic in the cache
   * @param topicId - The topic ID
   * @param version - The documentation version
   * @param topic - The topic to cache
   */
  async set(topicId: string, version: string, topic: Topic): Promise<void> {
    this.ensureInitialized();

    // Sanitize version to prevent directory traversal
    const sanitizedVersion = this.sanitizeVersion(version);
    const filePath = this.getCacheFilePath(topicId, sanitizedVersion);
    const versionDir = join(this.cacheDir!, sanitizedVersion);

    try {
      // Create version directory if it doesn't exist (async check)
      try {
        await access(versionDir, constants.F_OK);
      } catch {
        // Directory doesn't exist, create it
        await mkdir(versionDir, { recursive: true });
      }

      // Write topic as JSON
      const content = JSON.stringify(topic, null, 2);
      await writeFile(filePath, content, "utf-8");

      logger.logCacheOperation("set", this.getCacheKey(topicId, sanitizedVersion), {
        topicId,
        version: sanitizedVersion,
      });
    } catch (error) {
      logger.error("Cache write error", {
        topicId,
        version: sanitizedVersion,
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Check if a topic exists in the cache
   * @param topicId - The topic ID
   * @param version - The documentation version
   * @returns True if the topic is cached, false otherwise
   */
  async has(topicId: string, version: string): Promise<boolean> {
    this.ensureInitialized();

    // Sanitize version to prevent directory traversal
    const sanitizedVersion = this.sanitizeVersion(version);
    const filePath = this.getCacheFilePath(topicId, sanitizedVersion);

    try {
      await access(filePath, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the cache file path for a topic
   * @param topicId - The topic ID
   * @param version - The documentation version (should already be sanitized)
   * @returns The full file path
   */
  private getCacheFilePath(topicId: string, version: string): string {
    const sanitizedTopicId = this.sanitizeTopicId(topicId);
    return join(this.cacheDir!, version, `${sanitizedTopicId}.json`);
  }

  /**
   * Get the cache key for logging purposes
   * @param topicId - The topic ID
   * @param version - The documentation version
   * @returns The cache key string
   */
  private getCacheKey(topicId: string, version: string): string {
    return `${version}/${topicId}`;
  }

  /**
   * Sanitize version string for use in filesystem paths
   * Only allows alphanumeric characters, dots, underscores, and hyphens
   * Prevents directory traversal attacks
   * @param version - The version string to sanitize
   * @returns The sanitized version string
   */
  private sanitizeVersion(version: string): string {
    // Whitelist approach: only allow [A-Za-z0-9._-]
    // Replace any character not in the whitelist with underscore
    return version.replace(/[^A-Za-z0-9._-]/g, "_");
  }

  /**
   * Sanitize topic ID for use in filesystem paths
   * Replaces forward slashes and other problematic characters
   * @param topicId - The topic ID to sanitize
   * @returns The sanitized topic ID
   */
  private sanitizeTopicId(topicId: string): string {
    // Replace forward slashes with underscores
    // Also replace other filesystem-unsafe characters
    return topicId.replace(/[\/\\:*?"<>|]/g, "_");
  }

  /**
   * Ensure the cache manager is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.cacheDir) {
      throw new Error(
        "CacheManager not initialized. Call initialize() first."
      );
    }
  }
}

