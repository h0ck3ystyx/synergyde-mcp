/**
 * Abstract base class for documentation providers
 */

import type { DocProvider, DocSource, Topic } from "../../types.js";

/**
 * Abstract base class for documentation providers
 * 
 * All providers must implement methods to fetch topics, list topics,
 * and provide metadata about available versions and sections.
 */
export abstract class BaseDocProvider implements DocProvider {
  protected abstract readonly source: DocSource;

  /**
   * Get the source type of this provider
   */
  getSource(): DocSource {
    return this.source;
  }

  /**
   * Fetch a single topic by URL or topic ID
   * 
   * @param urlOrId - URL or topic ID to fetch
   * @param version - Optional version override
   * @returns Promise resolving to a Topic object
   * @throws Error if topic cannot be fetched
   */
  abstract fetchTopic(urlOrId: string, version?: string): Promise<Topic>;

  /**
   * List topics in a specific section
   * 
   * @param section - Section name (e.g., "Language", "General Guides")
   * @param version - Optional version override
   * @param limit - Maximum number of topics to return
   * @returns Promise resolving to an array of Topic objects
   * @throws Error if section cannot be accessed
   */
  abstract listTopics(section: string, version?: string, limit?: number): Promise<Topic[]>;

  /**
   * Get available documentation versions
   * 
   * @returns Promise resolving to an array of version strings
   * @throws Error if versions cannot be determined
   */
  abstract getAvailableVersions(): Promise<string[]>;

  /**
   * Get available sections for a version
   * 
   * @param version - Optional version (defaults to configured default)
   * @returns Promise resolving to an array of section names
   * @throws Error if sections cannot be determined
   */
  abstract getAvailableSections(version?: string): Promise<string[]>;
}

