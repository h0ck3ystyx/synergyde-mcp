/**
 * Unit tests for the search index
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

import { SearchIndex } from "../index.js";
import type { Topic } from "../../../types.js";

describe("SearchIndex", () => {
  let searchIndex: SearchIndex;

  const mockTopic1: Topic = {
    id: "topic1",
    version: "v111",
    title: "Introduction to Synergy",
    section: "getting-started",
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
    version: "v111",
    title: "Advanced Data Structures",
    section: "advanced",
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

  const mockTopic3: Topic = {
    id: "topic3",
    version: "v1033",
    title: "Synergy Basics",
    section: "getting-started",
    path: ["basics"],
    summary: "Fundamental concepts of Synergy",
    body_chunks: [
      {
        topic_id: "topic3",
        chunk_index: 0,
        text: "Understanding the basics is crucial for mastering Synergy.",
      },
    ],
    links: [],
    url: "https://example.com/topic3",
    source: "local",
  };

  beforeEach(() => {
    searchIndex = new SearchIndex();
  });

  describe("addTopic", () => {
    it("should add a topic to the index", () => {
      searchIndex.addTopic(mockTopic1);

      const results = searchIndex.search("Synergy");
      expect(results).toHaveLength(1);
      expect(results[0].topic_id).toBe("topic1");
    });

    it("should index title, summary, and body text", () => {
      searchIndex.addTopic(mockTopic1);

      // Search by title
      expect(searchIndex.search("Introduction")).toHaveLength(1);

      // Search by summary
      expect(searchIndex.search("basics")).toHaveLength(1);

      // Search by body text
      expect(searchIndex.search("powerful")).toHaveLength(1);
    });

    it("should handle multiple topics", () => {
      searchIndex.addTopic(mockTopic1);
      searchIndex.addTopic(mockTopic2);

      const results = searchIndex.search("Synergy");
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it("should handle topics with multiple body chunks", () => {
      const topicWithMultipleChunks: Topic = {
        ...mockTopic1,
        body_chunks: [
          {
            topic_id: "topic1",
            chunk_index: 0,
            text: "First chunk with important keywords",
          },
          {
            topic_id: "topic1",
            chunk_index: 1,
            text: "Second chunk with more content",
          },
        ],
      };

      searchIndex.addTopic(topicWithMultipleChunks);

      const results = searchIndex.search("keywords");
      expect(results).toHaveLength(1);
    });

    it("should handle empty body chunks", () => {
      const topicWithEmptyChunks: Topic = {
        ...mockTopic1,
        body_chunks: [],
      };

      searchIndex.addTopic(topicWithEmptyChunks);

      // Should still be searchable by title and summary
      const results = searchIndex.search("Introduction");
      expect(results).toHaveLength(1);
    });
  });

  describe("search", () => {
    beforeEach(() => {
      searchIndex.addTopic(mockTopic1);
      searchIndex.addTopic(mockTopic2);
      searchIndex.addTopic(mockTopic3);
    });

    it("should return empty array for no matches", () => {
      const results = searchIndex.search("nonexistentterm");
      expect(results).toEqual([]);
    });

    it("should return results with relevance scores", () => {
      const results = searchIndex.search("Synergy");
      expect(results.length).toBeGreaterThan(0);
      results.forEach((result) => {
        expect(result.score).toBeDefined();
        expect(typeof result.score).toBe("number");
        expect(result.score!).toBeGreaterThan(0);
      });
    });

    it("should rank results by relevance", () => {
      const results = searchIndex.search("Synergy");
      expect(results.length).toBeGreaterThan(1);

      // Results should be sorted by score (highest first)
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score!).toBeGreaterThanOrEqual(results[i].score!);
      }
    });

    it("should filter by version", () => {
      const results = searchIndex.search("Synergy", "v111");
      expect(results.length).toBeGreaterThan(0);
      results.forEach((result) => {
        expect(result.version).toBe("v111");
      });
    });

    it("should filter by section", () => {
      const results = searchIndex.search("Synergy", undefined, "getting-started");
      expect(results.length).toBeGreaterThan(0);
      results.forEach((result) => {
        expect(result.section).toBe("getting-started");
      });
    });

    it("should filter by both version and section", () => {
      const results = searchIndex.search("Synergy", "v111", "getting-started");
      expect(results.length).toBeGreaterThan(0);
      results.forEach((result) => {
        expect(result.version).toBe("v111");
        expect(result.section).toBe("getting-started");
      });
    });

    it("should respect limit parameter", () => {
      const results = searchIndex.search("Synergy", undefined, undefined, 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it("should return empty array when limit is 0", () => {
      const results = searchIndex.search("Synergy", undefined, undefined, 0);
      expect(results).toEqual([]);
    });

    it("should clamp negative limit values to 0", () => {
      const results = searchIndex.search("Synergy", undefined, undefined, -5);
      expect(results).toEqual([]);
    });

    it("should return all results if limit is not specified", () => {
      const results = searchIndex.search("Synergy");
      expect(results.length).toBeGreaterThan(0);
    });

    it("should handle case-insensitive search", () => {
      const results1 = searchIndex.search("synergy");
      const results2 = searchIndex.search("SYNERGY");
      const results3 = searchIndex.search("Synergy");

      expect(results1.length).toBe(results2.length);
      expect(results2.length).toBe(results3.length);
    });

    it("should handle multi-word queries", () => {
      const results = searchIndex.search("data structures");
      expect(results.length).toBeGreaterThan(0);
    });

    it("should return SearchResult format", () => {
      const results = searchIndex.search("Synergy", undefined, undefined, 1);
      if (results.length > 0) {
        const result = results[0];
        expect(result).toHaveProperty("topic_id");
        expect(result).toHaveProperty("title");
        expect(result).toHaveProperty("section");
        expect(result).toHaveProperty("version");
        expect(result).toHaveProperty("url");
        expect(result).toHaveProperty("summary");
        expect(result).toHaveProperty("source");
        expect(result).toHaveProperty("score");
      }
    });
  });

  describe("clear", () => {
    it("should remove all topics from the index", () => {
      searchIndex.addTopic(mockTopic1);
      searchIndex.addTopic(mockTopic2);

      expect(searchIndex.search("Synergy").length).toBeGreaterThan(0);

      searchIndex.clear();

      expect(searchIndex.search("Synergy")).toEqual([]);
    });

    it("should allow adding topics after clearing", () => {
      searchIndex.addTopic(mockTopic1);
      searchIndex.clear();
      searchIndex.addTopic(mockTopic2);

      const results = searchIndex.search("Data");
      expect(results).toHaveLength(1);
    });
  });

  describe("term frequency scoring", () => {
    it("should give higher scores to topics with more term occurrences", () => {
      const topicWithManyMatches: Topic = {
        ...mockTopic1,
        title: "Synergy Synergy Synergy",
        summary: "Synergy is great. Synergy is powerful.",
        body_chunks: [
          {
            topic_id: "topic1",
            chunk_index: 0,
            text: "Synergy Synergy Synergy Synergy",
          },
        ],
      };

      const topicWithFewMatches: Topic = {
        ...mockTopic2,
        title: "Data Structures",
        summary: "Synergy can be used here",
        body_chunks: [
          {
            topic_id: "topic2",
            chunk_index: 0,
            text: "Some content about Synergy",
          },
        ],
      };

      searchIndex.addTopic(topicWithManyMatches);
      searchIndex.addTopic(topicWithFewMatches);

      const results = searchIndex.search("Synergy");
      expect(results.length).toBe(2);
      // Topic with more matches should have higher score
      expect(results[0].topic_id).toBe("topic1");
    });

    it("should weight title matches higher than body matches", () => {
      const titleMatch: Topic = {
        ...mockTopic1,
        title: "Synergy Programming",
        summary: "Some other content",
        body_chunks: [
          {
            topic_id: "topic1",
            chunk_index: 0,
            text: "Other content here",
          },
        ],
      };

      const bodyMatch: Topic = {
        ...mockTopic2,
        title: "Other Topic",
        summary: "Some content",
        body_chunks: [
          {
            topic_id: "topic2",
            chunk_index: 0,
            text: "Synergy is mentioned here in the body",
          },
        ],
      };

      searchIndex.addTopic(titleMatch);
      searchIndex.addTopic(bodyMatch);

      const results = searchIndex.search("Synergy");
      expect(results.length).toBe(2);
      // Title match should rank higher
      expect(results[0].topic_id).toBe("topic1");
    });
  });

  describe("edge cases", () => {
    it("should handle empty search query", () => {
      searchIndex.addTopic(mockTopic1);
      const results = searchIndex.search("");
      expect(results).toEqual([]);
    });

    it("should handle search with only whitespace", () => {
      searchIndex.addTopic(mockTopic1);
      const results = searchIndex.search("   ");
      expect(results).toEqual([]);
    });

    it("should handle topics with special characters", () => {
      const topicWithSpecialChars: Topic = {
        ...mockTopic1,
        title: "C++ & Java Integration",
        summary: "Using @ symbols and #hashtags",
        body_chunks: [
          {
            topic_id: "topic1",
            chunk_index: 0,
            text: "Special chars: < > & \" '",
          },
        ],
      };

      searchIndex.addTopic(topicWithSpecialChars);

      const results = searchIndex.search("Integration");
      expect(results).toHaveLength(1);
    });

    it("should preserve programming language names in tokenization", () => {
      const cppTopic: Topic = {
        ...mockTopic1,
        title: "C++ Programming Guide",
        summary: "Learn C++ syntax",
        body_chunks: [
          {
            topic_id: "topic1",
            chunk_index: 0,
            text: "C++ is a powerful language",
          },
        ],
      };

      const csharpTopic: Topic = {
        ...mockTopic2,
        title: "C# Development",
        summary: "C# programming basics",
        body_chunks: [
          {
            topic_id: "topic2",
            chunk_index: 0,
            text: "C# is a modern language",
          },
        ],
      };

      const dotnetTopic: Topic = {
        ...mockTopic3,
        title: ".NET Framework",
        summary: ".NET platform overview",
        body_chunks: [
          {
            topic_id: "topic3",
            chunk_index: 0,
            text: ".NET provides a comprehensive platform",
          },
        ],
      };

      searchIndex.addTopic(cppTopic);
      searchIndex.addTopic(csharpTopic);
      searchIndex.addTopic(dotnetTopic);

      // Should find C++ topic when searching for "c-plus-plus"
      const cppResults = searchIndex.search("c-plus-plus");
      expect(cppResults.length).toBeGreaterThan(0);
      expect(cppResults[0].title).toContain("C++");

      // Should find C# topic when searching for "c-sharp"
      const csharpResults = searchIndex.search("c-sharp");
      expect(csharpResults.length).toBeGreaterThan(0);
      expect(csharpResults[0].title).toContain("C#");

      // Should find .NET topic when searching for "dot-net"
      const dotnetResults = searchIndex.search("dot-net");
      expect(dotnetResults.length).toBeGreaterThan(0);
      expect(dotnetResults[0].title).toContain(".NET");
    });

    it("should handle very long queries", () => {
      searchIndex.addTopic(mockTopic1);
      const longQuery = "a ".repeat(1000) + "Synergy";
      const results = searchIndex.search(longQuery);
      expect(results.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("version isolation", () => {
    it("should index topics with same ID but different versions separately", () => {
      const topicV111: Topic = {
        ...mockTopic1,
        id: "same-topic",
        version: "v111",
        title: "Topic in v111",
      };

      const topicV112: Topic = {
        ...mockTopic1,
        id: "same-topic",
        version: "v112",
        title: "Topic in v112",
      };

      searchIndex.addTopic(topicV111);
      searchIndex.addTopic(topicV112);

      // Both versions should be searchable
      const v111Results = searchIndex.search("Topic", "v111");
      const v112Results = searchIndex.search("Topic", "v112");

      expect(v111Results).toHaveLength(1);
      expect(v111Results[0].version).toBe("v111");
      expect(v111Results[0].title).toBe("Topic in v111");

      expect(v112Results).toHaveLength(1);
      expect(v112Results[0].version).toBe("v112");
      expect(v112Results[0].title).toBe("Topic in v112");
    });

    it("should not overwrite topics when same ID is indexed for different versions", () => {
      const topicV111: Topic = {
        ...mockTopic1,
        id: "shared-topic",
        version: "v111",
      };

      const topicV112: Topic = {
        ...mockTopic2,
        id: "shared-topic",
        version: "v112",
      };

      searchIndex.addTopic(topicV111);
      searchIndex.addTopic(topicV112);

      // Searching without version filter should return both
      const allResults = searchIndex.search("Synergy");
      const sharedTopics = allResults.filter((r) => r.topic_id === "shared-topic");
      expect(sharedTopics.length).toBe(2);
      expect(sharedTopics.map((r) => r.version).sort()).toEqual(["v111", "v112"]);
    });
  });
});

