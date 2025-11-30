/**
 * Test setup file for provider tests
 * Initializes mocks before tests run
 */

// Mock config - this will be used by all test files
export const mockConfig = {
  docBaseUrl: "https://www.synergex.com/docs/",
  defaultVersion: "latest",
  localDocPath: "/test/docs",
  cacheDir: "./cache",
  logLevel: "info" as const,
};
