# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a read-only Model Context Protocol (MCP) server that exposes Synergy/DE documentation as tools and resources for AI assistants like Cursor. The server fetches documentation from either online sources (www.synergex.com/docs) or local file systems, parses HTML into structured Topics, chunks content for LLM consumption, and exposes MCP tools for searching and browsing documentation.

## Common Commands

### Development
```bash
# Build TypeScript
npm run build

# Watch mode for development
npm run dev

# Start the server
npm start

# Type checking
npm run typecheck
```

### Testing
```bash
# Run tests with coverage (default)
npm test

# Run tests in watch mode
npm run test:watch

# Run tests without coverage
npm run test:no-coverage

# Run coverage report
npm run test:coverage
```

### Linting
```bash
# Run linter
npm run lint

# Fix linting issues
npm run lint:fix
```

### Running a Single Test
```bash
# Run specific test file
npx vitest src/lib/providers/__tests__/local-provider.test.ts

# Run tests matching a pattern
npx vitest --grep "OnlineProvider"
```

## Architecture

### Provider Pattern (src/lib/providers/)

The core abstraction for documentation sources. All providers implement the `DocProvider` interface:

- **BaseDocProvider**: Abstract base class defining the interface
- **OnlineProvider**: Fetches from Synergy/DE docs website with rate limiting (10 req/5s), HTTP caching (1min TTL), and 30s timeouts
- **LocalProvider**: Reads HTML files from local file system with version-aware path resolution
- **HybridProvider**: Implements deterministic Local → Online fallback; tries local first, falls back to online on failure

**Key behavior**: All providers return `Topic` objects with a `source` field ("online" | "local") for provenance tracking. The HybridProvider created by `createProvider()` factory respects precedence rules for caching and indexing consistency.

### Parsing and Chunking (src/lib/parser/)

Two-stage content processing:

1. **html-parser.ts**: Converts raw HTML to structured `Topic` objects
   - Extracts: title, breadcrumbs, section, main content, navigation links (prev/next/parent/related)
   - Converts HTML to markdown-style plain text (preserves headings, lists, code blocks)
   - Generates 200-char summary (sentence-aware truncation)
   - Uses cheerio with multiple selector strategies for robustness

2. **chunker.ts**: Splits content into LLM-friendly chunks
   - Default: 1200 tokens per chunk (~4800 chars, estimated at 4 chars/token)
   - Splitting strategy hierarchy: by headings (preferred) → by paragraphs → by sentences
   - Preserves heading context in each chunk for coherence
   - `limitChunks()` caps total response to ~8k tokens for tool/resource outputs

**Integration**: Providers call `parseHtml()` then `chunkBodyText()` to produce complete `Topic` objects with `body_chunks: TopicChunk[]`.

### Type System (src/types.ts)

Core types that define the data model:

- **Topic**: The fundamental unit - contains metadata (id, version, title, section, url, source), content (body_chunks, summary), and navigation (links)
- **TopicChunk**: Individual content chunk with topic_id, chunk_index, text, token_count
- **DocProvider**: Interface for all documentation sources
- **Link**: Navigation relationships (prev, next, parent, related)

### Error Handling (src/lib/utils/errors.ts)

All errors follow a standardized payload schema:
```typescript
{
  code: string,           // INVALID_INPUT, TOPIC_NOT_FOUND, NETWORK_ERROR, etc.
  message: string,        // Human-readable description
  details?: object,       // Context (version, section, provider source, etc.)
  retryable?: boolean     // True for transient failures
}
```

**Critical rule**: Never throw raw errors in production code. Use helper functions (e.g., `topicNotFoundError()`, `networkError()`) that return structured error payloads. All tool handlers must catch exceptions and convert them.

### Configuration (src/config.ts)

Environment-based config with validation and caching:

