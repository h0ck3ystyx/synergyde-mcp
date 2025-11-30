# Documentation MCP Server

A generic, read-only Model Context Protocol (MCP) server that exposes HTML documentation as tools and resources, making it easy to search, retrieve, and browse documentation topics from Cursor and other MCP clients.

**Primary use case:** Synergy/DE documentation
**Works with:** Most HTML-based documentation sites (React, Python, MDN, TypeScript, etc.)

## Features

- **Full-text search** with TF-IDF relevance scoring
- **Generic HTML parser** with fallback selectors for common documentation structures
- **Topic retrieval** with chunked content optimized for LLM consumption
- **Related topics navigation** (previous, next, parent, and related links)
- **Section browsing** to discover topics by category
- **Version support** for versioned documentation
- **Intelligent caching** to minimize network requests and improve performance
- **Online and local** documentation support (hybrid mode with fallback)
- **MCP Resources** for direct topic and section access
- **Works with most documentation sites** - tested with Synergy/DE, adaptable to others

## Prerequisites

- **Node.js 18.0.0 or higher** (provides built-in `fetch` API for HTTP requests)
- **npm** or **pnpm** package manager
- **Cursor** (for MCP integration) or another MCP-compatible client

## Installation

1. **Clone this repository:**
   ```bash
   git clone https://github.com/h0ck3ystyx/synergyde-mcp.git
   cd synergyde-mcp
   ```

2. **Install dependencies:**
   ```bash
   npm install
   # or
   pnpm install
   ```

3. **Build the project:**
   ```bash
   npm run build
   ```

4. **Configure environment variables** (optional):
   ```bash
   cp .env.example .env
   # Edit .env with your preferences
   ```

## Configuration

The server can be configured via environment variables. All variables are optional and have sensible defaults.

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DOC_BASE_URL` | Base URL for online documentation | `https://www.synergex.com/docs/` | No |
| `DOC_DEFAULT_VERSION` | Default documentation version to use | `"latest"` | No |
| `DOC_LOCAL_PATH` | Path to local documentation directory | (none) | No |
| `DOC_CACHE_DIR` | Directory for caching parsed topics | `./cache` | No |
| `LOG_LEVEL` | Logging level: `debug`, `info`, `warn`, or `error` | `info` | No |

**Note:** Old `SYNERGYDE_*` environment variable names are still supported for backward compatibility but are deprecated.

### Configuration Details

- **`DOC_BASE_URL`**: The base URL for online documentation. Should end with a trailing slash (automatically added if missing).
  Examples: `https://www.synergex.com/docs/`, `https://docs.python.org/3/`, `https://reactjs.org/docs/`

- **`DOC_DEFAULT_VERSION`**: The default version to use when no version is specified. The format depends on the documentation structure.
  Examples: `"latest"`, `"v111"`, `"3.11"`, `"18.2.0"`

- **`DOC_LOCAL_PATH`**: If provided, enables local documentation support. The path must be readable and point to a directory containing HTML documentation files. When set, the server operates in "hybrid" mode, preferring local docs but falling back to online docs if a topic isn't found locally.
  Examples: `/path/to/synergex-docs`, `/path/to/react-docs`, `/path/to/python-docs`

- **`DOC_CACHE_DIR`**: Directory where parsed topics are cached on disk. The directory will be created automatically if it doesn't exist. Cached topics are stored as JSON files keyed by version and topic ID.

- **`LOG_LEVEL`**: Controls the verbosity of logging. Use `debug` for detailed information during development, `info` for normal operation, `warn` for warnings only, or `error` for errors only.

### Example Configurations

#### Synergy/DE Documentation (Default)
```bash
DOC_BASE_URL=https://www.synergex.com/docs/
DOC_DEFAULT_VERSION=latest
DOC_CACHE_DIR=./cache
LOG_LEVEL=info
```

#### Python Documentation
```bash
DOC_BASE_URL=https://docs.python.org/3/
DOC_DEFAULT_VERSION=3.11
DOC_CACHE_DIR=./cache
```

#### React Documentation (Local)
```bash
# Use local copy of React docs
DOC_LOCAL_PATH=/path/to/react-docs
DOC_DEFAULT_VERSION=latest
DOC_CACHE_DIR=./cache
```

