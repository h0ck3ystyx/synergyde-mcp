# Implementation Plan: Synergy/DE MCP Server

## Overview
Build a read-only MCP server that exposes Synergy/DE documentation as tools and resources, supporting both online and local documentation sources.

## Project Structure

```
synergyde-mcp/
├── package.json
├── tsconfig.json
├── .env.example
├── README.md
├── src/
│   ├── server.ts                 # Main MCP server entry point
│   ├── types.ts                  # TypeScript type definitions
│   ├── config.ts                 # Configuration and environment variables
│   ├── lib/
│   │   ├── providers/
│   │   │   ├── provider.ts       # DocProvider interface
│   │   │   ├── online-provider.ts
│   │   │   └── local-provider.ts
│   │   ├── parser/
│   │   │   ├── html-parser.ts    # HTML parsing and cleaning
│   │   │   └── chunker.ts        # Topic chunking logic
│   │   ├── search/
│   │   │   └── index.ts          # Search index implementation
│   │   ├── cache/
│   │   │   └── cache-manager.ts  # Disk caching layer
│   │   └── utils/
│   │       ├── logger.ts         # Logging utilities
│   │       └── errors.ts         # Error handling utilities
│   └── tools/
│       ├── search-docs.ts
│       ├── get-topic.ts
│       ├── get-related-topics.ts
│       ├── list-section-topics.ts
│       └── describe-docs.ts
└── dist/                         # Compiled JavaScript output
```

---

## Phase 1: Project Foundation ✅

### 1.1 Project Setup
- [x] Initialize Node.js project with `package.json`
- [x] Configure TypeScript with `tsconfig.json` (ES modules, strict mode)
- [x] Install dependencies:
  - `@modelcontextprotocol/sdk` (MCP SDK)
  - `cheerio` or `jsdom` (HTML parsing)
  - `node-fetch` or native `fetch` (HTTP requests)
  - `@types/node` (TypeScript types)
- [x] Set up build scripts (compile TypeScript to `dist/`)
- [x] Create `.env.example` with configuration variables
- [x] Create basic `README.md` with setup instructions

### 1.2 Core Type Definitions
- [x] Define `Topic` interface (id, version, title, section, path, summary, body_chunks, links)
- [x] Define `TopicChunk` interface (topic_id, chunk_index, text)
- [x] Define `Link` type (prev, next, parent, related)
- [x] Define `DocProvider` interface (abstract base)
- [x] Define error types and structured error responses
- [x] Export all types from `src/types.ts`

### 1.3 Configuration Module
- [x] Create `src/config.ts` to read environment variables:
  - `SYNERGYDE_DOC_BASE_URL` (default: `https://www.synergex.com/docs/`)
  - `SYNERGYDE_DOC_DEFAULT_VERSION` (default: `"latest"`)
  - `SYNERGYDE_LOCAL_DOC_PATH` (optional)
  - `SYNERGYDE_CACHE_DIR` (default: `./cache`)
- [x] Provide typed configuration object with defaults
- [x] Validate configuration on startup

### 1.4 Logging Utilities
- [x] Create `src/lib/utils/logger.ts`
- [x] Implement optional debug logging (controlled by env var)
- [x] Support log levels: debug, info, warn, error
- [x] Log tool invocations, HTTP fetches, cache hits/misses, parsing errors

---

## Phase 2: Documentation Providers ✅

### 2.1 Provider Interface
- [x] Create `src/lib/providers/provider.ts`
- [x] Define `DocProvider` abstract class/interface with methods:
  - `fetchTopic(url: string, version?: string): Promise<Topic>`
  - `listTopics(section: string, version?: string): Promise<Topic[]>`
  - `getAvailableVersions(): Promise<string[]>`
  - `getAvailableSections(version?: string): Promise<string[]>`
- [x] Define error handling contract
- [x] Include provenance (`source: "online" | "local"`) in Topic results so caches/search/indexing know where content came from

### 2.2 Online Provider
- [x] Create `src/lib/providers/online-provider.ts`
- [x] Implement HTTP fetching with:
  - Rate limiting (respectful requests to docs.synergex.com)
  - HTTP caching (ETag/Last-Modified headers)
  - Error handling for network failures
  - Timeout handling
