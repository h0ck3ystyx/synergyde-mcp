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

## Phase 1: Project Foundation

### 1.1 Project Setup
- [ ] Initialize Node.js project with `package.json`
- [ ] Configure TypeScript with `tsconfig.json` (ES modules, strict mode)
- [ ] Install dependencies:
  - `@modelcontextprotocol/sdk` (MCP SDK)
  - `cheerio` or `jsdom` (HTML parsing)
  - `node-fetch` or native `fetch` (HTTP requests)
  - `@types/node` (TypeScript types)
- [ ] Set up build scripts (compile TypeScript to `dist/`)
- [ ] Create `.env.example` with configuration variables
- [ ] Create basic `README.md` with setup instructions

### 1.2 Core Type Definitions
- [ ] Define `Topic` interface (id, version, title, section, path, summary, body_chunks, links)
- [ ] Define `TopicChunk` interface (topic_id, chunk_index, text)
- [ ] Define `Link` type (prev, next, parent, related)
- [ ] Define `DocProvider` interface (abstract base)
- [ ] Define error types and structured error responses
- [ ] Export all types from `src/types.ts`

### 1.3 Configuration Module
- [ ] Create `src/config.ts` to read environment variables:
  - `SYNERGYDE_DOC_BASE_URL` (default: `https://www.synergex.com/docs/`)
  - `SYNERGYDE_DOC_DEFAULT_VERSION` (default: `"latest"`)
  - `SYNERGYDE_LOCAL_DOC_PATH` (optional)
  - `SYNERGYDE_CACHE_DIR` (default: `./cache`)
- [ ] Provide typed configuration object with defaults
- [ ] Validate configuration on startup

### 1.4 Logging Utilities
- [ ] Create `src/lib/utils/logger.ts`
- [ ] Implement optional debug logging (controlled by env var)
- [ ] Support log levels: debug, info, warn, error
- [ ] Log tool invocations, HTTP fetches, cache hits/misses, parsing errors

---

## Phase 2: Documentation Providers

### 2.1 Provider Interface
- [ ] Create `src/lib/providers/provider.ts`
- [ ] Define `DocProvider` abstract class/interface with methods:
  - `fetchTopic(url: string, version?: string): Promise<Topic>`
  - `listTopics(section: string, version?: string): Promise<Topic[]>`
  - `getAvailableVersions(): Promise<string[]>`
  - `getAvailableSections(version?: string): Promise<string[]>`
- [ ] Define error handling contract
- [ ] Include provenance (`source: "online" | "local"`) in Topic results so caches/search/indexing know where content came from

### 2.2 Online Provider
- [ ] Create `src/lib/providers/online-provider.ts`
- [ ] Implement HTTP fetching with:
  - Rate limiting (respectful requests to docs.synergex.com)
  - HTTP caching (ETag/Last-Modified headers)
  - Error handling for network failures
  - Timeout handling
- [ ] Parse versioned URLs (e.g., `/versions/v111/`, `/versions/v1033/`)
- [ ] Handle "latest" version resolution
- [ ] Return raw HTML for parsing

### 2.3 Local Provider (Optional)
- [ ] Create `src/lib/providers/local-provider.ts`
- [ ] Implement file system reading
- [ ] Support HTML files in directory structure
- [ ] Map local paths to topic IDs
- [ ] Handle CHM/HTML exports if applicable
- [ ] Fallback to online if local file not found (if configured)

### 2.4 Provider Factory
- [ ] Create provider selection logic based on configuration
- [ ] Support hybrid mode (deterministic Local → Online fallback)
- [ ] Initialize provider in server startup
- [ ] Capture which provider serves each request for logging, caching, and search-index updates
- [ ] Expose provider precedence rules to downstream consumers to keep behavior predictable

### 2.5 Documentation Discovery Spike
- [ ] Crawl at least one topic per major section/version (latest and ≥1 legacy) and capture DOM snapshots for title, breadcrumbs, navigation links, and main content wrappers
- [ ] Confirm robots.txt allows the targeted paths and document any disallowed areas
- [ ] Update parser/search requirements if selectors differ; store findings with screenshots/notes for future contributors

### Phase 2a: Provider Unit Tests & Coverage
- [ ] Adopt TDD for provider behaviors: write failing tests for Local/Online/Hybrid providers before implementing fixes/features
- [ ] Cover LocalProvider path resolution, version-aware lookups, and error scenarios
- [ ] Cover OnlineProvider rate limiting, caching, and error propagation (mock fetch)
- [ ] Cover Hybrid provider precedence (Local → Online fallback, provenance logging)
- [ ] Add tests for discovery utilities once HTML parsing is available (mock provider responses)
- [ ] Configure Vitest coverage reporting (e.g., `npm run test -- --coverage`) targeting ≥80% statement coverage for provider modules
- [ ] Document how to run tests and interpret coverage in README/CONTRIBUTING

