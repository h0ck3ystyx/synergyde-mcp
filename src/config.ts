/**
 * Configuration module for reading and validating environment variables
 */

import { access, constants } from "node:fs/promises";
import { resolve } from "node:path";

import type { ServerConfig } from "./types.js";

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: ServerConfig = {
  docBaseUrl: "https://www.synergex.com/docs/",
  defaultVersion: "latest",
  cacheDir: "./cache",
  logLevel: "info",
};

/**
 * Valid log levels
 */
const VALID_LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

/**
 * Read and validate configuration from environment variables
 */
export async function loadConfig(): Promise<ServerConfig> {
  const docBaseUrl = process.env.SYNERGYDE_DOC_BASE_URL ?? DEFAULT_CONFIG.docBaseUrl;
  const defaultVersion = process.env.SYNERGYDE_DOC_DEFAULT_VERSION ?? DEFAULT_CONFIG.defaultVersion;
  const localDocPath = process.env.SYNERGYDE_LOCAL_DOC_PATH;
  const cacheDir = process.env.SYNERGYDE_CACHE_DIR ?? DEFAULT_CONFIG.cacheDir;
  const logLevel = process.env.LOG_LEVEL ?? DEFAULT_CONFIG.logLevel;

  // Validate log level
  if (!VALID_LOG_LEVELS.includes(logLevel as typeof VALID_LOG_LEVELS[number])) {
    throw new Error(
      `Invalid LOG_LEVEL: ${logLevel}. Must be one of: ${VALID_LOG_LEVELS.join(", ")}`
    );
  }

  // Validate URLs
  if (docBaseUrl && !isValidUrl(docBaseUrl)) {
    throw new Error(`Invalid SYNERGYDE_DOC_BASE_URL: ${docBaseUrl}`);
  }

  // Validate local doc path if provided
  if (localDocPath) {
    const resolvedPath = resolve(localDocPath);
    try {
      await access(resolvedPath, constants.R_OK);
    } catch (error) {
      throw new Error(
        `SYNERGYDE_LOCAL_DOC_PATH is not readable or does not exist: ${resolvedPath}. ` +
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Normalize URLs (ensure trailing slash for base URL)
  const normalizedBaseUrl = docBaseUrl.endsWith("/") ? docBaseUrl : `${docBaseUrl}/`;

  const config: ServerConfig = {
    docBaseUrl: normalizedBaseUrl,
    defaultVersion,
    localDocPath: localDocPath || undefined,
    cacheDir,
    logLevel: logLevel as ServerConfig["logLevel"],
  };

  return config;
}

/**
 * Validate that a string is a valid URL
 */
function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Get the current configuration
 * (Cached after first load)
 */
let cachedConfig: ServerConfig | null = null;

/**
 * Set cached config directly (for testing only)
 * @internal
 */
export function _setCachedConfigForTesting(config: ServerConfig | null): void {
  cachedConfig = config;
}

/**
 * Get the server configuration, loading it if necessary
 * 
 * Note: This is a synchronous wrapper that assumes config has been loaded.
 * For async validation (e.g., file system checks), use loadConfig() directly.
 */
export function getConfig(): ServerConfig {
  if (!cachedConfig) {
    throw new Error(
      "Configuration not loaded. Call loadConfig() first (it's async for file system validation)."
    );
  }
  return cachedConfig;
}

/**
 * Load and cache configuration (async version with file system validation)
 */
export async function initializeConfig(): Promise<ServerConfig> {
  if (!cachedConfig) {
    cachedConfig = await loadConfig();
  }
  return cachedConfig;
}

/**
 * Reset the cached configuration (useful for testing)
 * This will cause the logger to re-read the config on the next log call
 * 
 * Note: The logger lazily reads config, so it will automatically pick up
 * the new config after resetConfig() is called and the config is reloaded.
 */
export function resetConfig(): void {
  cachedConfig = null;
  // Logger will lazily re-read from config on next log call
  // No need to explicitly reset logger here since it reads config lazily
}