- [x] Parse versioned URLs (e.g., `/versions/v111/`, `/versions/v1033/`)
- [x] Handle "latest" version resolution
- [x] Return raw HTML for parsing

### 2.3 Local Provider (Optional)
- [x] Create `src/lib/providers/local-provider.ts`
- [x] Implement file system reading
- [x] Support HTML files in directory structure
- [x] Map local paths to topic IDs
- [x] Handle CHM/HTML exports if applicable
- [x] Fallback to online if local file not found (if configured)

### 2.4 Provider Factory
- [x] Create provider selection logic based on configuration
- [x] Support hybrid mode (deterministic Local → Online fallback)
- [x] Initialize provider in server startup
- [x] Capture which provider serves each request for logging, caching, and search-index updates
- [x] Expose provider precedence rules to downstream consumers to keep behavior predictable

### 2.5 Documentation Discovery Spike
- [x] Crawl at least one topic per major section/version (latest and ≥1 legacy) and capture DOM snapshots for title, breadcrumbs, navigation links, and main content wrappers
- [x] Confirm robots.txt allows the targeted paths and document any disallowed areas
- [x] Update parser/search requirements if selectors differ; store findings with screenshots/notes for future contributors

### Phase 2a: Provider Unit Tests & Coverage ✅
- [x] Adopt TDD for provider behaviors: write failing tests for Local/Online/Hybrid providers before implementing fixes/features
- [x] Cover LocalProvider path resolution, version-aware lookups, and error scenarios
- [x] Cover OnlineProvider rate limiting, caching, and error propagation (mock fetch)
- [x] Cover Hybrid provider precedence (Local → Online fallback, provenance logging)
- [x] Add tests for discovery utilities once HTML parsing is available (mock provider responses)
- [x] Configure Vitest coverage reporting (e.g., `npm run test -- --coverage`) targeting ≥80% statement coverage for provider modules
- [x] Document how to run tests and interpret coverage in README/CONTRIBUTING

---

## Phase 3: HTML Parsing and Processing ✅

### 3.1 HTML Parser
- [x] Create `src/lib/parser/html-parser.ts`
- [x] Use cheerio/jsdom to parse HTML
- [x] Extract:
  - Title (from `<title>` or main heading)
  - Breadcrumb navigation
  - Main content region (strip headers/footers/nav menus)
  - Navigation links (prev, next, parent, related)
- [x] Convert HTML to plain text while preserving:
  - Headings (as markdown-style headers)
  - Lists (as markdown-style lists)
  - Code blocks (preserve formatting)
  - Important structure
- [x] Strip:
  - Scripts, styles, navigation menus
  - Footer content, ads, boilerplate
- [x] Return structured `Topic` object
- [x] Ensure fetch logic respects robots.txt and configured rate limits before requesting content