#### MDN Web Docs
```bash
DOC_BASE_URL=https://developer.mozilla.org/en-US/docs/Web/
DOC_DEFAULT_VERSION=latest
DOC_CACHE_DIR=./cache
```

## Usage

### Running the Server

The server uses stdio transport and is designed to be launched by MCP clients:

```bash
npm start
```

The server will:
- Initialize configuration
- Connect to stdio transport
- Wait for MCP requests from clients

**Note:** The server is intended to be run by MCP clients (like Cursor), not directly. Running it manually will cause it to wait for input on stdin.

### Cursor MCP Configuration

Add the server to your Cursor MCP configuration. The configuration file location depends on your setup:

- **Global config**: `~/.cursor/mcp.json` (macOS/Linux) or `%APPDATA%\Cursor\mcp.json` (Windows)
- **Project config**: `.cursor/mcp.json` in your project root

#### Basic Configuration

```json
{
  "mcpServers": {
    "synergyde-docs": {
      "command": "node",
      "args": ["/absolute/path/to/synergyde-mcp/dist/server.js"],
      "env": {
        "SYNERGYDE_DOC_DEFAULT_VERSION": "latest"
      }
    }
  }
}
```

#### Advanced Configuration with Local Docs

```json
{
  "mcpServers": {
    "synergyde-docs": {
      "command": "node",
      "args": ["/absolute/path/to/synergyde-mcp/dist/server.js"],
      "env": {
        "SYNERGYDE_DOC_BASE_URL": "https://www.synergex.com/docs/",
        "SYNERGYDE_DOC_DEFAULT_VERSION": "latest",
        "SYNERGYDE_LOCAL_DOC_PATH": "/path/to/local/docs",
        "SYNERGYDE_CACHE_DIR": "/path/to/cache",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

**Important:** Use absolute paths for the server executable and any file paths in the configuration.

### Available Tools

The server exposes the following MCP tools:

#### `search_docs`
Search documentation topics using full-text search.

**Parameters:**
- `query` (required): Search query string
- `version` (optional): Documentation version (defaults to configured default)
- `section` (optional): Filter by section name
- `limit` (optional): Maximum number of results (default: 10)

**Returns:** Array of search results with relevance scores

#### `get_topic`
Fetch a documentation topic by ID or URL.

**Parameters:**
- `topic_id` (optional): Topic ID (e.g., `"Language/variables.htm"`)
- `url` (optional): Full URL to the topic page
- `version` (optional): Documentation version
- `max_chunks` (optional): Maximum number of chunks to return (default: 3, 0 = no limit)

**Returns:** Topic object with chunked content

#### `get_related_topics`
Get related topics (previous, next, parent, related links) for a given topic.

**Parameters:**
- `topic_id` (required): Topic ID
- `version` (optional): Documentation version

**Returns:** RelatedTopics object with navigation links

#### `list_section_topics`
List all topics in a documentation section.

**Parameters:**
- `section` (required): Section name (e.g., `"Language"`, `"Reference"`)
- `version` (optional): Documentation version
- `limit` (optional): Maximum number of topics (default: 50)

**Returns:** Array of topic summaries

#### `describe_docs`
Get metadata about available documentation.

**Parameters:** None

**Returns:** DocMetadata with versions, sections, and source type

### Available Resources

The server exposes the following MCP resources:

#### Topic Resource
**URI:** `synergyde:topic/{topic_id}` or `synergyde:topic/{version}/{topic_id}`

Returns plain text content of a documentation topic with metadata. Content is limited to ~8k tokens to fit within LLM context windows.

**Examples:**
- `synergyde:topic/Language/variables.htm`
- `synergyde:topic/latest/Language/variables.htm`
- `synergyde:topic//Language/variables.htm` (explicit no version)

#### Section Resource
**URI:** `synergyde:section/{version}/{section}`

Returns a plain text index of topics in a section with titles, IDs, URLs, and summaries. Content is limited to ~8k tokens.

**Examples:**
- `synergyde:section/latest/Language`
- `synergyde:section/v111/Reference`

## Error Handling

All tools and resources return structured error payloads with the following format:

```typescript
{
  code: string;           // Error code (e.g., "TOPIC_NOT_FOUND", "NETWORK_ERROR")
  message: string;        // Human-readable error message
  details?: {             // Additional context
    topic_id?: string;
    version?: string;
    // ... other fields
  };
  retryable?: boolean;    // Whether the error is retryable
}
```

