/**
 * Error handling utilities with standardized error payloads
 */

import type { ErrorPayload } from "../../types.js";

/**
 * Standard error codes
 */
export enum ErrorCode {
  INVALID_INPUT = "INVALID_INPUT",
  TOPIC_NOT_FOUND = "TOPIC_NOT_FOUND",
  SECTION_NOT_FOUND = "SECTION_NOT_FOUND",
  VERSION_NOT_FOUND = "VERSION_NOT_FOUND",
  NETWORK_ERROR = "NETWORK_ERROR",
  PARSE_ERROR = "PARSE_ERROR",
  CACHE_ERROR = "CACHE_ERROR",
  PROVIDER_ERROR = "PROVIDER_ERROR",
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

/**
 * Create a standardized error payload
 */
export function createError(
  code: ErrorCode | string,
  message: string,
  details?: Record<string, unknown>,
  retryable: boolean = false
): ErrorPayload {
  return {
    code,
    message,
    details,
    retryable,
  };
}

/**
 * Create an error for invalid input
 */
export function invalidInputError(
  field: string,
  value: unknown,
  reason?: string
): ErrorPayload {
  return createError(
    ErrorCode.INVALID_INPUT,
    `Invalid input for ${field}: ${String(value)}${reason ? ` (${reason})` : ""}`,
    { field, value, reason },
    false
  );
}

/**
 * Create an error for topic not found
 */
export function topicNotFoundError(
  topicId: string,
  version?: string,
  details?: Record<string, unknown>
): ErrorPayload {
  return createError(
    ErrorCode.TOPIC_NOT_FOUND,
    `Topic not found: ${topicId}${version ? ` (version: ${version})` : ""}`,
    {
      topic_id: topicId,
      version,
      ...details,
    },
    false
  );
}

/**
 * Create an error for section not found
 */
export function sectionNotFoundError(
  section: string,
  version?: string,
  availableSections?: string[]
): ErrorPayload {
  return createError(
    ErrorCode.SECTION_NOT_FOUND,
    `Section not found: ${section}${version ? ` (version: ${version})` : ""}`,
    {
      section,
      version,
      available_sections: availableSections,
    },
    false
  );
}

/**
 * Create an error for version not found
 */
export function versionNotFoundError(
  version: string,
  availableVersions?: string[]
): ErrorPayload {
  return createError(
    ErrorCode.VERSION_NOT_FOUND,
    `Version not found: ${version}`,
    {
      version,
      available_versions: availableVersions,
    },
    false
  );
}

/**
 * Create an error for network failures
 */
export function networkError(
  url: string,
  reason?: string,
  retryable: boolean = true
): ErrorPayload {
  return createError(
    ErrorCode.NETWORK_ERROR,
    `Network error fetching ${url}${reason ? `: ${reason}` : ""}`,
    {
      url,
      reason,
    },
    retryable
  );
}

/**
 * Create an error for parsing failures
 */
export function parseError(
  operation: string,
  reason?: string,
  details?: Record<string, unknown>
): ErrorPayload {
  return createError(
    ErrorCode.PARSE_ERROR,
    `Parse error during ${operation}${reason ? `: ${reason}` : ""}`,
    {
      operation,
      reason,
      ...details,
    },
    false
  );
}

/**
 * Create an error for cache failures
 */
export function cacheError(
  operation: string,
  reason?: string,
  retryable: boolean = true
): ErrorPayload {
  return createError(
    ErrorCode.CACHE_ERROR,
    `Cache error during ${operation}${reason ? `: ${reason}` : ""}`,
    {
      operation,
      reason,
    },
    retryable
  );
}

/**
 * Create an error for provider failures
 */
export function providerError(
  provider: string,
  reason?: string,
  details?: Record<string, unknown>
): ErrorPayload {
  return createError(
    ErrorCode.PROVIDER_ERROR,
    `Provider error (${provider})${reason ? `: ${reason}` : ""}`,
    {
      provider,
      reason,
      ...details,
    },
    false
  );
}

/**
 * Create an error for internal/unexpected errors
 */
export function internalError(
  message: string,
  details?: Record<string, unknown>
): ErrorPayload {
  return createError(
    ErrorCode.INTERNAL_ERROR,
    `Internal error: ${message}`,
    details,
    false
  );
}

/**
 * Convert an Error object to a standardized error payload
 */
export function errorToPayload(error: unknown, context?: Record<string, unknown>): ErrorPayload {
  if (error instanceof Error) {
    return createError(
      ErrorCode.INTERNAL_ERROR,
      error.message,
      {
        name: error.name,
        stack: error.stack,
        ...context,
      },
      false
    );
  }

  return createError(
    ErrorCode.INTERNAL_ERROR,
    String(error),
    context,
    false
  );
}