### 3.2 Topic Chunker
- [x] Create `src/lib/parser/chunker.ts`
- [x] Split topic body into `TopicChunk[]` based on:
  - Heading boundaries (natural break points)
  - Character/token limits (~1–2k chars or ≤1.2k tokens per chunk)
  - Preserve context (don't split mid-sentence)
- [x] Assign chunk indices
- [x] Ensure chunks are LLM-friendly (complete thoughts)
- [x] Cap combined tool/resource responses at ~8k tokens and document truncation strategy when limits are exceeded
- [x] Handle edge cases (very short topics, very long topics)

---

## Phase 4: Caching Layer ✅

### 4.1 Cache Manager
- [x] Create `src/lib/cache/cache-manager.ts`
- [x] Implement disk-based caching:
  - Key format: `{version}/{topic_id}.json`
  - Store parsed `Topic` objects as JSON
  - Cache directory from `SYNERGYDE_CACHE_DIR`
- [x] Implement cache operations:
  - `get(topicId: string, version: string): Promise<Topic | null>`
  - `set(topicId: string, version: string, topic: Topic): Promise<void>`
  - `has(topicId: string, version: string): Promise<boolean>`
- [x] Handle cache directory creation
- [x] Log cache hits/misses for debugging

---

## Phase 5: Search and Indexing ✅

### 5.1 Search Index
- [x] Create `src/lib/search/index.ts`
- [x] Implement in-memory search index:
  - Index fields: title, summary, body_text
  - Simple TF-IDF or term frequency scoring
  - Support filtering by version and section
- [x] Build index lazily (on first search or on startup)
- [x] Index topics as they are fetched/cached
- [x] Support:
  - `search(query: string, version?: string, section?: string, limit?: number): Promise<SearchResult[]>`
  - `addTopic(topic: Topic): void`
  - `clear(): void`
- [x] Return ranked results with relevance scores

### 5.2 Index Persistence (Optional Enhancement)
- [ ] Consider persisting index metadata to disk for faster startup
- [ ] Rebuild index from cache on startup if available

---

## Phase 6: MCP Tools Implementation ✅

### 6.1 Tool: search_docs
- [x] Create `src/tools/search-docs.ts`
- [x] Input schema:
  - `query: string` (required)
  - `version?: string` (default from config)
  - `section?: string` (optional filter)
  - `limit?: number` (default 10)
- [x] Implementation:
  - Use search index to find matching topics
  - Filter by version and section if provided
  - Return top N results with metadata
- [x] Output: Array of `{ topic_id, title, section, version, url, summary, source }`
- [x] Error handling: Return standardized `{code,message,details,retryable}` payloads (include resolved version/section) instead of throwing

### 6.2 Tool: get_topic
- [x] Create `src/tools/get-topic.ts`
- [x] Input schema:
  - `topic_id?: string`
  - `url?: string` (normalize to topic_id if provided)
  - `version?: string`
  - `max_chunks?: number` (default 3)
- [x] Implementation:
  - Check cache first
  - Fetch from provider if not cached
  - Parse and chunk topic
  - Cache result
  - Return topic with limited chunks
- [x] Output: Full topic object with chunks, links, chunk metadata, and source
- [x] Error handling: Return standardized errors with `details` describing lookup method, resolved version, and cache/provider status

### 6.3 Tool: get_related_topics
- [x] Create `src/tools/get-related-topics.ts`
- [x] Input schema:
  - `topic_id: string` (required)
- [x] Implementation:
  - Fetch topic (use cache if available)
  - Extract links (prev, next, parent, related)
  - Return structured link information
- [x] Output: `{ parent?, previous?, next?, related[] }`
- [x] Error handling: Return standardized errors; include number of links inspected and whether topic came from cache/local/online

### 6.4 Tool: list_section_topics
- [x] Create `src/tools/list-section-topics.ts`
- [x] Input schema:
  - `section: string` (required)
  - `version?: string` (default from config)
  - `limit?: number` (default 50)
- [x] Implementation:
  - Query provider for topics in section
  - Return list with metadata
  - Support pagination if needed
- [x] Output: Array of `{ topic_id, title, url, summary }`
- [x] Error handling: Standardized errors listing allowed sections/versions in `details`

### 6.5 Tool: describe_docs
- [x] Create `src/tools/describe-docs.ts`
- [x] Input schema: None (empty)
- [x] Implementation:
  - Query provider for available versions
  - Query provider for available sections
  - Determine source type (online/local/hybrid)
- [x] Output: `{ versions: string[], sections: string[], source: string }`
- [x] Error handling: Standardized errors indicating which sub-call failed and whether retrying is recommended

---

## Phase 7: MCP Resources ✅

### 7.1 Topic Resource
- [x] Register resource handler in server
- [x] URI scheme: `synergyde:topic/{topic_id}`
- [x] Implementation:
  - Fetch topic (use cache)
  - Return plain text (first N chunks or concatenated) while respecting the ~8k-token cap
  - Include metadata (title, section, version, url, path, source)
  - Return standardized error payloads on failure
- [x] Support version in URI if needed: `synergyde:topic/{version}/{topic_id}`

### 7.2 Section Resource
- [x] Register resource handler in server
- [x] URI scheme: `synergyde:section/{version}/{section}`
- [x] Implementation:
  - List topics in section
  - Return index format (titles + URLs + summaries) with total counts/pagination hints while respecting the token budget
  - Return standardized error payloads when sections are missing/empty or downstream calls fail
- [x] Format as structured text suitable for LLM context

---

## Phase 8: MCP Server Integration ✅

### 8.1 Server Setup
- [x] Create `src/server.ts` as main entry point
- [x] Initialize MCP server with stdio transport
- [x] Load configuration
- [x] Initialize provider (online/local/hybrid)
- [x] Initialize cache manager
- [x] Initialize search index (lazy or eager)
- [x] Set up error handling middleware

### 8.2 Tool Registration
- [x] Register all 5 tools with proper JSON schemas
- [x] Use descriptive tool names and descriptions
- [x] Define input/output schemas explicitly (using Zod)
- [x] Connect tool handlers to implementation modules

### 8.3 Resource Registration
- [x] Register topic and section resources
- [x] Implement resource handlers
- [x] Define resource URI patterns

### 8.4 Error Handling
- [x] Create `src/lib/utils/errors.ts`
- [x] Define canonical `{ code, message, details?, retryable? }` schema and helper factory
- [x] Convert exceptions to MCP error responses using the helper (never throw raw errors)
- [x] Include resolved version/section/source or provider diagnostics in `details` when helpful
- [x] Log errors with correlation IDs at appropriate levels without exposing secrets

### 8.5 Server Lifecycle
- [x] Handle graceful shutdown
- [x] Clean up resources
- [x] Save cache/index state if needed (cache is disk-based, index is in-memory)

---

## Phase 9: Testing and Validation

### 9.1 Unit Tests
- [x] Test HTML parser with sample HTML
- [x] Test chunker with various topic lengths
- [x] Test search index with sample queries
- [x] Test cache manager (read/write operations)
- [x] Test error handling utilities
- [x] Focus on deterministic, isolated tests

### 9.2 Integration Tests
- [x] Test provider implementations (mock HTTP for online)
- [x] Test tool handlers with sample inputs
- [x] Test end-to-end flow: search → get_topic → get_related

### 9.3 Manual Testing
- [x] Test with real Synergy/DE docs site (documented in MANUAL_TESTING.md)
- [x] Verify all tools work correctly (documented)
- [x] Test caching behavior (documented)
- [x] Test error cases (network failures, invalid topics) (documented)
- [x] Test with Cursor MCP integration (documented)

---

## Phase 10: Documentation and Polish ✅

### 10.1 Documentation
- [x] Update `README.md` with:
  - Project overview
  - Installation instructions
  - Configuration guide
  - Usage examples
  - Cursor MCP setup instructions
- [x] Document environment variables
- [x] Add code comments for complex logic
- [x] Publish a sample Cursor MCP config snippet plus troubleshooting guidance that explains error payload fields and common resolutions

### 10.2 Build and Deployment
- [x] Ensure TypeScript compiles cleanly
- [x] Test `node dist/server.js` works
- [x] Create example Cursor MCP configuration (`.cursor/mcp.json.example`)
- [x] Verify all dependencies are listed in `package.json`

### 10.3 Code Quality
- [x] Run linter/formatter
- [x] Remove any `any` types (use proper TypeScript types)
- [x] Ensure all functions are well-typed
- [x] Review error handling coverage
- [x] Verify logging is appropriate

---

## Implementation Order Summary

1. **Foundation** (Phase 1): Project setup, types, config, logging
2. **Core Infrastructure** (Phases 2-5): Providers, parsing, caching, search
3. **MCP Surface** (Phases 6-8): Tools, resources, server integration
4. **Quality Assurance** (Phases 9-10): Testing, documentation, polish

## Key Design Principles

- **Modularity**: Small, composable modules with clear responsibilities
- **Type Safety**: Strong TypeScript typing throughout
- **Error Handling**: Structured errors, no unhandled exceptions
- **Caching**: Aggressive caching to minimize network calls
- **Read-Only**: No write operations, respect remote resources
- **LLM-Friendly**: Chunked, structured content optimized for AI consumption
- **Deterministic**: Idempotent operations, stable results

## Dependencies Summary

- `@modelcontextprotocol/sdk` - MCP server framework
- `cheerio` - HTML parsing
- Native `fetch` (Node.js 18+) - HTTP requests
- `@types/node` - TypeScript types
- Development: TypeScript compiler, Vitest (testing framework with coverage)
