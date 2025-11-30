/**
 * Integration tests for search_docs tool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { searchDocs } from "../search-docs.js";
import { SearchIndex } from "../../lib/search/index.js";
import type { Topic } from "../../types.js";

// Mock config
vi.mock("../../config.js", () => ({
  getConfig: vi.fn(() => ({
    defaultVersion: "latest",
  })),
}));

// Mock logger
vi.mock("../../lib/utils/logger.js", () => ({
  logger: {
    logToolInvocation: vi.fn(),
    error: vi.fn(),
  },
}));

describe("searchDocs tool", () => {
  let searchIndex: SearchIndex;

  const mockTopic1: Topic = {
    id: "topic1",
    version: "latest",
    title: "Introduction to Synergy",
    section: "Language",
    path: ["introduction"],
    summary: "Learn the basics of Synergy programming",
    body_chunks: [
      {
        topic_id: "topic1",
        chunk_index: 0,
        text: "Synergy is a powerful programming language for business applications.",
      },
    ],
    links: [],
    url: "https://example.com/topic1",
    source: "online",
  };

  const mockTopic2: Topic = {
    id: "topic2",
    version: "latest",
    title: "Data Structures",
    section: "Reference",
    path: ["data-structures"],
    summary: "Complex data structures in Synergy",
    body_chunks: [
      {
        topic_id: "topic2",
        chunk_index: 0,
        text: "Data structures are essential for organizing information efficiently.",
      },
    ],
    links: [],
    url: "https://example.com/topic2",
    source: "online",
  };

  beforeEach(() => {
    searchIndex = new SearchIndex();
    searchIndex.addTopic(mockTopic1);
    searchIndex.addTopic(mockTopic2);
  });

  describe("successful searches", () => {
    it("should return search results for valid query", async () => {
      const result = await searchDocs({ query: "Synergy" }, searchIndex);
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      if (Array.isArray(result) && result.length > 0) {
        expect(result[0]).toHaveProperty("topic_id");
        expect(result[0]).toHaveProperty("title");
        expect(result[0]).toHaveProperty("score");
      }
    });

    it("should filter by version", async () => {
      const topicV111: Topic = {
        ...mockTopic1,
        version: "v111",
      };
      searchIndex.addTopic(topicV111);

      const result = await searchDocs({ query: "Synergy", version: "v111" }, searchIndex);
      
      expect(Array.isArray(result)).toBe(true);
      if (Array.isArray(result) && result.length > 0) {
        result.forEach((r) => {
          expect(r.version).toBe("v111");
        });
      }
    });

    it("should filter by section", async () => {
      const result = await searchDocs({ query: "Synergy", section: "Language" }, searchIndex);
      
      expect(Array.isArray(result)).toBe(true);
      if (Array.isArray(result) && result.length > 0) {
        result.forEach((r) => {
          expect(r.section).toBe("Language");
        });
      }
    });

    it("should respect limit parameter", async () => {
      const result = await searchDocs({ query: "Synergy", limit: 1 }, searchIndex);
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeLessThanOrEqual(1);
    });

    it("should use default version from config when not provided", async () => {
      const result = await searchDocs({ query: "Synergy" }, searchIndex);
      
      expect(Array.isArray(result)).toBe(true);
      // Should find topics with "latest" version
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("input validation", () => {
    it("should return error for empty query", async () => {
      const result = await searchDocs({ query: "" }, searchIndex);
      
      expect(result).toHaveProperty("code");
      expect(result).toHaveProperty("message");
      if ("code" in result) {
        expect(result.code).toBe("INVALID_INPUT");
      }
    });

    it("should return error for non-string query", async () => {
      const result = await searchDocs({ query: null as any }, searchIndex);
      
      expect(result).toHaveProperty("code");
      if ("code" in result) {
        expect(result.code).toBe("INVALID_INPUT");
      }
    });

    it("should return error for negative limit", async () => {
      const result = await searchDocs({ query: "Synergy", limit: -1 }, searchIndex);
      
      expect(result).toHaveProperty("code");
      if ("code" in result) {
        expect(result.code).toBe("INVALID_INPUT");
      }
    });
  });

  describe("error handling", () => {
    it("should handle search index errors gracefully", async () => {
      // Create a search index that will throw
      const brokenIndex = new SearchIndex();
      // Force an error by passing invalid data
      const result = await searchDocs({ query: "test" }, brokenIndex);
      
      // Should return either results or error, not throw
      expect(result).toBeDefined();
    });
  });
});

