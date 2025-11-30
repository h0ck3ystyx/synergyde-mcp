/**
 * Unit tests for error handling utilities
 */

import { describe, it, expect } from "vitest";
import {
  ErrorCode,
  createError,
  invalidInputError,
  topicNotFoundError,
  sectionNotFoundError,
  versionNotFoundError,
  networkError,
  parseError,
  cacheError,
  providerError,
  internalError,
  errorToPayload,
} from "../errors.js";
import type { ErrorPayload } from "../../../types.js";

describe("Error Utilities", () => {
  describe("createError", () => {
    it("should create a basic error payload", () => {
      const error = createError(ErrorCode.INVALID_INPUT, "Test error");
      expect(error).toEqual({
        code: "INVALID_INPUT",
        message: "Test error",
        details: undefined,
        retryable: false,
      });
    });

    it("should include details when provided", () => {
      const error = createError(
        ErrorCode.NETWORK_ERROR,
        "Network failed",
        { url: "https://example.com", status: 500 },
        true
      );
      expect(error).toEqual({
        code: "NETWORK_ERROR",
        message: "Network failed",
        details: { url: "https://example.com", status: 500 },
        retryable: true,
      });
    });

    it("should set retryable flag", () => {
      const error = createError(ErrorCode.NETWORK_ERROR, "Retryable error", undefined, true);
      expect(error.retryable).toBe(true);
    });
  });

  describe("invalidInputError", () => {
    it("should create invalid input error", () => {
      const error = invalidInputError("query", "", "must be non-empty");
      expect(error.code).toBe(ErrorCode.INVALID_INPUT);
      expect(error.message).toContain("Invalid input for query");
      expect(error.message).toContain("must be non-empty");
      expect(error.details?.field).toBe("query");
      expect(error.details?.value).toBe("");
      expect(error.retryable).toBe(false);
    });

    it("should work without reason", () => {
      const error = invalidInputError("limit", -1);
      expect(error.message).toContain("Invalid input for limit");
      expect(error.details?.field).toBe("limit");
      expect(error.details?.value).toBe(-1);
    });
  });

  describe("topicNotFoundError", () => {
    it("should create topic not found error", () => {
      const error = topicNotFoundError("topic1", "v111");
      expect(error.code).toBe(ErrorCode.TOPIC_NOT_FOUND);
      expect(error.message).toContain("Topic not found: topic1");
      expect(error.message).toContain("version: v111");
      expect(error.details?.topic_id).toBe("topic1");
      expect(error.details?.version).toBe("v111");
      expect(error.retryable).toBe(false);
    });

    it("should work without version", () => {
      const error = topicNotFoundError("topic1");
      expect(error.message).toContain("Topic not found: topic1");
      expect(error.message).not.toContain("version");
      expect(error.details?.topic_id).toBe("topic1");
    });

    it("should include additional details", () => {
      const error = topicNotFoundError("topic1", "v111", { provider: "online" });
      expect(error.details?.topic_id).toBe("topic1");
      expect(error.details?.version).toBe("v111");
      expect(error.details?.provider).toBe("online");
    });
  });

  describe("sectionNotFoundError", () => {
    it("should create section not found error", () => {
      const error = sectionNotFoundError("Language", "v111", ["Reference", "Getting Started"]);
      expect(error.code).toBe(ErrorCode.SECTION_NOT_FOUND);
      expect(error.message).toContain("Section not found: Language");
      expect(error.message).toContain("version: v111");
      expect(error.details?.section).toBe("Language");
      expect(error.details?.version).toBe("v111");
      expect(error.details?.available_sections).toEqual(["Reference", "Getting Started"]);
      expect(error.retryable).toBe(false);
    });

    it("should work without version or available sections", () => {
      const error = sectionNotFoundError("Language");
      expect(error.message).toContain("Section not found: Language");
      expect(error.details?.section).toBe("Language");
    });
  });

  describe("versionNotFoundError", () => {
    it("should create version not found error", () => {
      const error = versionNotFoundError("v999", ["v111", "v112"]);
      expect(error.code).toBe(ErrorCode.VERSION_NOT_FOUND);
      expect(error.message).toContain("Version not found: v999");
      expect(error.details?.version).toBe("v999");
      expect(error.details?.available_versions).toEqual(["v111", "v112"]);
      expect(error.retryable).toBe(false);
    });

    it("should work without available versions", () => {
      const error = versionNotFoundError("v999");
      expect(error.message).toContain("Version not found: v999");
      expect(error.details?.version).toBe("v999");
    });
  });

  describe("networkError", () => {
    it("should create network error with retryable true by default", () => {
      const error = networkError("https://example.com", "Connection timeout");
      expect(error.code).toBe(ErrorCode.NETWORK_ERROR);
      expect(error.message).toContain("Network error fetching https://example.com");
      expect(error.message).toContain("Connection timeout");
      expect(error.details?.url).toBe("https://example.com");
      expect(error.details?.reason).toBe("Connection timeout");
      expect(error.retryable).toBe(true);
    });

    it("should allow setting retryable to false", () => {
      const error = networkError("https://example.com", "404 Not Found", false);
      expect(error.retryable).toBe(false);
    });

    it("should work without reason", () => {
      const error = networkError("https://example.com");
      expect(error.message).toContain("Network error fetching https://example.com");
      expect(error.details?.url).toBe("https://example.com");
    });
  });

  describe("parseError", () => {
    it("should create parse error", () => {
      const error = parseError("HTML parsing", "Invalid structure", { line: 42 });
      expect(error.code).toBe(ErrorCode.PARSE_ERROR);
      expect(error.message).toContain("Parse error during HTML parsing");
      expect(error.message).toContain("Invalid structure");
      expect(error.details?.operation).toBe("HTML parsing");
      expect(error.details?.reason).toBe("Invalid structure");
      expect(error.details?.line).toBe(42);
      expect(error.retryable).toBe(false);
    });

    it("should work without reason or details", () => {
      const error = parseError("JSON parsing");
      expect(error.message).toContain("Parse error during JSON parsing");
      expect(error.details?.operation).toBe("JSON parsing");
    });
  });

  describe("cacheError", () => {
    it("should create cache error with retryable true by default", () => {
      const error = cacheError("read", "Permission denied");
      expect(error.code).toBe(ErrorCode.CACHE_ERROR);
      expect(error.message).toContain("Cache error during read");
      expect(error.message).toContain("Permission denied");
      expect(error.details?.operation).toBe("read");
      expect(error.details?.reason).toBe("Permission denied");
      expect(error.retryable).toBe(true);
    });

    it("should allow setting retryable to false", () => {
      const error = cacheError("write", "Disk full", false);
      expect(error.retryable).toBe(false);
    });
  });

  describe("providerError", () => {
    it("should create provider error", () => {
      const error = providerError("online", "Timeout", { url: "https://example.com" });
      expect(error.code).toBe(ErrorCode.PROVIDER_ERROR);
      expect(error.message).toContain("Provider error (online)");
      expect(error.message).toContain("Timeout");
      expect(error.details?.provider).toBe("online");
      expect(error.details?.reason).toBe("Timeout");
      expect(error.details?.url).toBe("https://example.com");
      expect(error.retryable).toBe(false);
    });

    it("should work without reason or details", () => {
      const error = providerError("local");
      expect(error.message).toContain("Provider error (local)");
      expect(error.details?.provider).toBe("local");
    });
  });

  describe("internalError", () => {
    it("should create internal error", () => {
      const error = internalError("Unexpected state", { component: "parser" });
      expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(error.message).toContain("Internal error: Unexpected state");
      expect(error.details?.component).toBe("parser");
      expect(error.retryable).toBe(false);
    });

    it("should work without details", () => {
      const error = internalError("Unexpected error");
      expect(error.message).toContain("Internal error: Unexpected error");
    });
  });

  describe("errorToPayload", () => {
    it("should convert Error object to payload", () => {
      const error = new Error("Test error");
      error.stack = "Error: Test error\n    at test.js:1:1";
      const payload = errorToPayload(error, { context: "test" });
      expect(payload.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(payload.message).toBe("Test error");
      expect(payload.details?.name).toBe("Error");
      expect(payload.details?.stack).toBeDefined();
      expect(payload.details?.context).toBe("test");
      expect(payload.retryable).toBe(false);
    });

    it("should handle non-Error values", () => {
      const payload = errorToPayload("String error", { context: "test" });
      expect(payload.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(payload.message).toBe("String error");
      expect(payload.details?.context).toBe("test");
    });

    it("should handle null/undefined", () => {
      const payload1 = errorToPayload(null);
      expect(payload1.message).toBe("null");

      const payload2 = errorToPayload(undefined);
      expect(payload2.message).toBe("undefined");
    });

    it("should handle objects", () => {
      const payload = errorToPayload({ message: "Object error" });
      expect(payload.message).toContain("Object error");
    });
  });

  describe("ErrorCode enum", () => {
    it("should have all expected error codes", () => {
      expect(ErrorCode.INVALID_INPUT).toBe("INVALID_INPUT");
      expect(ErrorCode.TOPIC_NOT_FOUND).toBe("TOPIC_NOT_FOUND");
      expect(ErrorCode.SECTION_NOT_FOUND).toBe("SECTION_NOT_FOUND");
      expect(ErrorCode.VERSION_NOT_FOUND).toBe("VERSION_NOT_FOUND");
      expect(ErrorCode.NETWORK_ERROR).toBe("NETWORK_ERROR");
      expect(ErrorCode.PARSE_ERROR).toBe("PARSE_ERROR");
      expect(ErrorCode.CACHE_ERROR).toBe("CACHE_ERROR");
      expect(ErrorCode.PROVIDER_ERROR).toBe("PROVIDER_ERROR");
      expect(ErrorCode.INTERNAL_ERROR).toBe("INTERNAL_ERROR");
    });
  });
});

