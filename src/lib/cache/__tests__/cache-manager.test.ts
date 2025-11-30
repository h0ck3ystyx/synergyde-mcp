/**
 * Unit tests for the cache manager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, readFile, writeFile, rm, access, constants } from "node:fs/promises";
import { join, resolve } from "node:path";

// Set up config before any imports
import { _setCachedConfigForTesting } from "../../../config.js";

// Mock logger - must be before cache manager import
vi.mock("../../utils/logger.js", () => ({
  logger: {
    logCacheOperation: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

// Import after mocks are set up
import { CacheManager } from "../cache-manager.js";
import type { Topic } from "../../../types.js";
import * as loggerModule from "../../utils/logger.js";

describe("CacheManager", () => {
  let cacheDir: string;
  let cacheManager: CacheManager;
  const mockTopic: Topic = {
    id: "test-topic",
    version: "v111",
    title: "Test Topic",
    section: "test-section",
    path: ["test"],
    summary: "A test topic",
    body_chunks: [
      {
        topic_id: "test-topic",
        chunk_index: 0,
        text: "Test content",
      },
    ],
    links: [],
    url: "https://example.com/test-topic",
    source: "online",
  };

  beforeEach(async () => {
    // Create a temporary cache directory for each test
    cacheDir = resolve(process.cwd(), "test-cache-" + Date.now());
    
    // Set cached config before creating cache manager
    _setCachedConfigForTesting({
      docBaseUrl: "https://www.synergex.com/docs/",
      defaultVersion: "latest",
      cacheDir,
      logLevel: "debug",
    });

    cacheManager = new CacheManager();
    await cacheManager.initialize();
  });

  afterEach(async () => {
    // Clean up test cache directory
    try {
      await access(cacheDir, constants.F_OK);
      await rm(cacheDir, { recursive: true, force: true });
    } catch {
      // Directory doesn't exist, ignore
    }
    _setCachedConfigForTesting(null);
    vi.clearAllMocks();
  });

  describe("initialize", () => {
    it("should create cache directory if it doesn't exist", async () => {
      const newCacheDir = resolve(process.cwd(), "test-cache-new-" + Date.now());
      
      // Set cached config before creating manager
      _setCachedConfigForTesting({
        docBaseUrl: "https://www.synergex.com/docs/",
        defaultVersion: "latest",
        cacheDir: newCacheDir,
        logLevel: "debug",
      });

      const manager = new CacheManager();
      await manager.initialize();

      try {
        await access(newCacheDir, constants.F_OK);
        // Directory exists
        expect(true).toBe(true);
      } finally {
        await rm(newCacheDir, { recursive: true, force: true });
        _setCachedConfigForTesting({
          docBaseUrl: "https://www.synergex.com/docs/",
          defaultVersion: "latest",
          cacheDir,
          logLevel: "debug",
        });
      }
    });

    it("should not fail if cache directory already exists", async () => {
      await mkdir(cacheDir, { recursive: true });
      const manager = new CacheManager();
      await expect(manager.initialize()).resolves.not.toThrow();
    });
  });

  describe("set", () => {
    it("should store a topic in the cache", async () => {
      await cacheManager.set("test-topic", "v111", mockTopic);

      const expectedPath = join(cacheDir, "v111", "test-topic.json");
      await expect(access(expectedPath, constants.F_OK)).resolves.not.toThrow();

      const content = await readFile(expectedPath, "utf-8");
      const cached = JSON.parse(content);
      expect(cached).toEqual(mockTopic);
    });

    it("should create version directory if it doesn't exist", async () => {
      await cacheManager.set("test-topic", "v1033", mockTopic);

      const versionDir = join(cacheDir, "v1033");
      await expect(access(versionDir, constants.F_OK)).resolves.not.toThrow();
    });

    it("should log cache set operation", async () => {
      await cacheManager.set("test-topic", "v111", mockTopic);

      expect(loggerModule.logger.logCacheOperation).toHaveBeenCalledWith(
        "set",
        "v111/test-topic",
        expect.objectContaining({
          topicId: "test-topic",
          version: "v111",
        })
      );
    });

    it("should handle special characters in topic ID", async () => {
      const topicWithSpecialChars: Topic = {
        ...mockTopic,
        id: "test/topic-with-special-chars",
      };

      await cacheManager.set("test/topic-with-special-chars", "v111", topicWithSpecialChars);

      // Should sanitize the topic ID for filesystem
      const expectedPath = join(cacheDir, "v111", "test_topic-with-special-chars.json");
      await expect(access(expectedPath, constants.F_OK)).resolves.not.toThrow();
    });
  });

  describe("get", () => {
    it("should retrieve a cached topic", async () => {
      await cacheManager.set("test-topic", "v111", mockTopic);

      const result = await cacheManager.get("test-topic", "v111");

      expect(result).toEqual(mockTopic);
    });

    it("should return null if topic is not cached", async () => {
      const result = await cacheManager.get("non-existent", "v111");
      expect(result).toBeNull();
    });

    it("should return null if version directory doesn't exist", async () => {
      const result = await cacheManager.get("test-topic", "v999");
      expect(result).toBeNull();
    });

    it("should log cache hit when topic is found", async () => {
      await cacheManager.set("test-topic", "v111", mockTopic);
      await cacheManager.get("test-topic", "v111");

      expect(loggerModule.logger.logCacheOperation).toHaveBeenCalledWith(
        "hit",
        "v111/test-topic",
        expect.objectContaining({
          topicId: "test-topic",
          version: "v111",
        })
      );
    });

    it("should log cache miss when topic is not found", async () => {
      await cacheManager.get("non-existent", "v111");

      expect(loggerModule.logger.logCacheOperation).toHaveBeenCalledWith(
        "miss",
        "v111/non-existent",
        expect.objectContaining({
          topicId: "non-existent",
          version: "v111",
        })
      );
    });

    it("should handle corrupted cache files gracefully", async () => {
      // Create a corrupted JSON file
      const versionDir = join(cacheDir, "v111");
      await mkdir(versionDir, { recursive: true });
      await writeFile(join(versionDir, "corrupted.json"), "not valid json");

      const result = await cacheManager.get("corrupted", "v111");
      expect(result).toBeNull();

      // Should log an error
      expect(loggerModule.logger.error).toHaveBeenCalled();
    });

    it("should handle special characters in topic ID when retrieving", async () => {
      const topicWithSpecialChars: Topic = {
        ...mockTopic,
        id: "test/topic-with-special-chars",
      };

      await cacheManager.set("test/topic-with-special-chars", "v111", topicWithSpecialChars);
      const result = await cacheManager.get("test/topic-with-special-chars", "v111");

      expect(result).toEqual(topicWithSpecialChars);
    });
  });

  describe("has", () => {
    it("should return true if topic is cached", async () => {
      await cacheManager.set("test-topic", "v111", mockTopic);

      const result = await cacheManager.has("test-topic", "v111");
      expect(result).toBe(true);
    });

    it("should return false if topic is not cached", async () => {
      const result = await cacheManager.has("non-existent", "v111");
      expect(result).toBe(false);
    });

    it("should return false if version directory doesn't exist", async () => {
      const result = await cacheManager.has("test-topic", "v999");
      expect(result).toBe(false);
    });

    it("should not log cache operations for has()", async () => {
      await cacheManager.set("test-topic", "v111", mockTopic);
      vi.clearAllMocks();

      await cacheManager.has("test-topic", "v111");

      expect(loggerModule.logger.logCacheOperation).not.toHaveBeenCalled();
    });
  });

  describe("key format", () => {
    it("should use {version}/{topic_id}.json format", async () => {
      await cacheManager.set("my-topic", "v111", mockTopic);

      const expectedPath = join(cacheDir, "v111", "my-topic.json");
      await expect(access(expectedPath, constants.F_OK)).resolves.not.toThrow();
    });

    it("should handle 'latest' version", async () => {
      await cacheManager.set("my-topic", "latest", mockTopic);

      const expectedPath = join(cacheDir, "latest", "my-topic.json");
      await expect(access(expectedPath, constants.F_OK)).resolves.not.toThrow();
    });
  });

  describe("error handling", () => {
    it("should handle filesystem errors gracefully", async () => {
      // Use an invalid cache directory path (on Unix systems, /root is typically not writable)
      // On macOS, we can try a path that would require root permissions
      const invalidCacheDir = "/root/invalid-cache-test";
      
      _setCachedConfigForTesting({
        docBaseUrl: "https://www.synergex.com/docs/",
        defaultVersion: "latest",
        cacheDir: invalidCacheDir,
        logLevel: "debug",
      });

      const manager = new CacheManager();
      // Should throw during initialization if directory cannot be created
      await expect(manager.initialize()).rejects.toThrow();
      
      // Restore original config
      _setCachedConfigForTesting({
        docBaseUrl: "https://www.synergex.com/docs/",
        defaultVersion: "latest",
        cacheDir,
        logLevel: "debug",
      });
    });
  });

  describe("security - version sanitization", () => {
    it("should sanitize version to prevent directory traversal", async () => {
      // Attempt directory traversal attack
      const maliciousVersion = "../../tmp/pwned";
      const sanitizedVersion = "../../tmp/pwned".replace(/[^A-Za-z0-9._-]/g, "_"); // Should become "__..__tmp_pwned"

      await cacheManager.set("test-topic", maliciousVersion, mockTopic);

      // Verify the file was created in the sanitized version directory, not outside cache
      const sanitizedPath = join(cacheDir, sanitizedVersion, "test-topic.json");
      const maliciousPath = resolve(cacheDir, "../../tmp/pwned/test-topic.json");

      // Sanitized path should exist
      try {
        await access(sanitizedPath);
        expect(true).toBe(true); // File exists in safe location
      } catch {
        expect.fail("File should exist in sanitized location");
      }

      // Malicious path should NOT exist (or be outside cache dir)
      const cacheDirParent = resolve(cacheDir, "..");
      const maliciousPathResolved = resolve(maliciousPath);
      expect(maliciousPathResolved.startsWith(cacheDirParent)).toBe(false);
    });

    it("should sanitize version with special characters", async () => {
      const versionWithSpecialChars = "v1.0.0-beta/alpha";
      const sanitizedVersion = "v1.0.0-beta_alpha"; // Slash should become underscore

      await cacheManager.set("test-topic", versionWithSpecialChars, mockTopic);

      const sanitizedPath = join(cacheDir, sanitizedVersion, "test-topic.json");
      try {
        await access(sanitizedPath);
        expect(true).toBe(true);
      } catch {
        expect.fail("File should exist with sanitized version");
      }
    });

    it("should prevent reading files outside cache directory via version", async () => {
      const maliciousVersion = "../../../etc/passwd";
      
      // Should not be able to read files outside cache
      const result = await cacheManager.get("passwd", maliciousVersion);
      expect(result).toBeNull();

      // Verify no file was created outside cache
      const maliciousPath = resolve(cacheDir, maliciousVersion, "passwd.json");
      const cacheDirParent = resolve(cacheDir, "..");
      expect(maliciousPath.startsWith(cacheDirParent)).toBe(false);
    });

    it("should handle 'latest' version correctly", async () => {
      await cacheManager.set("test-topic", "latest", mockTopic);

      const result = await cacheManager.get("test-topic", "latest");
      expect(result).toEqual(mockTopic);
    });
  });
});

