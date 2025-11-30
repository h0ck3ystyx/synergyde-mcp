# Manual Testing Guide

This document outlines manual testing procedures for the Synergy/DE MCP Server.

## Prerequisites

1. Build the project:
   ```bash
   npm run build
   ```

2. Ensure you have a `.env` file configured (or use defaults)

3. For testing with Cursor, ensure Cursor is installed and configured

## Testing with Real Synergy/DE Docs Site

### 1. Test Online Provider

Start the server:
```bash
npm start
```

The server should:
- Initialize successfully
- Log "MCP server started and connected to stdio transport"
- Not exit immediately (it waits for MCP requests)

### 2. Test All Tools

#### Test `search_docs` Tool

Using an MCP client or manual JSON-RPC calls:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "search_docs",
    "arguments": {
      "query": "variables",
      "version": "latest",
      "limit": 5
    }
  }
}
```

**Expected:**
- Returns array of search results
- Each result has: topic_id, title, section, version, url, summary, source, score
- Results are ranked by relevance

#### Test `get_topic` Tool

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "get_topic",
    "arguments": {
      "topic_id": "Language/variables.htm",
      "version": "latest",
      "max_chunks": 3
    }
  }
}
```

**Expected:**
- Returns Topic object with full metadata
- Contains body_chunks array (limited to max_chunks)
- Includes links array with navigation

#### Test `get_related_topics` Tool

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "get_related_topics",
    "arguments": {
      "topic_id": "Language/variables.htm",
      "version": "latest"
    }
  }
}
```

**Expected:**
- Returns RelatedTopics object
- Contains previous, next, parent (if available)
- Contains related array with related topics

#### Test `list_section_topics` Tool

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "list_section_topics",
    "arguments": {
      "section": "Language",
      "version": "latest",
      "limit": 10
    }
  }
}
```

**Expected:**
- Returns array of topic summaries
- Each summary has: topic_id, title, url, summary
- Limited to specified limit

#### Test `describe_docs` Tool

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "tools/call",
  "params": {
    "name": "describe_docs",
    "arguments": {}
  }
}
```

**Expected:**
- Returns DocMetadata object
- Contains versions array
- Contains sections array
- Contains source type

### 3. Test Resources

#### Test Topic Resource

Request resource:
```
synergyde:topic/Language/variables.htm
```

**Expected:**
- Returns plain text content
- Includes metadata header (title, section, version, URL, path, source)
- Includes summary
- Includes body content (respects ~8k token budget)
- Includes truncation notice if content was limited

#### Test Section Resource

Request resource:
```
synergyde:section/latest/Language
```

**Expected:**
- Returns plain text index
- Includes header with section name, version, total topics
- Lists topics with titles, IDs, URLs, summaries
- Respects ~8k token budget
- Includes truncation notice if index was limited

### 4. Test Caching Behavior

1. Fetch a topic using `get_topic`
2. Check that `cache/` directory is created
3. Check that topic is cached: `cache/latest/Language/variables.htm.json`
4. Fetch the same topic again
5. Verify cache is used (check logs for "Topic found in cache")

### 5. Test Error Cases

#### Network Failures

1. Disconnect from internet
2. Try to fetch a topic
3. **Expected:** Returns `NETWORK_ERROR` with `retryable: true`

#### Invalid Topics

```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "tools/call",
  "params": {
    "name": "get_topic",
    "arguments": {
      "topic_id": "nonexistent/topic.htm"
    }
  }
}
```

**Expected:**
- Returns `TOPIC_NOT_FOUND` error
- Includes topic_id and version in details
- `retryable: false`

#### Invalid Sections

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "tools/call",
  "params": {
    "name": "list_section_topics",
    "arguments": {
      "section": "NonexistentSection"
    }
  }
}
```

**Expected:**
- Returns `SECTION_NOT_FOUND` error
- Includes section and version in details
- May include available_sections in details

#### Invalid Input

```json
{
  "jsonrpc": "2.0",
  "id": 8,
  "method": "tools/call",
  "params": {
    "name": "search_docs",
    "arguments": {
      "query": "",
      "limit": -1
    }
  }
}
```

**Expected:**
- Returns `INVALID_INPUT` error
- Includes field, value, and reason in details
- `retryable: false`

## Testing with Cursor MCP Integration

### Setup

1. Add to Cursor MCP configuration (`.cursor/mcp.json` or global config):
   ```json
   {
     "mcpServers": {
       "synergyde-docs": {
         "command": "node",
         "args": ["/path/to/synergyde-mcp/dist/server.js"],
         "env": {
           "SYNERGYDE_DOC_BASE_URL": "https://www.synergex.com/docs/",
           "SYNERGYDE_DOC_DEFAULT_VERSION": "latest"
         }
       }
     }
   }
   ```

2. Restart Cursor

3. Verify server is connected:
   - Check Cursor's MCP server status
   - Server should show as "connected"

### Test in Cursor

1. **Search for documentation:**
   - Ask Cursor: "Search for information about variables in Synergy"
   - Cursor should use `search_docs` tool
   - Should return relevant topics

2. **Get specific topic:**
   - Ask Cursor: "Get the documentation for Synergy variables"
   - Cursor should use `get_topic` tool
   - Should return full topic content

3. **Browse related topics:**
   - After getting a topic, ask: "What topics are related to this?"
   - Cursor should use `get_related_topics` tool
   - Should return navigation links

4. **List section topics:**
   - Ask: "List all topics in the Language section"
   - Cursor should use `list_section_topics` tool
   - Should return topic summaries

5. **Access resources:**
   - Cursor should be able to access `synergyde:topic/...` and `synergyde:section/...` resources
   - Resources should appear in Cursor's context

## Verification Checklist

- [ ] Server starts without errors
- [ ] All 5 tools respond correctly
- [ ] Topic and section resources work
- [ ] Caching creates files in `cache/` directory
- [ ] Cache is used on subsequent requests
- [ ] Search returns relevant results
- [ ] Error cases return proper error payloads
- [ ] Network errors are marked as retryable
- [ ] Invalid inputs return INVALID_INPUT errors
- [ ] Cursor MCP integration works
- [ ] Resources are accessible in Cursor
- [ ] Token budgets are respected (~8k tokens)

## Troubleshooting

### Server won't start
- Check Node.js version (requires 18+)
- Verify dependencies are installed: `npm install`
- Check for TypeScript errors: `npm run build`

### Tools return errors
- Check network connectivity (for online provider)
- Verify topic IDs are correct
- Check logs for detailed error messages

### Cache not working
- Verify `SYNERGYDE_CACHE_DIR` is writable
- Check file permissions on cache directory
- Look for cache errors in logs

### Cursor integration issues
- Verify MCP configuration is correct
- Check Cursor's MCP server logs
- Ensure server path is absolute
- Restart Cursor after configuration changes