- `SYNERGYDE_DOC_BASE_URL` - Online docs base URL (default: https://www.synergex.com/docs/)
- `SYNERGYDE_DOC_DEFAULT_VERSION` - Default version (default: "latest")
- `SYNERGYDE_LOCAL_DOC_PATH` - Optional local docs directory
- `SYNERGYDE_CACHE_DIR` - Cache directory (default: ./cache)
- `LOG_LEVEL` - Logging level: debug, info, warn, error (default: info)

**Usage pattern**: Call `await initializeConfig()` once on startup, then use `getConfig()` synchronously. Config is validated and cached.

### Logging (src/lib/utils/logger.ts)

Structured logger with specialized methods:

- Log levels: debug, info, warn, error (controlled by `LOG_LEVEL` env var)
- Specialized logging: `logToolInvocation()`, `logHttpFetch()`, `logCacheOperation()`, `logParsing()`
- Lazy initialization - reads config on first use
- Never log secrets or sensitive data

### Rate Limiting (src/lib/utils/rate-limiter.ts)

Sliding window rate limiter used by OnlineProvider:

- Default: 10 requests per 5 seconds
- `waitForSlot()` blocks asynchronously until a slot is available
- Automatically prunes expired timestamps from window
- Prevents overwhelming the Synergy/DE docs site

## Implementation Status

**Completed Phases:**
- Phase 1: Project Foundation (types, config, logging, utilities)
- Phase 2: Documentation Providers (online, local, hybrid with factory)
- Phase 2a: Provider Unit Tests (comprehensive test coverage with vitest)
- Phase 3: HTML Parsing and Chunking

**Pending Phases:**
- Phase 4: Caching Layer (disk-based cache for parsed Topics)
- Phase 5: Search and Indexing (in-memory TF-IDF search index)
- Phase 6: MCP Tools (search_docs, get_topic, get_related_topics, list_section_topics, describe_docs)
- Phase 7: MCP Resources (synergyde:topic/{id}, synergyde:section/{version}/{section})
- Phase 8: MCP Server Integration (tool/resource registration, stdio transport)
- Phase 9-10: Testing, documentation, polish

See IMPLEMENTATION_PLAN.md for detailed phase breakdown.

## Testing Philosophy

Follow Test-Driven Development (TDD):

1. Write or update failing tests before implementing features/fixes
2. Target ≥80% statement coverage for all modules (measured via vitest coverage)
3. Use mocks for external dependencies (HTTP, file system)
4. Keep tests deterministic and isolated
5. See existing tests in `src/lib/providers/__tests__/` for patterns

## Code Patterns to Follow

### Provider Implementation
- Extend `BaseDocProvider` abstract class
- Return `Topic` objects with `source` field set correctly
- Use structured error payloads (never throw)
- Log operations with `logger.logHttpFetch()` or similar

### HTML Parsing
- Use multiple selector strategies (fallback chain) for robustness
- Normalize URLs to relative topic IDs for consistency
- Strip scripts, styles, navigation, footers
- Preserve semantic structure (headings, lists, code)

### Chunking
- Split at natural boundaries (headings preferred)
- Respect token limits (configurable, default 1200/chunk)
- Preserve context (heading hierarchy in each chunk)
- Never split mid-sentence

### Error Handling
- Import helpers from `src/lib/utils/errors.ts`
- Include diagnostic context in `details` field (version, section, source)
- Set `retryable: true` for transient failures (network, timeout)
- Log errors with appropriate levels before returning

## Project Conventions

- **Modules**: ES modules (`"type": "module"` in package.json)
- **TypeScript**: Strict mode enabled, avoid `any` types
- **Source layout**: `src/` for source, `dist/` for compiled output (not committed)
- **Dependencies**: Keep minimal, use devDependencies for tooling
- **Imports**: Use index.ts exports for clean public APIs
- **Async**: Prefer async/await over callbacks
- **Validation**: Validate on startup (config, paths), fail fast with clear errors

## Important Implementation Notes

### Version Handling
- Version strings: "latest", "12.3", "11.1.1", "10.3.3", etc.
- URL mapping: "latest" → `/`, versioned → `/versions/v111/`
- LocalProvider: versions are subdirectories under SYNERGYDE_LOCAL_DOC_PATH

### URL Normalization
- Always normalize URLs to relative topic IDs (remove base URL, query params)
- Topic ID format: relative path from base URL (e.g., "/lang/ref/statements/call.htm")
- Preserve version context separately in `Topic.version` field

### Content Processing Pipeline
```
Raw HTML → parseHtml() → Topic (no chunks) → extractBodyText() → chunkBodyText() → Topic (with chunks)
```

### Hybrid Provider Precedence
1. Try LocalProvider.fetchTopic() if configured
2. On success with content: return with source="local"
3. On failure or empty: fallback to OnlineProvider
4. Return with source="online"
5. Log which provider served the request

## Future Work Considerations

When implementing caching (Phase 4):
- Cache key format: `{version}/{topic_id}.json`
- Store full `Topic` objects (includes source provenance)
- Invalidation: simple TTL or manual clearing
- Consider cache hits in hybrid provider logic (check cache before local/online)

When implementing search (Phase 5):
- Index fields: title, summary, body_text (from chunks)
- Filter by: version, section, source
- Lazy build: construct index on first search or eagerly on startup
- Update index as topics are fetched/cached

When implementing MCP tools (Phase 6):
- Use `@modelcontextprotocol/sdk` for server initialization
- Register tools with JSON schemas for inputs/outputs
- Cap response sizes to ~8k tokens (use `limitChunks()`)
- Return structured errors matching the error payload schema

## Additional Resources

- README.md: User-facing documentation, installation, Cursor setup
- requirements.md: Original design specification with workflows
- IMPLEMENTATION_PLAN.md: Detailed phase-by-phase implementation guide
- .cursorrules: Development guidelines, quality standards, testing requirements
