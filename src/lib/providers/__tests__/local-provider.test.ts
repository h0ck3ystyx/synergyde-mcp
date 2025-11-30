/**
 * Unit tests for LocalProvider
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Set up config before any imports
import { _setCachedConfigForTesting } from "../../../config.js";

const mockConfig = {
  docBaseUrl: "https://www.synergex.com/docs/",
  defaultVersion: "latest",
  localDocPath: "/test/docs",
  cacheDir: "./cache",
  logLevel: "info" as const,
};

// Set cached config before tests run
_setCachedConfigForTesting(mockConfig);

// Mock file system
vi.mock("node:fs/promises");

// Import after mocks are set up
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { LocalProvider } from "../local-provider.js";
import { providerError } from "../../utils/errors.js";

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("LocalProvider", () => {
  const mockLocalPath = "/test/docs";
  let provider: LocalProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure config is set before creating provider
    _setCachedConfigForTesting(mockConfig);
    provider = new LocalProvider(mockLocalPath);
  });

  describe("constructor", () => {
    it("should throw error if no local path provided", () => {
      expect(() => {
        new LocalProvider("");
      }).toThrow("LocalProvider requires SYNERGYDE_LOCAL_DOC_PATH to be set");
    });

    it("should accept local path in constructor", () => {
      const p = new LocalProvider("/custom/path");
      expect(p).toBeInstanceOf(LocalProvider);
    });
  });

  describe("getSource", () => {
    it("should return 'local' as source", () => {
      expect(provider.getSource()).toBe("local");
    });
  });

  describe("fetchTopic - path resolution", () => {
    it("should resolve relative path correctly", async () => {
      const mockHtml = "<html><body>Test Content</body></html>";
      const topicId = "topic1";
      const expectedPath = resolve(mockLocalPath, `${topicId}.html`);

      vi.mocked(stat).mockResolvedValueOnce({ isFile: () => true } as any);
      vi.mocked(readFile).mockResolvedValueOnce(mockHtml);

      const topic = await provider.fetchTopic(topicId);

      expect(stat).toHaveBeenCalledWith(expectedPath);
      expect(readFile).toHaveBeenCalledWith(expectedPath, "utf-8");
      expect(topic.id).toBe(topicId);
      expect(topic.source).toBe("local");
    });

    it("should try .html extension first, then .htm", async () => {
      const mockHtml = "<html><body>Test</body></html>";
      const topicId = "topic1";
      const htmlPath = resolve(mockLocalPath, `${topicId}.html`);
      const htmPath = resolve(mockLocalPath, `${topicId}.htm`);

      // First try .html - file doesn't exist
      vi.mocked(stat).mockResolvedValueOnce({ isFile: () => false } as any);
      // Then try .htm - file exists
      vi.mocked(stat).mockResolvedValueOnce({ isFile: () => true } as any);
      vi.mocked(readFile).mockResolvedValueOnce(mockHtml);

      const topic = await provider.fetchTopic(topicId);

      expect(stat).toHaveBeenCalledWith(htmlPath);
      expect(stat).toHaveBeenCalledWith(htmPath);
      expect(readFile).toHaveBeenCalledWith(htmPath, "utf-8");
      expect(topic.id).toBe(topicId);
    });

    it("should handle absolute paths", async () => {
      const absolutePath = "/absolute/path/to/topic.html";
      const mockHtml = "<html><body>Test</body></html>";

      vi.mocked(stat).mockResolvedValueOnce({ isFile: () => true } as any);
      vi.mocked(readFile).mockResolvedValueOnce(mockHtml);

      const topic = await provider.fetchTopic(absolutePath);

      expect(stat).toHaveBeenCalledWith(absolutePath);
      expect(topic.url).toBe(absolutePath);
    });
  });

  describe("fetchTopic - version-aware lookups", () => {
    it("should use versioned path when version is provided", async () => {
      const mockHtml = "<html><body>Test</body></html>";
      const topicId = "topic1";
      const version = "12.3";
      const expectedPath = resolve(mockLocalPath, version, `${topicId}.html`);

      vi.mocked(stat).mockResolvedValueOnce({ isFile: () => true } as any);
      vi.mocked(readFile).mockResolvedValueOnce(mockHtml);

      const topic = await provider.fetchTopic(topicId, version);

      expect(stat).toHaveBeenCalledWith(expectedPath);
      expect(topic.version).toBe(version);
    });

    it("should use default path when version is 'local'", async () => {
      const mockHtml = "<html><body>Test</body></html>";
      const topicId = "topic1";
      const expectedPath = resolve(mockLocalPath, `${topicId}.html`);

      vi.mocked(stat).mockResolvedValueOnce({ isFile: () => true } as any);
      vi.mocked(readFile).mockResolvedValueOnce(mockHtml);

      const topic = await provider.fetchTopic(topicId, "local");

      expect(stat).toHaveBeenCalledWith(expectedPath);
      expect(topic.version).toBe("local");
    });

    it("should use default path when version is undefined", async () => {
      const mockHtml = "<html><body>Test</body></html>";
      const topicId = "topic1";
      const expectedPath = resolve(mockLocalPath, `${topicId}.html`);

      vi.mocked(stat).mockResolvedValueOnce({ isFile: () => true } as any);
      vi.mocked(readFile).mockResolvedValueOnce(mockHtml);

      const topic = await provider.fetchTopic(topicId);

      expect(stat).toHaveBeenCalledWith(expectedPath);
      expect(topic.version).toBe("local");
    });
  });

  describe("fetchTopic - error scenarios", () => {
    it("should throw provider error when topic not found", async () => {
      const topicId = "nonexistent";

      // Try .html - doesn't exist
      vi.mocked(stat).mockResolvedValueOnce({ isFile: () => false } as any);
      // Try .htm - doesn't exist
      vi.mocked(stat).mockResolvedValueOnce({ isFile: () => false } as any);

      // Capture the promise once and assert on it
      const promise = provider.fetchTopic(topicId);
      await expect(promise).rejects.toThrow();
      await expect(promise).rejects.toMatchObject({
        code: "PROVIDER_ERROR",
      });
    });

    it("should throw provider error when file read fails", async () => {
      const topicId = "topic1";
      const expectedPath = resolve(mockLocalPath, `${topicId}.html`);

      vi.mocked(stat).mockResolvedValueOnce({ isFile: () => true } as any);
      vi.mocked(readFile).mockRejectedValueOnce(new Error("Permission denied"));

      // Capture the promise once and assert on it
      const promise = provider.fetchTopic(topicId);
      await expect(promise).rejects.toThrow();
      await expect(promise).rejects.toMatchObject({
        code: "PROVIDER_ERROR",
      });
    });
  });

  describe("listTopics", () => {
    it("should list topics in section", async () => {
      const section = "Language";
      const mockHtml = "<html><body>Content</body></html>";
      const sectionPath = resolve(mockLocalPath, section);

      const mockEntries = [
        { name: "topic1.html", isFile: () => true },
        { name: "topic2.html", isFile: () => true },
        { name: "subdir", isFile: () => false },
      ];

      vi.mocked(readdir).mockResolvedValueOnce(mockEntries as any);
      vi.mocked(readFile)
        .mockResolvedValueOnce(mockHtml)
        .mockResolvedValueOnce(mockHtml);

      const topics = await provider.listTopics(section);

      expect(readdir).toHaveBeenCalledWith(sectionPath, { withFileTypes: true });
      expect(topics).toHaveLength(2);
      expect(topics[0].section).toBe(section);
      expect(topics[0].source).toBe("local");
    });

    it("should respect limit parameter", async () => {
      const section = "Language";
      const mockHtml = "<html><body>Content</body></html>";
      const mockEntries = Array.from({ length: 10 }, (_, i) => ({
        name: `topic${i}.html`,
        isFile: () => true,
      }));

      vi.mocked(readdir).mockResolvedValueOnce(mockEntries as any);
      vi.mocked(readFile).mockResolvedValue(mockHtml);

      const topics = await provider.listTopics(section, undefined, 5);

      expect(topics).toHaveLength(5);
    });

    it("should use versioned path for listTopics", async () => {
      const section = "Language";
      const version = "12.3";
      const basePath = resolve(mockLocalPath, version);
      const sectionPath = resolve(basePath, section);
      const mockHtml = "<html><body>Content</body></html>";

      vi.mocked(readdir).mockResolvedValueOnce([] as any);

      await provider.listTopics(section, version);

      expect(readdir).toHaveBeenCalledWith(sectionPath, { withFileTypes: true });
    });

    it("should handle readdir errors", async () => {
      const section = "Nonexistent";
      const sectionPath = resolve(mockLocalPath, section);

      vi.mocked(readdir).mockRejectedValueOnce(new Error("Directory not found"));

      await expect(provider.listTopics(section)).rejects.toThrow();
      await expect(provider.listTopics(section)).rejects.toMatchObject({
        code: "PROVIDER_ERROR",
      });
    });
  });

  describe("getAvailableVersions", () => {
    it("should return 'local' when no version directories exist", async () => {
      vi.mocked(readdir).mockResolvedValueOnce([] as any);

      const versions = await provider.getAvailableVersions();

      expect(versions).toEqual(["local"]);
    });

    it("should return version directories when they exist", async () => {
      const mockEntries = [
        { name: "12.3", isDirectory: () => true },
        { name: "11.1", isDirectory: () => true },
        { name: "file.txt", isDirectory: () => false },
      ];

      vi.mocked(readdir).mockResolvedValueOnce(mockEntries as any);

      const versions = await provider.getAvailableVersions();

      expect(versions).toContain("local");
      expect(versions).toContain("12.3");
      expect(versions).toContain("11.1");
    });

    it("should handle readdir errors gracefully", async () => {
      vi.mocked(readdir).mockRejectedValueOnce(new Error("Permission denied"));

      const versions = await provider.getAvailableVersions();

      expect(versions).toEqual(["local"]);
    });
  });

  describe("getAvailableSections", () => {
    it("should return sections from base path", async () => {
      const mockEntries = [
        { name: "Language", isDirectory: () => true },
        { name: "Guides", isDirectory: () => true },
        { name: "file.html", isDirectory: () => false },
      ];

      vi.mocked(readdir).mockResolvedValueOnce(mockEntries as any);

      const sections = await provider.getAvailableSections();

      expect(sections).toContain("Language");
      expect(sections).toContain("Guides");
      expect(sections).not.toContain("file.html");
    });

    it("should use versioned path when version provided", async () => {
      const version = "12.3";
      const versionedPath = resolve(mockLocalPath, version);
      const mockEntries = [{ name: "Language", isDirectory: () => true }];

      vi.mocked(readdir).mockResolvedValueOnce(mockEntries as any);

      await provider.getAvailableSections(version);

      expect(readdir).toHaveBeenCalledWith(versionedPath, { withFileTypes: true });
    });

    it("should return empty array on error", async () => {
      vi.mocked(readdir).mockRejectedValueOnce(new Error("Permission denied"));

      const sections = await provider.getAvailableSections();

      expect(sections).toEqual([]);
    });
  });
});