### Common Error Codes

- **`INVALID_INPUT`**: Invalid input parameters (not retryable)
- **`TOPIC_NOT_FOUND`**: Requested topic doesn't exist (not retryable)
- **`SECTION_NOT_FOUND`**: Requested section doesn't exist (not retryable)
- **`VERSION_NOT_FOUND`**: Requested version doesn't exist (not retryable)
- **`NETWORK_ERROR`**: Network/HTTP error (usually retryable)
- **`CACHE_ERROR`**: Cache operation failed (usually retryable)
- **`PROVIDER_ERROR`**: Provider-specific error (not retryable)
- **`INTERNAL_ERROR`**: Unexpected internal error (not retryable)

### Troubleshooting

**Server won't start:**
- Verify Node.js version: `node --version` (must be 18+)
- Check dependencies: `npm install`
- Verify TypeScript compilation: `npm run build`
- Check logs for specific error messages

**Tools return errors:**
- Verify network connectivity (for online provider)
- Check that topic IDs are correct
- Verify the documentation version exists
- Check server logs for detailed error information

**Cache not working:**
- Verify `SYNERGYDE_CACHE_DIR` is writable
- Check file permissions on cache directory
- Look for cache errors in server logs

**Cursor integration issues:**
- Verify MCP configuration file syntax (valid JSON)
- Use absolute paths for server executable
- Check Cursor's MCP server status/logs
- Restart Cursor after configuration changes
- Verify environment variables are set correctly

## Development

### Project Structure

```
src/
├── server.ts              # Main MCP server entry point
├── types.ts              # TypeScript type definitions
├── config.ts             # Configuration and environment variables
├── tools/                # MCP tool implementations
│   ├── search-docs.ts
│   ├── get-topic.ts
│   ├── get-related-topics.ts
│   ├── list-section-topics.ts
│   └── describe-docs.ts
├── resources/            # MCP resource handlers
│   ├── topic-resource.ts
│   └── section-resource.ts
└── lib/
    ├── providers/        # Documentation providers (online/local/hybrid)
    ├── parser/           # HTML parsing and chunking
    ├── search/           # Search index implementation
    ├── cache/            # Disk caching layer
    └── utils/            # Utilities (logger, errors)
```

### Development Commands

```bash
# Build TypeScript
npm run build

# Watch mode for development
npm run dev

# Run linter
npm run lint

# Fix linting issues automatically
npm run lint:fix

# Type checking (no emit)
npm run typecheck

# Run tests
npm test

# Run tests with coverage
npm test -- --coverage

# Run tests in watch mode
npm run test:watch
```

### Testing

The project uses Vitest for testing with comprehensive coverage:

- **Unit tests**: Test individual modules in isolation
- **Integration tests**: Test tool handlers and workflows
- **End-to-end tests**: Test complete flows (search → get_topic → get_related)

See `MANUAL_TESTING.md` for manual testing procedures.

### Code Quality

- **TypeScript**: Strict type checking enabled
- **ESLint**: Code linting with TypeScript support
- **Test Coverage**: ≥80% statement coverage required
- **Error Handling**: Structured error payloads, no unhandled exceptions

## Architecture

### Design Principles

- **Modularity**: Small, composable modules with clear responsibilities
- **Type Safety**: Strong TypeScript typing throughout
- **Error Handling**: Structured errors, no unhandled exceptions
- **Caching**: Aggressive caching to minimize network calls
- **Read-Only**: No write operations, respect remote resources
- **LLM-Friendly**: Chunked, structured content optimized for AI consumption
- **Deterministic**: Idempotent operations, stable results

### Key Components

1. **Providers**: Fetch documentation from online or local sources
2. **Parser**: Extract and structure content from HTML
3. **Chunker**: Split content into LLM-friendly chunks
4. **Cache**: Disk-based caching for parsed topics
5. **Search Index**: In-memory full-text search with relevance scoring
6. **MCP Server**: Expose tools and resources via Model Context Protocol

## License

MIT

## Contributing

Contributions are welcome! Please ensure:
- All tests pass: `npm test`
- Code is properly typed (no `any` types)
- Coverage remains ≥80%
- Linting passes: `npm run lint`
