/**
 * Unit tests for OnlineProvider
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Set up config before any imports
import { _setCachedConfigForTesting } from "../../../config.js";

const mockConfig = {
  docBaseUrl: "https://www.synergex.com/docs/",
  defaultVersion: "latest",
  cacheDir: "./cache",
  logLevel: "info" as const,
};

// Set cached config before tests run
_setCachedConfigForTesting(mockConfig);

// Mock global fetch
global.fetch = vi.fn();

// Import after mocks are set up
import { OnlineProvider } from "../online-provider.js";

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    logHttpFetch: vi.fn(),
    logCacheOperation: vi.fn(),
  },
}));

describe("OnlineProvider", () => {
  let provider: OnlineProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Ensure config is set before creating provider
    _setCachedConfigForTesting(mockConfig);
    provider = new OnlineProvider();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("should create provider with default config", () => {
      const p = new OnlineProvider();
      expect(p.getSource()).toBe("online");
    });

    it("should accept custom baseUrl and defaultVersion", () => {
      const p = new OnlineProvider("https://custom.com/docs/", "12.3");
      expect(p).toBeInstanceOf(OnlineProvider);
    });
  });

  describe("getSource", () => {
    it("should return 'online' as source", () => {
      expect(provider.getSource()).toBe("online");
    });
  });

  describe("fetchHtml - caching", () => {
    it("should cache HTML responses", async () => {
      const url = "https://www.synergex.com/docs/topic1";
      const mockHtml = "<html><body>Test Content</body></html>";

      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(mockHtml),
        clone: vi.fn(),
      };

      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any);

      // First fetch - should call fetch
      const result1 = await provider.fetchHtml(url);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(result1).toBe(mockHtml);

      // Second fetch within cache window - should use cache
      const result2 = await provider.fetchHtml(url);
      expect(global.fetch).toHaveBeenCalledTimes(1); // Still only 1 call
      expect(result2).toBe(mockHtml);
    });

    it("should expire cache after maxAge", async () => {
      const url = "https://www.synergex.com/docs/topic1";
      const mockHtml = "<html><body>Test Content</body></html>";

      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(mockHtml),
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      // First fetch
      await provider.fetchHtml(url);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Advance time past cache maxAge (60 seconds)
      vi.advanceTimersByTime(61000);

      // Second fetch - should fetch again
      await provider.fetchHtml(url);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("fetchHtml - rate limiting", () => {
    it("should respect rate limits", async () => {
      const url = "https://www.synergex.com/docs/topic";
      const mockHtml = "<html><body>Content</body></html>";

      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(mockHtml),
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      // Make 10 requests (rate limit is 10 per 5 seconds)
      const promises = Array.from({ length: 10 }, () => provider.fetchHtml(url));
      await Promise.all(promises);

      // All should complete
      expect(global.fetch).toHaveBeenCalledTimes(10);
    });

    it("should wait when rate limit exceeded", async () => {
      const url = "https://www.synergex.com/docs/topic";
      const mockHtml = "<html><body>Content</body></html>";

      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(mockHtml),
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      // Make 11 requests (exceeds limit of 10)
      const promises = Array.from({ length: 11 }, () => provider.fetchHtml(url));

      // Advance time to allow rate limiter to process
      vi.advanceTimersByTime(6000);

      await Promise.all(promises);

      // All should complete eventually
      expect(global.fetch).toHaveBeenCalledTimes(11);
    });
  });

  describe("fetchHtml - error handling", () => {
    it("should handle HTTP errors", async () => {
      const url = "https://www.synergex.com/docs/notfound";

      const mockResponse = {
        ok: false,
        status: 404,
        statusText: "Not Found",
      };

      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any);

      await expect(provider.fetchHtml(url)).rejects.toMatchObject({
        code: "NETWORK_ERROR",
      });
    });

    it("should handle network timeouts", async () => {
      const url = "https://www.synergex.com/docs/slow";

      vi.mocked(global.fetch).mockRejectedValueOnce(
        new Error("Request timeout")
      );

      await expect(provider.fetchHtml(url)).rejects.toMatchObject({
        code: "NETWORK_ERROR",
      });
    });

    it("should handle fetch failures", async () => {
      const url = "https://www.synergex.com/docs/error";

      vi.mocked(global.fetch).mockRejectedValueOnce(new Error("Network error"));

      await expect(provider.fetchHtml(url)).rejects.toMatchObject({
        code: "NETWORK_ERROR",
      });
    });

    it("should mark server errors as retryable", async () => {
      const url = "https://www.synergex.com/docs/server-error";

      const mockResponse = {
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      };

      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any);

      try {
        await provider.fetchHtml(url);
        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.retryable).toBe(true);
      }
    });
  });

  describe("fetchTopic", () => {
    it("should build correct URL for topic", async () => {
      const topicId = "topic1";
      const mockHtml = "<html><body>Content</body></html>";

      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(mockHtml),
      };

      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any);

      const topic = await provider.fetchTopic(topicId);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(topicId),
        expect.any(Object)
      );
      expect(topic.id).toBe(topicId);
      expect(topic.source).toBe("online");
    });

    it("should handle versioned URLs", async () => {
      const topicId = "topic1";
      const version = "12.3";
      const mockHtml = "<html><body>Content</body></html>";

      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(mockHtml),
      };

      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any);

      const topic = await provider.fetchTopic(topicId, version);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`versions/${version}`),
        expect.any(Object)
      );
      expect(topic.version).toBe(version);
    });

    it("should handle 'latest' version", async () => {
      const topicId = "topic1";
      const mockHtml = "<html><body>Content</body></html>";

      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(mockHtml),
      };

      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any);

      const topic = await provider.fetchTopic(topicId, "latest");

      expect(topic.version).toBe("latest");
    });

    it("should handle absolute URLs", async () => {
      const absoluteUrl = "https://www.synergex.com/docs/custom/topic";
      const mockHtml = "<html><body>Content</body></html>";

      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(mockHtml),
      };

      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any);

      const topic = await provider.fetchTopic(absoluteUrl);

      expect(global.fetch).toHaveBeenCalledWith(absoluteUrl, expect.any(Object));
      expect(topic.url).toBe(absoluteUrl);
    });

    it("should propagate fetch errors", async () => {
      const topicId = "error";

      vi.mocked(global.fetch).mockRejectedValueOnce(new Error("Network error"));

      await expect(provider.fetchTopic(topicId)).rejects.toMatchObject({
        code: "PROVIDER_ERROR",
      });
    });
  });

  describe("getAvailableVersions", () => {
    it("should return default versions", async () => {
      const versions = await provider.getAvailableVersions();

      expect(versions).toContain("latest");
      expect(versions.length).toBeGreaterThan(0);
    });
  });

  describe("getAvailableSections", () => {
    it("should return default sections", async () => {
      const sections = await provider.getAvailableSections();

      expect(sections).toContain("Language");
      expect(sections.length).toBeGreaterThan(0);
    });
  });

  describe("listTopics", () => {
    it("should return empty array (placeholder)", async () => {
      const topics = await provider.listTopics("Language");

      expect(topics).toEqual([]);
    });
  });
});

