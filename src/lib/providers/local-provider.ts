/**
 * Local documentation provider that reads from the file system
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve, extname, basename } from "node:path";

import { getConfig } from "../../config.js";
import { providerError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { BaseDocProvider } from "./provider.js";
import type { DocSource, Topic } from "../../types.js";

/**
 * Local documentation provider
 * 
 * Reads documentation from the local file system.
 * Supports HTML files in directory structures.
 */
export class LocalProvider extends BaseDocProvider {
  protected readonly source: DocSource = "local";
  private readonly localPath: string;

  constructor(localPath?: string) {
    super();
    const config = getConfig();
    this.localPath = localPath ?? config.localDocPath ?? "";
    
    if (!this.localPath) {
      throw new Error("LocalProvider requires SYNERGYDE_LOCAL_DOC_PATH to be set");
    }
  }

  /**
   * Get the base path for a given version
   * If version is provided and a matching directory exists, use it
   * Otherwise, use the default localPath
   */
  private getVersionedPath(version?: string): string {
    if (!version || version === "local") {
      return this.localPath;
    }

    // Check if versioned directory exists
    const versionedPath = resolve(this.localPath, version);
    // Note: We don't check existence here to avoid async in sync method
    // The caller will handle file not found errors
    return versionedPath;
  }

  /**
   * Normalize a path or ID to a file path
   */
  private normalizePath(pathOrId: string, version?: string): string {
    const basePath = this.getVersionedPath(version);

    // If it's already an absolute path, use it
    if (pathOrId.startsWith("/")) {
      return pathOrId;
    }

    // If it's a relative path, resolve it relative to versioned base path
    return resolve(basePath, pathOrId);
  }

  /**
   * Check if a file exists and is readable
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const stats = await stat(filePath);
      return stats.isFile();
    } catch {
      return false;
    }
  }

  /**
   * Find HTML file by ID or path
   * Tries common extensions: .html, .htm
   */
  private async findHtmlFile(pathOrId: string, version?: string): Promise<string | null> {
    const basePath = this.normalizePath(pathOrId, version);
    
    // If it already has an extension, check it directly
    if (extname(basePath)) {
      if (await this.fileExists(basePath)) {
        return basePath;
      }
      return null;
    }

    // Try common HTML extensions
    const extensions = [".html", ".htm"];
    for (const ext of extensions) {
      const filePath = `${basePath}${ext}`;
      if (await this.fileExists(filePath)) {
        return filePath;
      }
    }

    return null;
  }

  /**
   * Read HTML file from disk
   */
  private async readHtmlFile(filePath: string): Promise<string> {
    try {
      const content = await readFile(filePath, "utf-8");
      logger.debug("Read HTML file from local provider", { filePath });
      return content;
    } catch (error) {
      throw providerError(
        "local",
        `Failed to read file: ${filePath}`,
        {
          filePath,
          error: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  /**
   * Fetch a topic by URL or ID
   */
  async fetchTopic(urlOrId: string, version?: string): Promise<Topic> {
    const filePath = await this.findHtmlFile(urlOrId, version);
    
    if (!filePath) {
      throw providerError(
        "local",
        `Topic not found: ${urlOrId}`,
        {
          topic_id: urlOrId,
          version,
          local_path: this.localPath,
          versioned_path: this.getVersionedPath(version),
          searched_path: this.normalizePath(urlOrId, version),
        }
      );
    }

    try {
      await this.readHtmlFile(filePath); // Read HTML (will be parsed in Phase 3)
      
      // Return a minimal Topic structure - actual parsing will be done in Phase 3
      const topic: Topic = {
        id: urlOrId,
        version: version ?? "local",
        title: basename(filePath, extname(filePath)), // Will be parsed from HTML in Phase 3
        section: "Unknown", // Will be parsed from HTML in Phase 3
        path: [], // Will be parsed from HTML in Phase 3
        summary: "", // Will be parsed from HTML in Phase 3
        body_chunks: [], // Will be parsed from HTML in Phase 3
        links: [], // Will be parsed from HTML in Phase 3
        url: filePath,
        source: this.source,
      };

      logger.debug("Fetched topic from local provider", {
        topic_id: urlOrId,
        file_path: filePath,
      });

      return topic;
    } catch (error) {
      throw providerError(
        "local",
        `Failed to fetch topic: ${urlOrId}`,
        {
          topic_id: urlOrId,
          file_path: filePath,
          error: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  /**
   * List topics in a section
   */
  async listTopics(section: string, version?: string, limit: number = 50): Promise<Topic[]> {
    const basePath = this.getVersionedPath(version);
    const sectionPath = resolve(basePath, section);
    
    try {
      const entries = await readdir(sectionPath, { withFileTypes: true });
      const htmlFiles = entries
        .filter((entry) => entry.isFile() && /\.html?$/i.test(entry.name))
        .slice(0, limit)
        .map((entry) => join(sectionPath, entry.name));

      const topics: Topic[] = [];
      for (const filePath of htmlFiles) {
        try {
          await this.readHtmlFile(filePath); // Read HTML (will be parsed in Phase 3)
          // Remove base path to get relative topic ID
          const topicId = filePath.replace(basePath, "").replace(/^\//, "");
          
          topics.push({
            id: topicId,
            version: version ?? "local",
            title: basename(filePath, extname(filePath)),
            section,
            path: [section],
            summary: "",
            body_chunks: [],
            links: [],
            url: filePath,
            source: this.source,
          });
        } catch (error) {
          logger.warn("Failed to read topic file", {
            filePath,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return topics;
    } catch (error) {
      throw providerError(
        "local",
        `Failed to list topics in section: ${section}`,
        {
          section,
          version,
          base_path: basePath,
          section_path: sectionPath,
          error: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  /**
   * Get available versions
   * 
   * For local provider, versions might be represented as subdirectories
   */
  async getAvailableVersions(): Promise<string[]> {
    try {
      const entries = await readdir(this.localPath, { withFileTypes: true });
      const versionDirs = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
      
      // If no version directories, assume single version
      if (versionDirs.length === 0) {
        return ["local"];
      }

      return ["local", ...versionDirs];
    } catch {
      return ["local"];
    }
  }

  /**
   * Get available sections
   */
  async getAvailableSections(version?: string): Promise<string[]> {
    const basePath = version && version !== "local"
      ? resolve(this.localPath, version)
      : this.localPath;

    try {
      const entries = await readdir(basePath, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch {
      // If we can't read the directory, return empty array
      return [];
    }
  }
}