---

## Phase 3: HTML Parsing and Processing

### 3.1 HTML Parser
- [ ] Create `src/lib/parser/html-parser.ts`
- [ ] Use cheerio/jsdom to parse HTML
- [ ] Extract:
  - Title (from `<title>` or main heading)
  - Breadcrumb navigation
  - Main content region (strip headers/footers/nav menus)
  - Navigation links (prev, next, parent, related)
- [ ] Convert HTML to plain text while preserving:
  - Headings (as markdown-style headers)
  - Lists (as markdown-style lists)
  - Code blocks (preserve formatting)
  - Important structure
- [ ] Strip:
  - Scripts, styles, navigation menus
  - Footer content, ads, boilerplate
- [ ] Return structured `Topic` object
- [ ] Ensure fetch logic respects robots.txt and configured rate limits before requesting content

### 3.2 Topic Chunker
- [ ] Create `src/lib/parser/chunker.ts`
- [ ] Split topic body into `TopicChunk[]` based on:
  - Heading boundaries (natural break points)
  - Character/token limits (~1–2k chars or ≤1.2k tokens per chunk)
  - Preserve context (don't split mid-sentence)
- [ ] Assign chunk indices
- [ ] Ensure chunks are LLM-friendly (complete thoughts)
- [ ] Cap combined tool/resource responses at ~8k tokens and document truncation strategy when limits are exceeded
- [ ] Handle edge cases (very short topics, very long topics)

---

## Phase 4: Caching Layer

### 4.1 Cache Manager
- [ ] Create `src/lib/cache/cache-manager.ts`
- [ ] Implement disk-based caching:
  - Key format: `{version}/{topic_id}.json`
  - Store parsed `Topic` objects as JSON
  - Cache directory from `SYNERGYDE_CACHE_DIR`
- [ ] Implement cache operations:
  - `get(topicId: string, version: string): Promise<Topic | null>`
  - `set(topicId: string, version: string, topic: Topic): Promise<void>`
  - `has(topicId: string, version: string): Promise<boolean>`
- [ ] Handle cache directory creation
- [ ] Log cache hits/misses for debugging

---

## Phase 5: Search and Indexing

### 5.1 Search Index
- [ ] Create `src/lib/search/index.ts`
- [ ] Implement in-memory search index:
  - Index fields: title, summary, body_text
  - Simple TF-IDF or term frequency scoring
  - Support filtering by version and section
- [ ] Build index lazily (on first search or on startup)
- [ ] Index topics as they are fetched/cached
- [ ] Support:
  - `search(query: string, version?: string, section?: string, limit?: number): Promise<SearchResult[]>`
  - `addTopic(topic: Topic): void`
  - `clear(): void`
- [ ] Return ranked results with relevance scores

### 5.2 Index Persistence (Optional Enhancement)
- [ ] Consider persisting index metadata to disk for faster startup
- [ ] Rebuild index from cache on startup if available

---

## Phase 6: MCP Tools Implementation

### 6.1 Tool: search_docs
- [ ] Create `src/tools/search-docs.ts`
- [ ] Input schema:
  - `query: string` (required)
  - `version?: string` (default from config)
  - `section?: string` (optional filter)
  - `limit?: number` (default 10)
- [ ] Implementation:
  - Use search index to find matching topics
  - Filter by version and section if provided
  - Return top N results with metadata
- [ ] Output: Array of `{ topic_id, title, section, version, url, summary, source }`
- [ ] Error handling: Return standardized `{code,message,details,retryable}` payloads (include resolved version/section) instead of throwing

### 6.2 Tool: get_topic
- [ ] Create `src/tools/get-topic.ts`
- [ ] Input schema:
  - `topic_id?: string`
  - `url?: string` (normalize to topic_id if provided)
  - `version?: string`
  - `max_chunks?: number` (default 3)
- [ ] Implementation:
  - Check cache first
  - Fetch from provider if not cached
  - Parse and chunk topic
  - Cache result
  - Return topic with limited chunks
- [ ] Output: Full topic object with chunks, links, chunk metadata, and source
- [ ] Error handling: Return standardized errors with `details` describing lookup method, resolved version, and cache/provider status

### 6.3 Tool: get_related_topics
- [ ] Create `src/tools/get-related-topics.ts`
- [ ] Input schema:
  - `topic_id: string` (required)
- [ ] Implementation:
  - Fetch topic (use cache if available)
  - Extract links (prev, next, parent, related)
  - Return structured link information
- [ ] Output: `{ parent?, previous?, next?, related[] }`
- [ ] Error handling: Return standardized errors; include number of links inspected and whether topic came from cache/local/online

### 6.4 Tool: list_section_topics
- [ ] Create `src/tools/list-section-topics.ts`
- [ ] Input schema:
  - `section: string` (required)
  - `version?: string` (default from config)
  - `limit?: number` (default 50)
- [ ] Implementation:
  - Query provider for topics in section
  - Return list with metadata
  - Support pagination if needed
- [ ] Output: Array of `{ topic_id, title, url, summary }`
- [ ] Error handling: Standardized errors listing allowed sections/versions in `details`

### 6.5 Tool: describe_docs
- [ ] Create `src/tools/describe-docs.ts`
- [ ] Input schema: None (empty)
- [ ] Implementation:
  - Query provider for available versions
  - Query provider for available sections
  - Determine source type (online/local/hybrid)
- [ ] Output: `{ versions: string[], sections: string[], source: string }`
- [ ] Error handling: Standardized errors indicating which sub-call failed and whether retrying is recommended

---

## Phase 7: MCP Resources

### 7.1 Topic Resource
- [ ] Register resource handler in server
- [ ] URI scheme: `synergyde:topic/{topic_id}`
- [ ] Implementation:
  - Fetch topic (use cache)
  - Return plain text (first N chunks or concatenated) while respecting the ~8k-token cap
  - Include metadata (title, section, version, url, path, source)
  - Return standardized error payloads on failure
- [ ] Support version in URI if needed: `synergyde:topic/{version}/{topic_id}`

### 7.2 Section Resource
- [ ] Register resource handler in server
- [ ] URI scheme: `synergyde:section/{version}/{section}`
- [ ] Implementation:
  - List topics in section
  - Return index format (titles + URLs + summaries) with total counts/pagination hints while respecting the token budget
  - Return standardized error payloads when sections are missing/empty or downstream calls fail
- [ ] Format as structured text suitable for LLM context

---

## Phase 8: MCP Server Integration

### 8.1 Server Setup
- [ ] Create `src/server.ts` as main entry point
- [ ] Initialize MCP server with stdio transport
- [ ] Load configuration
- [ ] Initialize provider (online/local/hybrid)
- [ ] Initialize cache manager
- [ ] Initialize search index (lazy or eager)
- [ ] Set up error handling middleware

### 8.2 Tool Registration
- [ ] Register all 5 tools with proper JSON schemas
- [ ] Use descriptive tool names and descriptions
- [ ] Define input/output schemas explicitly
- [ ] Connect tool handlers to implementation modules

### 8.3 Resource Registration
- [ ] Register topic and section resources
- [ ] Implement resource handlers
- [ ] Define resource URI patterns

### 8.4 Error Handling
- [ ] Create `src/lib/utils/errors.ts`
- [ ] Define canonical `{ code, message, details?, retryable? }` schema and helper factory
- [ ] Convert exceptions to MCP error responses using the helper (never throw raw errors)
- [ ] Include resolved version/section/source or provider diagnostics in `details` when helpful
- [ ] Log errors with correlation IDs at appropriate levels without exposing secrets

### 8.5 Server Lifecycle
- [ ] Handle graceful shutdown
- [ ] Clean up resources
- [ ] Save cache/index state if needed

---

## Phase 9: Testing and Validation

### 9.1 Unit Tests
- [ ] Test HTML parser with sample HTML
- [ ] Test chunker with various topic lengths
- [ ] Test search index with sample queries
- [ ] Test cache manager (read/write operations)
- [ ] Test error handling utilities
- [ ] Focus on deterministic, isolated tests

### 9.2 Integration Tests
- [ ] Test provider implementations (mock HTTP for online)
- [ ] Test tool handlers with sample inputs
- [ ] Test end-to-end flow: search → get_topic → get_related

### 9.3 Manual Testing
- [ ] Test with real Synergy/DE docs site
- [ ] Verify all tools work correctly
- [ ] Test caching behavior
- [ ] Test error cases (network failures, invalid topics)
- [ ] Test with Cursor MCP integration

---

## Phase 10: Documentation and Polish

### 10.1 Documentation
- [ ] Update `README.md` with:
  - Project overview
  - Installation instructions
  - Configuration guide
  - Usage examples
  - Cursor MCP setup instructions
- [ ] Document environment variables
- [ ] Add code comments for complex logic
- [ ] Publish a sample Cursor MCP config snippet plus troubleshooting guidance that explains error payload fields and common resolutions

### 10.2 Build and Deployment
- [ ] Ensure TypeScript compiles cleanly
- [ ] Test `node dist/server.js` works
- [ ] Create example Cursor MCP configuration
- [ ] Verify all dependencies are listed in `package.json`

### 10.3 Code Quality
- [ ] Run linter/formatter
- [ ] Remove any `any` types (use proper TypeScript types)
- [ ] Ensure all functions are well-typed
- [ ] Review error handling coverage
- [ ] Verify logging is appropriate

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
- `cheerio` or `jsdom` - HTML parsing
- `node-fetch` or native `fetch` - HTTP requests
- `@types/node` - TypeScript types
- Development: TypeScript compiler, testing framework (optional)
