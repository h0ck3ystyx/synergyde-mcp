/**
 * Unit tests for HybridProvider (via provider-factory)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createProvider } from "../provider-factory.js";
import { LocalProvider } from "../local-provider.js";
import { OnlineProvider } from "../online-provider.js";

// Set up config before any imports
import { _setCachedConfigForTesting } from "../../../config.js";

const baseMockConfig = {
  docBaseUrl: "https://www.synergex.com/docs/",
  defaultVersion: "latest",
  localDocPath: "/test/docs",
  cacheDir: "./cache",
  logLevel: "info" as const,
};

// Set cached config before tests run
_setCachedConfigForTesting(baseMockConfig);

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    logHttpFetch: vi.fn(),
    logCacheOperation: vi.fn(),
    logToolInvocation: vi.fn(),
    logParsing: vi.fn(),
  },
}));

// Mock file system for LocalProvider
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
}));

// Mock global fetch for OnlineProvider
global.fetch = vi.fn();

describe("HybridProvider (via createProvider)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure config is set before tests
    _setCachedConfigForTesting(baseMockConfig);
  });

  describe("createProvider", () => {
    it("should create HybridProvider when local path is configured", () => {
      const provider = createProvider();

      expect(provider.getSource()).toBe("hybrid");
    });

    it("should create OnlineProvider when no local path", async () => {
      // Set config without localDocPath for this test
      _setCachedConfigForTesting({
        docBaseUrl: "https://www.synergex.com/docs/",
        defaultVersion: "latest",
        localDocPath: undefined,
        cacheDir: "./cache",
        logLevel: "info" as const,
      });

      const provider = createProvider();

      expect(provider.getSource()).toBe("online");
      
      // Verify no file system calls were made (LocalProvider should not be instantiated)
      const { stat, readdir } = await import("node:fs/promises");
      expect(stat).not.toHaveBeenCalled();
      expect(readdir).not.toHaveBeenCalled();
      
      // Restore config
      _setCachedConfigForTesting(baseMockConfig);
    });
  });

  describe("fetchTopic - Local → Online fallback", () => {
    it("should use local provider when topic exists locally", async () => {
      const { readFile, stat } = await import("node:fs/promises");
      const provider = createProvider();
      const topicId = "local-topic";
      const mockHtml = "<html><body>Local Content</body></html>";

      vi.mocked(stat).mockResolvedValueOnce({ isFile: () => true } as any);
      vi.mocked(readFile).mockResolvedValueOnce(mockHtml);

      const topic = await provider.fetchTopic(topicId);

      expect(topic.source).toBe("local");
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should fallback to online when local fails", async () => {
      const { readFile, stat } = await import("node:fs/promises");
      const provider = createProvider();
      const topicId = "remote-topic";
      const mockHtml = "<html><body>Online Content</body></html>";

      // Local provider fails (file not found)
      vi.mocked(stat)
        .mockResolvedValueOnce({ isFile: () => false } as any)
        .mockResolvedValueOnce({ isFile: () => false } as any);

      // Online provider succeeds
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(mockHtml),
      };
      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any);

      const topic = await provider.fetchTopic(topicId);

      expect(topic.source).toBe("online");
      expect(global.fetch).toHaveBeenCalled();
    });

    it("should propagate online error when both fail", async () => {
      const { stat } = await import("node:fs/promises");
      const provider = createProvider();
      const topicId = "nonexistent";

      // Local provider fails
      vi.mocked(stat)
        .mockResolvedValueOnce({ isFile: () => false } as any)
        .mockResolvedValueOnce({ isFile: () => false } as any);

      // Online provider also fails
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error("Network error"));

      await expect(provider.fetchTopic(topicId)).rejects.toThrow();
    });
  });

  describe("listTopics - Local → Online fallback", () => {
    it("should use local provider when section exists locally", async () => {
      const { readdir, readFile } = await import("node:fs/promises");
      const provider = createProvider();
      const section = "Language";
      const mockHtml = "<html><body>Content</body></html>";

      const mockEntries = [
        { name: "topic1.html", isFile: () => true },
        { name: "topic2.html", isFile: () => true },
      ];

      vi.mocked(readdir).mockResolvedValueOnce(mockEntries as any);
      vi.mocked(readFile)
        .mockResolvedValueOnce(mockHtml)
        .mockResolvedValueOnce(mockHtml);

      const topics = await provider.listTopics(section);

      expect(topics.length).toBeGreaterThan(0);
      expect(topics[0].source).toBe("local");
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should fallback to online when local returns empty", async () => {
      const { readdir } = await import("node:fs/promises");
      const provider = createProvider();
      const section = "RemoteSection";

      // Local provider returns empty
      vi.mocked(readdir).mockResolvedValueOnce([] as any);

      const topics = await provider.listTopics(section);

      // Online provider returns empty array (placeholder)
      expect(topics).toEqual([]);
    });

    it("should fallback to online when local fails", async () => {
      const { readdir } = await import("node:fs/promises");
      const provider = createProvider();
      const section = "ErrorSection";

      // Local provider fails
      vi.mocked(readdir).mockRejectedValueOnce(new Error("Permission denied"));

      const topics = await provider.listTopics(section);

      // Should fallback to online (returns empty array in placeholder)
      expect(topics).toEqual([]);
    });
  });

  describe("getAvailableVersions", () => {
    it("should merge versions from both providers", async () => {
      const { readdir } = await import("node:fs/promises");
      const provider = createProvider();

      // Local provider returns versions
      vi.mocked(readdir).mockResolvedValueOnce([
        { name: "12.3", isDirectory: () => true },
        { name: "11.1", isDirectory: () => true },
      ] as any);

      const versions = await provider.getAvailableVersions();

      expect(versions).toContain("local");
      expect(versions).toContain("latest");
      expect(versions.length).toBeGreaterThan(2);
    });

    it("should handle local provider errors gracefully", async () => {
      const { readdir } = await import("node:fs/promises");
      const provider = createProvider();

      // Local provider fails
      vi.mocked(readdir).mockRejectedValueOnce(new Error("Error"));

      const versions = await provider.getAvailableVersions();

      // Should still return online versions
      expect(versions).toContain("latest");
      expect(versions.length).toBeGreaterThan(0);
    });
  });

  describe("getAvailableSections", () => {
    it("should use local sections when available", async () => {
      const { readdir } = await import("node:fs/promises");
      const provider = createProvider();

      const mockEntries = [
        { name: "Language", isDirectory: () => true },
        { name: "Guides", isDirectory: () => true },
      ];

      vi.mocked(readdir).mockResolvedValueOnce(mockEntries as any);

      const sections = await provider.getAvailableSections();

      expect(sections).toContain("Language");
      expect(sections).toContain("Guides");
    });

    it("should fallback to online when local fails", async () => {
      const { readdir } = await import("node:fs/promises");
      const provider = createProvider();

      // Local provider fails
      vi.mocked(readdir).mockRejectedValueOnce(new Error("Error"));

      const sections = await provider.getAvailableSections();

      // Should return online sections
      expect(sections.length).toBeGreaterThan(0);
    });
  });

  describe("provenance logging", () => {
    it("should log when local provider serves request", async () => {
      const { logger } = await import("../../utils/logger.js");
      const { readFile, stat } = await import("node:fs/promises");
      const provider = createProvider();
      const topicId = "local-topic";
      const mockHtml = "<html><body>Content</body></html>";

      vi.mocked(stat).mockResolvedValueOnce({ isFile: () => true } as any);
      vi.mocked(readFile).mockResolvedValueOnce(mockHtml);

      await provider.fetchTopic(topicId);

      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining("local provider"),
        expect.objectContaining({
          provider: "local",
        })
      );
    });

    it("should log when online provider serves request", async () => {
      const { logger } = await import("../../utils/logger.js");
      const { stat } = await import("node:fs/promises");
      const provider = createProvider();
      const topicId = "remote-topic";
      const mockHtml = "<html><body>Content</body></html>";

      // Local fails
      vi.mocked(stat)
        .mockResolvedValueOnce({ isFile: () => false } as any)
        .mockResolvedValueOnce({ isFile: () => false } as any);

      // Online succeeds
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(mockHtml),
      };
      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any);

      await provider.fetchTopic(topicId);

      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining("online provider"),
        expect.objectContaining({
          provider: "online",
        })
      );
    });
  });
});

