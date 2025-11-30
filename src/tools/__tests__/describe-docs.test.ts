/**
 * Tests for describe_docs tool
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { describeDocs } from "../describe-docs.js";
import type { DocProvider } from "../../types.js";

// Mock logger
vi.mock("../../lib/utils/logger.js", () => ({
  logger: {
    logToolInvocation: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("describe_docs tool", () => {
  let mockProvider: DocProvider;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("successful cases", () => {
    it("should return metadata with versions and sections", async () => {
      mockProvider = {
        getSource: () => "online",
        getAvailableVersions: vi.fn(async () => ["latest", "v111", "v103"]),
        getAvailableSections: vi.fn(async () => ["Language", "Reference", "Tools"]),
        fetchTopic: vi.fn(),
        listTopics: vi.fn(),
      } as unknown as DocProvider;

      const result = await describeDocs(mockProvider);

      expect(result).toHaveProperty("versions");
      expect(result).toHaveProperty("sections");
      expect(result).toHaveProperty("source");

      if ("versions" in result) {
        expect(result.versions).toEqual(["latest", "v111", "v103"]);
        expect(result.sections).toEqual(["Language", "Reference", "Tools"]);
        expect(result.source).toBe("online");
      }
    });

    it("should use first version when getting sections", async () => {
      const getSectionsSpy = vi.fn(async () => ["Language"]);
      mockProvider = {
        getSource: () => "local",
        getAvailableVersions: vi.fn(async () => ["latest", "v111"]),
        getAvailableSections: getSectionsSpy,
        fetchTopic: vi.fn(),
        listTopics: vi.fn(),
      } as unknown as DocProvider;

      await describeDocs(mockProvider);

      expect(getSectionsSpy).toHaveBeenCalledWith("latest");
    });

    it("should return partial data if versions call fails", async () => {
      mockProvider = {
        getSource: () => "online",
        getAvailableVersions: vi.fn(async () => {
          throw new Error("Network error");
        }),
        getAvailableSections: vi.fn(async () => ["Language", "Reference"]),
        fetchTopic: vi.fn(),
        listTopics: vi.fn(),
      } as unknown as DocProvider;

      const result = await describeDocs(mockProvider);

      expect(result).toHaveProperty("versions");
      expect(result).toHaveProperty("sections");

      if ("versions" in result) {
        expect(result.versions).toEqual([]);
        expect(result.sections).toEqual(["Language", "Reference"]);
        expect(result.source).toBe("online");
      }
    });

    it("should return partial data if sections call fails", async () => {
      mockProvider = {
        getSource: () => "hybrid",
        getAvailableVersions: vi.fn(async () => ["latest", "v111"]),
        getAvailableSections: vi.fn(async () => {
          throw new Error("Not found");
        }),
        fetchTopic: vi.fn(),
        listTopics: vi.fn(),
      } as unknown as DocProvider;

      const result = await describeDocs(mockProvider);

      expect(result).toHaveProperty("versions");
      expect(result).toHaveProperty("sections");

      if ("versions" in result) {
        expect(result.versions).toEqual(["latest", "v111"]);
        expect(result.sections).toEqual([]);
        expect(result.source).toBe("hybrid");
      }
    });
  });

  describe("error cases", () => {
    it("should return error if both calls fail", async () => {
      mockProvider = {
        getSource: () => "online",
        getAvailableVersions: vi.fn(async () => {
          throw new Error("Network error");
        }),
        getAvailableSections: vi.fn(async () => {
          throw new Error("Network error");
        }),
        fetchTopic: vi.fn(),
        listTopics: vi.fn(),
      } as unknown as DocProvider;

      const result = await describeDocs(mockProvider);

      expect(result).toHaveProperty("code");

      if ("code" in result) {
        expect(result.code).toBe("PROVIDER_ERROR");
        expect(result.message).toContain("Network error");
        expect(result.details).toHaveProperty("failed_operations");
        // providerError sets retryable to false by default
        expect(result.retryable).toBe(false);
      }
    });

    it("should handle unexpected errors", async () => {
      // Create a provider that throws during getAvailableVersions
      mockProvider = {
        getSource: () => "online",
        getAvailableVersions: vi.fn(async () => {
          // Throw an unexpected object (not Error)
          throw { unexpected: "error object" };
        }),
        getAvailableSections: vi.fn(async () => {
          throw { unexpected: "error object" };
        }),
        fetchTopic: vi.fn(),
        listTopics: vi.fn(),
      } as unknown as DocProvider;

      const result = await describeDocs(mockProvider);

      expect(result).toHaveProperty("code");

      if ("code" in result) {
        expect(result.code).toBe("PROVIDER_ERROR");
      }
    });

    it("should handle non-Error exceptions", async () => {
      mockProvider = {
        getSource: () => "online",
        getAvailableVersions: vi.fn(async () => {
          throw "string error";
        }),
        getAvailableSections: vi.fn(async () => {
          throw { custom: "error" };
        }),
        fetchTopic: vi.fn(),
        listTopics: vi.fn(),
      } as unknown as DocProvider;

      const result = await describeDocs(mockProvider);

      expect(result).toHaveProperty("code");

      if ("code" in result) {
        expect(result.code).toBe("PROVIDER_ERROR");
      }
    });
  });

  describe("edge cases", () => {
    it("should handle empty versions array", async () => {
      mockProvider = {
        getSource: () => "local",
        getAvailableVersions: vi.fn(async () => []),
        getAvailableSections: vi.fn(async () => ["Language"]),
        fetchTopic: vi.fn(),
        listTopics: vi.fn(),
      } as unknown as DocProvider;

      const result = await describeDocs(mockProvider);

      if ("versions" in result) {
        expect(result.versions).toEqual([]);
        expect(result.sections).toEqual(["Language"]);
      }
    });

    it("should handle empty sections array", async () => {
      mockProvider = {
        getSource: () => "local",
        getAvailableVersions: vi.fn(async () => ["latest"]),
        getAvailableSections: vi.fn(async () => []),
        fetchTopic: vi.fn(),
        listTopics: vi.fn(),
      } as unknown as DocProvider;

      const result = await describeDocs(mockProvider);

      if ("versions" in result) {
        expect(result.versions).toEqual(["latest"]);
        expect(result.sections).toEqual([]);
      }
    });

    it("should pass undefined version to getSections if versions is empty", async () => {
      const getSectionsSpy = vi.fn(async () => ["Language"]);
      mockProvider = {
        getSource: () => "local",
        getAvailableVersions: vi.fn(async () => []),
        getAvailableSections: getSectionsSpy,
        fetchTopic: vi.fn(),
        listTopics: vi.fn(),
      } as unknown as DocProvider;

      await describeDocs(mockProvider);

      expect(getSectionsSpy).toHaveBeenCalledWith(undefined);
    });
  });
});
