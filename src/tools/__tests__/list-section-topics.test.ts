/**
 * Tests for list_section_topics tool
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { listSectionTopics } from "../list-section-topics.js";
import type { DocProvider, Topic } from "../../types.js";

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
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("list_section_topics tool", () => {
  let mockProvider: DocProvider;

  const mockTopics: Topic[] = [
    {
      id: "language/introduction",
      version: "latest",
      title: "Introduction",
      section: "Language",
      path: ["Language", "Introduction"],
      summary: "Introduction to Synergy",
      body_chunks: [],
      links: [],
      url: "https://example.com/language/introduction",
      source: "online",
    },
    {
      id: "language/variables",
      version: "latest",
      title: "Variables",
      section: "Language",
      path: ["Language", "Variables"],
      summary: "Variable declarations",
      body_chunks: [],
      links: [],
      url: "https://example.com/language/variables",
      source: "online",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("successful cases", () => {
    it("should list topics in a section", async () => {
      mockProvider = {
        getSource: () => "online",
        listTopics: vi.fn(async () => mockTopics),
        fetchTopic: vi.fn(),
        getAvailableVersions: vi.fn(),
        getAvailableSections: vi.fn(),
      } as unknown as DocProvider;

      const result = await listSectionTopics(
        { section: "Language" },
        mockProvider
      );

      expect(Array.isArray(result)).toBe(true);
      if (Array.isArray(result)) {
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
          topic_id: "language/introduction",
          title: "Introduction",
          url: "https://example.com/language/introduction",
          summary: "Introduction to Synergy",
        });
        expect(result[1]).toEqual({
          topic_id: "language/variables",
          title: "Variables",
          url: "https://example.com/language/variables",
          summary: "Variable declarations",
        });
      }
    });

    it("should use default version if not provided", async () => {
      const listTopicsSpy = vi.fn(async () => mockTopics);
      mockProvider = {
        getSource: () => "online",
        listTopics: listTopicsSpy,
        fetchTopic: vi.fn(),
        getAvailableVersions: vi.fn(),
        getAvailableSections: vi.fn(),
      } as unknown as DocProvider;

      await listSectionTopics({ section: "Language" }, mockProvider);

      expect(listTopicsSpy).toHaveBeenCalledWith("Language", "latest", 50);
    });

    it("should use custom version if provided", async () => {
      const listTopicsSpy = vi.fn(async () => mockTopics);
      mockProvider = {
        getSource: () => "online",
        listTopics: listTopicsSpy,
        fetchTopic: vi.fn(),
        getAvailableVersions: vi.fn(),
        getAvailableSections: vi.fn(),
      } as unknown as DocProvider;

      await listSectionTopics(
        { section: "Language", version: "v111" },
        mockProvider
      );

      expect(listTopicsSpy).toHaveBeenCalledWith("Language", "v111", 50);
    });

    it("should use custom limit if provided", async () => {
      const listTopicsSpy = vi.fn(async () => mockTopics);
      mockProvider = {
        getSource: () => "online",
        listTopics: listTopicsSpy,
        fetchTopic: vi.fn(),
        getAvailableVersions: vi.fn(),
        getAvailableSections: vi.fn(),
      } as unknown as DocProvider;

      await listSectionTopics(
        { section: "Language", limit: 10 },
        mockProvider
      );

      expect(listTopicsSpy).toHaveBeenCalledWith("Language", "latest", 10);
    });

    it("should handle limit of 0 (no limit)", async () => {
      const listTopicsSpy = vi.fn(async () => mockTopics);
      mockProvider = {
        getSource: () => "online",
        listTopics: listTopicsSpy,
        fetchTopic: vi.fn(),
        getAvailableVersions: vi.fn(),
        getAvailableSections: vi.fn(),
      } as unknown as DocProvider;

      await listSectionTopics(
        { section: "Language", limit: 0 },
        mockProvider
      );

      expect(listTopicsSpy).toHaveBeenCalledWith("Language", "latest", 0);
    });

    it("should handle empty topic list", async () => {
      mockProvider = {
        getSource: () => "online",
        listTopics: vi.fn(async () => []),
        fetchTopic: vi.fn(),
        getAvailableVersions: vi.fn(),
        getAvailableSections: vi.fn(),
      } as unknown as DocProvider;

      const result = await listSectionTopics(
        { section: "NonexistentSection" },
        mockProvider
      );

      expect(Array.isArray(result)).toBe(true);
      if (Array.isArray(result)) {
        expect(result).toHaveLength(0);
      }
    });
  });

  describe("input validation", () => {
    beforeEach(() => {
      mockProvider = {
        getSource: () => "online",
        listTopics: vi.fn(),
        fetchTopic: vi.fn(),
        getAvailableVersions: vi.fn(),
        getAvailableSections: vi.fn(),
      } as unknown as DocProvider;
    });

    it("should return error for missing section", async () => {
      const result = await listSectionTopics(
        { section: "" },
        mockProvider
      );

      expect(result).toHaveProperty("code");
      if ("code" in result) {
        expect(result.code).toBe("INVALID_INPUT");
        expect(result.message).toContain("section");
      }
    });

    it("should return error for non-string section", async () => {
      const result = await listSectionTopics(
        { section: null as any },
        mockProvider
      );

      expect(result).toHaveProperty("code");
      if ("code" in result) {
        expect(result.code).toBe("INVALID_INPUT");
        expect(result.message).toContain("section");
      }
    });

    it("should return error for negative limit", async () => {
      const result = await listSectionTopics(
        { section: "Language", limit: -1 },
        mockProvider
      );

      expect(result).toHaveProperty("code");
      if ("code" in result) {
        expect(result.code).toBe("INVALID_INPUT");
        expect(result.message).toContain("limit");
        expect(result.message).toContain("non-negative");
      }
    });
  });

  describe("error handling", () => {
    it("should return provider error when listTopics fails", async () => {
      mockProvider = {
        getSource: () => "online",
        listTopics: vi.fn(async () => {
          throw new Error("Network error");
        }),
        fetchTopic: vi.fn(),
        getAvailableVersions: vi.fn(),
        getAvailableSections: vi.fn(async () => ["Language", "Reference"]),
      } as unknown as DocProvider;

      const result = await listSectionTopics(
        { section: "NonexistentSection" },
        mockProvider
      );

      expect(result).toHaveProperty("code");
      if ("code" in result) {
        expect(result.code).toBe("PROVIDER_ERROR");
        expect(result.message).toContain("Network error");
        expect(result.details).toHaveProperty("available_sections");
        expect(result.details?.available_sections).toEqual(["Language", "Reference"]);
      }
    });

    it("should handle error getting available sections", async () => {
      mockProvider = {
        getSource: () => "online",
        listTopics: vi.fn(async () => {
          throw new Error("Section not found");
        }),
        fetchTopic: vi.fn(),
        getAvailableVersions: vi.fn(),
        getAvailableSections: vi.fn(async () => {
          throw new Error("Cannot get sections");
        }),
      } as unknown as DocProvider;

      const result = await listSectionTopics(
        { section: "InvalidSection" },
        mockProvider
      );

      expect(result).toHaveProperty("code");
      if ("code" in result) {
        expect(result.code).toBe("PROVIDER_ERROR");
        // Should not have available_sections in details if getSections failed
        expect(result.details?.available_sections).toBeUndefined();
      }
    });

    it("should handle non-Error exceptions", async () => {
      mockProvider = {
        getSource: () => "online",
        listTopics: vi.fn(async () => {
          throw "string error";
        }),
        fetchTopic: vi.fn(),
        getAvailableVersions: vi.fn(),
        getAvailableSections: vi.fn(),
      } as unknown as DocProvider;

      const result = await listSectionTopics(
        { section: "Language" },
        mockProvider
      );

      expect(result).toHaveProperty("code");
      if ("code" in result) {
        expect(result.code).toBe("SECTION_NOT_FOUND");
      }
    });

    it("should handle unexpected errors", async () => {
      mockProvider = {
        getSource: () => {
          throw new Error("Unexpected error");
        },
        listTopics: vi.fn(),
        fetchTopic: vi.fn(),
        getAvailableVersions: vi.fn(),
        getAvailableSections: vi.fn(),
      } as unknown as DocProvider;

      const result = await listSectionTopics(
        { section: "Language" },
        mockProvider
      );

      expect(result).toHaveProperty("code");
      if ("code" in result) {
        expect(result.code).toBe("INTERNAL_ERROR");
        expect(result.message).toContain("Failed to list section topics");
      }
    });
  });
});
