# Synergy/DE MCP Server

A read-only Model Context Protocol (MCP) server that exposes Synergy/DE documentation as tools and resources, making it easy to search, retrieve, and browse documentation topics from Cursor and other MCP clients.

## Features

- **Full-text search** across Synergy/DE documentation
- **Topic retrieval** with chunked content optimized for LLM consumption
- **Related topics navigation** (prev, next, parent, related links)
- **Section browsing** to discover topics by category
- **Version support** for different Synergy/DE documentation versions
- **Caching** to minimize network requests
- **Online and local** documentation support

## Prerequisites

- Node.js 18.0.0 or higher (provides built-in `fetch` API for HTTP requests)
- npm or pnpm

## Installation

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   # or
   pnpm install
   ```
3. Build the project:
   ```bash
   npm run build
   ```
4. Copy `.env.example` to `.env` and configure as needed:
   ```bash
   cp .env.example .env
   ```

## Configuration

The server can be configured via environment variables (see `.env.example`):

- `SYNERGYDE_DOC_BASE_URL` - Base URL for online documentation (default: `https://www.synergex.com/docs/`)
- `SYNERGYDE_DOC_DEFAULT_VERSION` - Default version to use (default: `"latest"`)
- `SYNERGYDE_LOCAL_DOC_PATH` - Optional path to local documentation directory
- `SYNERGYDE_CACHE_DIR` - Directory for caching parsed topics (default: `./cache`)
- `LOG_LEVEL` - Logging level: `debug`, `info`, `warn`, or `error` (default: `info`)

## Usage

### Running the Server

```bash
npm start
```

The server uses stdio transport and is designed to be launched by MCP clients like Cursor.

### Cursor Configuration

Add this to your Cursor MCP configuration:

```json
{
  "mcpServers": {
    "synergyde-docs": {
      "command": "node",
      "args": ["/path/to/synergyde-mcp/dist/server.js"],
      "env": {
        "SYNERGYDE_DOC_DEFAULT_VERSION": "latest"
      }
    }
  }
}
```

## Development

```bash
# Build TypeScript
npm run build

# Watch mode for development
npm run dev

# Run linter
npm run lint

# Fix linting issues
npm run lint:fix

# Type checking
npm run typecheck

# Run tests
npm test
```

## Project Structure

```
src/
├── server.ts              # Main MCP server entry point
├── types.ts              # TypeScript type definitions
├── config.ts             # Configuration and environment variables
└── lib/
    ├── providers/        # Documentation providers (online/local)
    ├── parser/           # HTML parsing and chunking
    ├── search/           # Search index implementation
    ├── cache/            # Disk caching layer
    └── utils/            # Utilities (logger, errors)
```

## License

MIT

