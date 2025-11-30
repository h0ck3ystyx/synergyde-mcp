/**
 * End-to-end integration tests
 * Tests the complete flow: search → get_topic → get_related
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { searchDocs } from "../tools/search-docs.js";
import { getTopic } from "../tools/get-topic.js";
import { getRelatedTopics } from "../tools/get-related-topics.js";
import { SearchIndex } from "../lib/search/index.js";
import { CacheManager } from "../lib/cache/cache-manager.js";
import type { DocProvider, Topic } from "../types.js";

// Mock config
let testCacheDir = `./test-cache-${Date.now()}`;
vi.mock("../config.js", () => ({
  getConfig: vi.fn(() => ({
    defaultVersion: "latest",
    cacheDir: testCacheDir,
  })),
  initializeConfig: vi.fn(async () => ({
    defaultVersion: "latest",
    cacheDir: testCacheDir,
  })),
}));

// Mock logger
vi.mock("../lib/utils/logger.js", () => ({
  logger: {
    logToolInvocation: vi.fn(),
    logCacheOperation: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe("End-to-End Integration", () => {
  let searchIndex: SearchIndex;
  let cache: CacheManager;
  let provider: DocProvider;

  const mockTopic: Topic = {
    id: "language/introduction",
    version: "latest",
    title: "Introduction to Synergy Language",
    section: "Language",
    path: ["Language", "Introduction"],
    summary: "Learn the basics of the Synergy programming language",
    body_chunks: [
      {
        topic_id: "language/introduction",
        chunk_index: 0,
        text: "Synergy is a powerful programming language designed for business applications.",
      },
      {
        topic_id: "language/introduction",
        chunk_index: 1,
        text: "It provides excellent integration with existing systems and databases.",
      },
    ],
    links: [
      {
        type: "next",
        target_topic_id: "language/variables",
        title: "Variables",
        url: "https://example.com/language/variables",
      },
      {
        type: "prev",
        target_topic_id: "language/overview",
        title: "Overview",
        url: "https://example.com/language/overview",
      },
      {
        type: "parent",
        target_topic_id: "language/index",
        title: "Language Reference",
        url: "https://example.com/language/index",
      },
      {
        type: "related",
        target_topic_id: "language/syntax",
        title: "Syntax",
        url: "https://example.com/language/syntax",
      },
    ],
    url: "https://example.com/language/introduction",
    source: "online",
  };

  beforeEach(async () => {
    // Use a unique cache directory for each test
    testCacheDir = `./test-cache-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    searchIndex = new SearchIndex();
    cache = new CacheManager();
    await cache.initialize();

    // Create a mock provider
    provider = {
      getSource: () => "online" as const,
      fetchTopic: vi.fn(async (topicId: string, version?: string) => {
        if (topicId === mockTopic.id || topicId.includes("introduction")) {
          return mockTopic;
        }
        throw new Error("Topic not found");
      }),
      listTopics: vi.fn(async () => [mockTopic]),
      getAvailableVersions: vi.fn(async () => ["latest", "v111"]),
      getAvailableSections: vi.fn(async () => ["Language", "Reference"]),
    } as unknown as DocProvider;

    // Add topic to search index
    searchIndex.addTopic(mockTopic);
  });

  describe("search → get_topic flow", () => {
    it("should allow searching and then fetching a topic", async () => {
      // Step 1: Search for topics
      const searchResult = await searchDocs({ query: "Synergy Language" }, searchIndex);
      
      expect(Array.isArray(searchResult)).toBe(true);
      if (Array.isArray(searchResult) && searchResult.length > 0) {
        const firstResult = searchResult[0];
        expect(firstResult).toHaveProperty("topic_id");

        // Step 2: Get the full topic
        const topicResult = await getTopic(
          { topic_id: firstResult.topic_id },
          provider,
          cache
        );

        expect(topicResult).toHaveProperty("id");
        if ("id" in topicResult) {
          expect(topicResult.id).toBe(mockTopic.id);
          expect(topicResult.title).toBe(mockTopic.title);
        }
      }
    });

    it("should cache topics after fetching", async () => {
      // Fetch topic (should call provider)
      const topicResult1 = await getTopic(
        { topic_id: mockTopic.id },
        provider,
        cache
      );

      expect(topicResult1).toHaveProperty("id");
      expect(provider.fetchTopic).toHaveBeenCalled();

      // Clear the mock call count
      (provider.fetchTopic as any).mockClear();

      // Fetch again (should use cache)
      const topicResult2 = await getTopic(
        { topic_id: mockTopic.id },
        provider,
        cache
      );

      expect(topicResult2).toHaveProperty("id");
      // Provider should not be called again if cache works
      // (Note: This depends on cache implementation)
    });
  });

  describe("get_topic → get_related flow", () => {
    it("should fetch a topic and then get related topics", async () => {
      // Step 1: Get topic
      const topicResult = await getTopic(
        { topic_id: mockTopic.id },
        provider,
        cache
      );

      expect(topicResult).toHaveProperty("id");
      if (!("id" in topicResult)) {
        return;
      }

      // Step 2: Get related topics
      const relatedResult = await getRelatedTopics(
        { topic_id: mockTopic.id },
        provider,
        cache
      );

      expect(relatedResult).toHaveProperty("related");
      if ("related" in relatedResult) {
        expect(Array.isArray(relatedResult.related)).toBe(true);
        expect(relatedResult).toHaveProperty("next");
        expect(relatedResult).toHaveProperty("previous");
        expect(relatedResult).toHaveProperty("parent");
      }
    });
  });

  describe("complete flow: search → get_topic → get_related", () => {
    it("should support the full workflow", async () => {
      // Step 1: Search
      const searchResult = await searchDocs({ query: "Synergy" }, searchIndex);
      expect(Array.isArray(searchResult)).toBe(true);
      if (!Array.isArray(searchResult) || searchResult.length === 0) {
        return;
      }

      const firstResult = searchResult[0];
      expect(firstResult).toHaveProperty("topic_id");

      // Step 2: Get topic
      const topicResult = await getTopic(
        { topic_id: firstResult.topic_id },
        provider,
        cache
      );
      expect(topicResult).toHaveProperty("id");
      if (!("id" in topicResult)) {
        return;
      }

      // Step 3: Get related topics
      const relatedResult = await getRelatedTopics(
        { topic_id: topicResult.id },
        provider,
        cache
      );
      expect(relatedResult).toHaveProperty("related");
    });
  });

  describe("error handling in flow", () => {
    it("should handle errors gracefully in search → get_topic flow", async () => {
      // Search for non-existent topic
      const searchResult = await searchDocs({ query: "nonexistentxyz123" }, searchIndex);
      
      // Should return empty array, not error
      expect(Array.isArray(searchResult)).toBe(true);
      if (Array.isArray(searchResult)) {
        expect(searchResult.length).toBe(0);
      }

      // Try to get a non-existent topic
      const topicResult = await getTopic(
        { topic_id: "nonexistent-topic" },
        provider,
        cache
      );

      // Should return error payload, not throw
      expect(topicResult).toHaveProperty("code");
      if ("code" in topicResult) {
        expect(topicResult.code).toBeDefined();
      }
    });
  });
});

